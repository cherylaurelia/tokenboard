// Incremental parse cache for the Claude Code collector. Reading + JSON.parsing the full
// ~/.claude/projects tree dominates CLI startup (~3s on a 364MB history) and it grows forever.
// ccusage stays fast by not re-reading unchanged files; this does the same.
//
// SAFETY — why this can't change the headline number:
//   We cache only the FILTERED ParsedLine[] PER FILE, validated by (mtimeMs, size). The global
//   message-id dedup (dedupeByMessageId) still runs over the FULL reassembled set afterward and
//   sorts by (sourcePath, lineIndex) — so identical input files yield byte-identical output
//   whether the lines came from disk or cache. A file whose mtime OR size differs is re-read from
//   scratch (never partially trusted). A corrupt/old/missing cache falls back to a full read.
//   Append-only JSONL means a changed file's size changes, so appends are always caught.
import { readFileSync, statSync } from "node:fs";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { isCountableAssistantLine } from "./claude-code-filter.js";
import type { AssistantUsageLine, ParsedLine } from "./parsed-line.js";

// Bump when the ParsedLine shape or the filter logic changes, so a stale cache from an older CLI
// is discarded wholesale rather than trusted.
const CACHE_VERSION = 1;

interface FileEntry {
  mtimeMs: number;
  size: number;
  lines: ParsedLine[];
}
interface CacheFile {
  version: number;
  files: Record<string, FileEntry>;
}

// Parse one file's text into the filtered ParsedLine[] — the EXACT logic collectClaudeCodeLines
// uses inline, factored out so the cached and uncached paths produce identical lines.
export function parseFileLines(file: string, text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isCountableAssistantLine(parsed)) continue;
    const line = parsed as AssistantUsageLine;
    out.push({
      messageId: line.message.id ?? null,
      model: line.message.model ?? "",
      usage: line.message.usage,
      timestamp: line.timestamp ?? null,
      sourcePath: file,
      lineIndex: i,
    });
  }
  return out;
}

function cachePath(configDir: string): string {
  return join(configDir, "parse-cache.json");
}

function loadCache(configDir: string): CacheFile {
  try {
    const c = JSON.parse(readFileSync(cachePath(configDir), "utf8")) as CacheFile;
    if (c.version !== CACHE_VERSION || typeof c.files !== "object" || c.files === null) {
      return { version: CACHE_VERSION, files: {} };
    }
    return c;
  } catch {
    return { version: CACHE_VERSION, files: {} }; // missing/corrupt -> empty, full re-read
  }
}

// Best-effort atomic write (temp-in-same-dir + rename). A failed write must never fail the run —
// the cache is an optimization, not a source of truth.
function saveCache(configDir: string, cache: CacheFile): void {
  try {
    mkdirSync(configDir, { recursive: true });
    const tmp = join(configDir, `.parse-cache.json.${randomBytes(6).toString("hex")}.tmp`);
    writeFileSync(tmp, JSON.stringify(cache), "utf8");
    renameSync(tmp, cachePath(configDir));
  } catch {
    // ignore — next run just re-reads
  }
}

// Cached variant of reading one file: reuse stored lines when (mtimeMs, size) match, else re-read.
// Mutates `next` (the cache being rebuilt for this run) so only files seen this run are retained —
// deleted files naturally drop out, keeping the cache from growing unbounded.
function linesForFile(file: string, prev: CacheFile, next: CacheFile): ParsedLine[] {
  let st: { mtimeMs: number; size: number };
  try {
    const s = statSync(file);
    st = { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return []; // unreadable — skip (matches collectClaudeCodeLines fail-soft)
  }
  const hit = prev.files[file];
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    next.files[file] = hit; // carry forward unchanged
    return hit.lines;
  }
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const lines = parseFileLines(file, text);
  next.files[file] = { mtimeMs: st.mtimeMs, size: st.size, lines };
  return lines;
}

// Read every file via the cache. `files` is the discovered .jsonl list (caller walks the tree).
// Returns the same ParsedLine[] collectClaudeCodeLines would, then persists the refreshed cache.
export function collectClaudeCodeLinesCached(files: string[], configDir: string): ParsedLine[] {
  const prev = loadCache(configDir);
  const next: CacheFile = { version: CACHE_VERSION, files: {} };
  const out: ParsedLine[] = [];
  for (const file of files) out.push(...linesForFile(file, prev, next));
  saveCache(configDir, next);
  return out;
}
