import type { NormalizedRecord } from "@tokenboard/contracts";
import { canonicalModel } from "../normalize/model-alias.js";
import { canonicalTool } from "../normalize/tool-name.js";

// ccusage@20 `<source> daily --json --offline` output shape (the subset we use).
export interface CcusageModelBreakdown {
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number; // SINGLE combined value — ccusage emits no 5m/1h split
}

export interface CcusageDailyRow {
  date?: string; // already local-day "YYYY-MM-DD" from ccusage
  modelBreakdowns?: CcusageModelBreakdown[];
}

function count(n: number | undefined): number {
  return Math.max(0, Math.trunc(n ?? 0));
}

// Pure: map ccusage daily rows -> NormalizedRecord[] at the modelBreakdowns grain (one
// record per date+source+model). Mapping at the daily-row total would lose the per-model
// split — a single row can carry several models.
//
// ccusage gives no 5m/1h split, so the combined cacheCreationTokens goes entirely into
// cacheCreate5m and cacheCreate1h is 0 — a documented approximation (prices long-tail
// cache writes at the 5m/1.25x rate; only affects non-Claude-Code tools). ccusage's own
// cost is ignored — cost is recomputed from the bundled snapshot.
export function ccusageDailyToRecords(source: string, daily: CcusageDailyRow[]): NormalizedRecord[] {
  const tool = canonicalTool(source);
  const out: NormalizedRecord[] = [];
  for (const row of daily) {
    if (!row.date) continue;
    for (const mb of row.modelBreakdowns ?? []) {
      if (!mb.modelName) continue;
      out.push({
        date: row.date,
        tool,
        model: canonicalModel(mb.modelName),
        input: count(mb.inputTokens),
        output: count(mb.outputTokens),
        cacheRead: count(mb.cacheReadTokens),
        cacheCreate5m: count(mb.cacheCreationTokens), // combined -> 5m bucket
        cacheCreate1h: 0, // documented approximation
      });
    }
  }
  return out;
}
