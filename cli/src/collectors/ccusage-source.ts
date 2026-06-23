import { spawn, spawnSync } from "node:child_process";
import type { NormalizedRecord } from "@tokenboard/contracts";
import { CCUSAGE_SOURCES } from "./ccusage-sources.js";
import { ccusageDailyToRecords, type CcusageDailyRow } from "./ccusage-map.js";

const SPAWN_TIMEOUT_MS = 30_000;

// Claude Code is the FIRST-PARTY collector; it must never be routed through ccusage too (that would
// double-count the same (date, claude-code, model) keys). ccusage tags its rows' metadata.agents
// with this name for Claude Code, so we use it to recognize "claude-only" machines.
const CLAUDE_AGENT = "claude";

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

// Generic `npx -y ccusage@20 <args...>` spawn -> resolved stdout. argv array (never a shell string)
// = no injection surface. Pinned @20 forever (the v15->v20 JS->Rust rewrite was a breaking
// output-contract change; never @latest). A node-side SIGKILL guards the no-`timeout`-on-macOS case.
// stderr IGNORED (we don't drain it; a chatty child filling an undrained pipe could block + get
// wrongly SIGKILL'd). Rejects on non-zero exit / spawn error / timeout.
function runCcusage(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["-y", "ccusage@20", ...args], { stdio: ["ignore", "pipe", "ignore"] });
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
  if (!hasNpx()) {
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
