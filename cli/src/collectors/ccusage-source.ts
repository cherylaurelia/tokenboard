import { spawn, spawnSync } from "node:child_process";
import type { NormalizedRecord } from "@tokenboard/contracts";
import { CCUSAGE_SOURCES } from "./ccusage-sources.js";
import { ccusageDailyToRecords, type CcusageDailyRow } from "./ccusage-map.js";

const SPAWN_TIMEOUT_MS = 30_000;

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

// Run one source: `npx -y ccusage@20 <source> daily --json --offline`.
// argv array (never a shell string) + a frozen source list = no injection surface.
// Pinned @20 forever (the v15->v20 JS->Rust rewrite was a breaking output-contract
// change; never @latest). A node-side SIGKILL guards the no-`timeout`-on-macOS case.
function runSource(source: string): Promise<CcusageDailyRow[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["-y", "ccusage@20", source, "daily", "--json", "--offline"]);
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
        reject(new Error(`ccusage ${source} exited ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { daily?: CcusageDailyRow[] };
        resolve(parsed.daily ?? []);
      } catch (err) {
        reject(err as Error);
      }
    });
  });
}

// Collect the long-tail across all sources, each isolated: one failing source (non-zero
// exit, timeout, ENOENT, parse error, empty data) is skipped, never aborting the run.
export async function collectCcusage(): Promise<CcusageResult> {
  if (!hasNpx()) {
    return { records: [], skipped: [], npxAvailable: false };
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
