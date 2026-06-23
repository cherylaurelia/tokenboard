import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NormalizedRecord } from "@tokenboard/contracts";
import { CCUSAGE_SOURCES } from "./ccusage-sources.js";
import { ccusageDailyToRecords, type CcusageDailyRow } from "./ccusage-map.js";

const SPAWN_TIMEOUT_MS = 30_000;

// We pin ccusage to this MAJOR forever — the v15->v20 JS->Rust rewrite changed the output contract
// (and v15 may be co-resident in npm's cache). Anything not exactly this major must NOT be exec'd.
const CCUSAGE_MAJOR = 20;

// Claude Code is the FIRST-PARTY collector; it must never be routed through ccusage too (that would
// double-count the same (date, claude-code, model) keys). ccusage tags its rows' metadata.agents
// with this name for Claude Code, so we use it to recognize "claude-only" machines.
const CLAUDE_AGENT = "claude";

// FAST PATH: `npx -y ccusage@20` re-resolves the package every run (~1.8s of pure overhead, the
// entire remaining cost of the preview). When npx has ALREADY cached a v20 ccusage (the warm/common
// case), exec its JS entry directly via this Node — ~0.1s, same output. We launch the package's `bin`
// JS file with process.execPath (NOT the .bin symlink or the native arch shim) so there is no
// shebang / exec-bit / shell / arch dependence (works on Windows too). VERSION-GATED to major===20 so
// a co-cached v15 (different contract) is never run. Returns null (=> npx fallback) on ANY doubt:
// cold cache, only-v15 cached, unreadable/malformed package.json, missing bin. Correctness over speed.
export function resolveCachedCcusageV20(npxCache = join(homedir(), ".npm", "_npx")): string | null {
  try {
    for (const hash of readdirSync(npxCache)) {
      const pkgDir = join(npxCache, hash, "node_modules", "ccusage");
      let pkg: { version?: unknown; bin?: unknown };
      try {
        pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as typeof pkg;
      } catch {
        continue; // no ccusage here / unreadable -> next cache dir
      }
      if (typeof pkg.version !== "string") continue;
      const major = Number.parseInt(pkg.version.split(".")[0] ?? "", 10);
      if (major !== CCUSAGE_MAJOR) continue; // reject v15 etc. — wrong output contract
      // bin can be a string or { ccusage: "path" }. Resolve the cli JS relative to the package dir.
      const binField = pkg.bin;
      const binRel =
        typeof binField === "string"
          ? binField
          : typeof binField === "object" && binField !== null
            ? (binField as Record<string, unknown>)["ccusage"]
            : undefined;
      if (typeof binRel !== "string") continue;
      return join(pkgDir, binRel);
    }
  } catch {
    // ~/.npm/_npx absent (cold machine) or unreadable -> fall back to npx.
  }
  return null;
}

export interface CcusageResult {
  records: NormalizedRecord[];
  skipped: string[]; // sources that failed/errored — surfaced as an honest dim footer note
  npxAvailable: boolean;
}

// Is `npx` resolvable? If not, we skip the entire long-tail phase (Claude Code still
// renders). No auto-install, no prompt in Phase 2.
function hasNpx(): boolean {
  try {
    const r = spawnSync("npx", ["--version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

// Resolve ONCE per process (the cache doesn't change mid-run) — null => use npx. Lazily computed so
// the readdir cost is paid at most once even across the probe + 8 fan-out calls.
let cachedBinPath: string | null | undefined; // undefined = not yet resolved
function ccusageV20Bin(): string | null {
  if (cachedBinPath === undefined) cachedBinPath = resolveCachedCcusageV20();
  return cachedBinPath;
}

// Run `ccusage@20 <args...>` -> resolved stdout. Launches the cached v20 binary directly via this
// Node when available (~0.1s), else `npx -y ccusage@20` (~1.8s, cold/uncached). BOTH branches go
// through the SAME spawn body so the 30s SIGKILL + reject-on-error/nonzero semantics are identical
// — a hung direct binary can't hang the preview. argv array (never a shell string) = no injection.
function runCcusage(args: string[]): Promise<string> {
  const bin = ccusageV20Bin();
  const [cmd, cmdArgs] = bin ? [process.execPath, [bin, ...args]] : ["npx", ["-y", "ccusage@20", ...args]];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    const killer = setTimeout(() => child.kill("SIGKILL"), SPAWN_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(killer);
      reject(err); // ENOENT etc.
    });
    child.on("close", (code) => {
      clearTimeout(killer);
      if (code !== 0) {
        reject(new Error(`ccusage ${args.join(" ")} exited ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

// Run one source: `ccusage <source> daily --json --offline` -> that source's daily rows.
function runSource(source: string): Promise<CcusageDailyRow[]> {
  return runCcusage([source, "daily", "--json", "--offline"]).then((stdout) => {
    const parsed = JSON.parse(stdout) as { daily?: CcusageDailyRow[] };
    return parsed.daily ?? [];
  });
}

// ONE combined `ccusage daily` call. Its rows are aggregated (agent:"all", no per-tool attribution)
// so we CAN'T use its numbers — but each row's metadata.agents lists which agents actually have data.
// We return the UNION of those agent names (lowercased), or null to mean "uncertain — fan out fully".
//
// FAIL-SAFE on ambiguity: null is returned not only on spawn/parse/timeout failure, but ALSO when the
// probe SUCCEEDS with data-bearing rows yet NONE yields a parseable metadata.agents array. An empty
// agent set in that case is indistinguishable from a genuinely claude-only machine, and treating it
// as claude-only would fast-skip the fan-out and silently drop real long-tail data. So we only return
// an EMPTY set when there were genuinely no rows (a truly empty machine — fan-out also yields nothing,
// so the fast path is safe); otherwise rows-without-agents -> null -> full fan-out.
// PURE: extract the union of lowercased agent names from a parsed combined-daily payload, applying
// the fail-safe ambiguity rule. Returns null ("uncertain -> fan out fully") when rows are present but
// none carried a parseable metadata.agents array; an empty set ONLY for a genuinely row-less payload.
// Exported for unit tests that pin the ccusage@20 metadata.agents contract this fast path depends on.
export function agentsFromDailyPayload(parsed: unknown): Set<string> | null {
  const rows =
    typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { daily?: unknown }).daily)
      ? ((parsed as { daily: Array<{ metadata?: { agents?: unknown } }> }).daily)
      : [];
  const agents = new Set<string>();
  for (const row of rows) {
    const list = row?.metadata?.agents;
    if (Array.isArray(list)) for (const a of list) if (typeof a === "string") agents.add(a.toLowerCase());
  }
  // Rows present but we parsed zero agents -> the metadata contract we depend on isn't being met.
  // Don't trust the empty set; force the full fan-out so we never silently under-count.
  if (rows.length > 0 && agents.size === 0) return null;
  return agents;
}

async function detectAgentsWithData(): Promise<Set<string> | null> {
  try {
    const stdout = await runCcusage(["daily", "--json", "--offline"]);
    return agentsFromDailyPayload(JSON.parse(stdout));
  } catch {
    return null;
  }
}

// PURE fast-path decision: skip the 8-spawn fan-out ONLY when the probe gave a definite agent set
// (non-null) AND that set contains nothing but Claude Code. null (probe failed / ambiguous) or ANY
// non-claude agent (recognized OR an unknown future rename) -> false -> fan out fully. This is the
// single guard that makes the optimization provably unable to under-count. Exported for tests.
export function canSkipFanOut(agents: Set<string> | null): boolean {
  if (agents === null) return false;
  return [...agents].every((a) => a === CLAUDE_AGENT);
}

// Collect the long-tail across all sources, each isolated: one failing source (non-zero exit,
// timeout, ENOENT, parse error, empty data) is skipped, never aborting the run.
//
// FAST PATH: one combined probe call discovers which agents have data. If the ONLY agent present is
// Claude Code (the common case — most machines run only Claude Code), every per-source call would
// return empty, so we skip the entire 8-spawn fan-out (~22s -> ~2s). The probe is authoritative: the
// combined call aggregates EVERY agent, so if a non-claude tool isn't listed it provably has no data.
// We only take the fast path on a SUCCESSFUL probe whose non-claude set is empty; any non-claude
// agent present (or a failed/uncertain probe) falls back to the full per-source fan-out — identical
// to the prior behavior — so we can never under-count. The probe also warms the npx cache for the
// fan-out.
export async function collectCcusage(): Promise<CcusageResult> {
  // We can run ccusage if a cached v20 binary exists (fast path) OR npx can fetch it. If neither,
  // skip the long-tail entirely (Claude Code still renders) — the documented no-npx behavior.
  if (ccusageV20Bin() === null && !hasNpx()) {
    return { records: [], skipped: [], npxAvailable: false };
  }

  const agents = await detectAgentsWithData();
  if (canSkipFanOut(agents)) {
    // Provably nothing for the long-tail sources -> skip the fan-out entirely.
    return { records: [], skipped: [], npxAvailable: true };
  }

  const records: NormalizedRecord[] = [];
  const skipped: string[] = [];

  await Promise.all(
    CCUSAGE_SOURCES.map(async (source) => {
      try {
        const daily = await runSource(source);
        records.push(...ccusageDailyToRecords(source, daily));
      } catch {
        skipped.push(source);
      }
    }),
  );

  return { records, skipped, npxAvailable: true };
}
