import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isCountableAssistantLine } from "./claude-code-filter.js";
import type { AssistantUsageLine, ParsedLine } from "./parsed-line.js";

// Recursively collect *.jsonl paths under `dir`. Hand-rolled (depth-first) rather than
// `readdirSync(dir, { recursive: true })` because that option only exists on Node
// >=18.17/>=20.1 — our declared engine is >=18, so a hand walk is the 18.x-safe form.
// Unreadable subdirs are skipped (defensive), never thrown.
function findJsonlFiles(dir: string): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findJsonlFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

// I/O EDGE: discover every Claude Code session transcript under the projects root, read
// each, parse line-by-line, keep only countable assistant-usage lines, and annotate each
// with provenance (sourcePath + lineIndex) for deterministic downstream dedup.
//
// Fail-soft: a missing root returns [] (no logs is not an error); an unparseable line is
// skipped (defensive — 0 found live, but a truncated tail-write shouldn't crash a run).
export function collectClaudeCodeLines(projectsRoot: string): ParsedLine[] {
  const files = findJsonlFiles(projectsRoot); // [] if root absent — no Claude Code logs

  const out: ParsedLine[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable file — skip, keep going
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue; // malformed line — skip
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
  }
  return out;
}
