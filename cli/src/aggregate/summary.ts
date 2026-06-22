import type { NormalizedRecord } from "@tokenboard/contracts";
import { estimateCost, type PriceTable } from "@tokenboard/cost";

// LocalSummary is render input, NOT a wire contract — it never leaves the machine and
// has no contracts dependency. Cost fields are FULL-PRECISION floats; round only at
// display (IMPLEMENTATION §2.4 — never round per-record before summing).
export interface LocalSummary {
  totalTokens: number;
  totalCostUsd: number;
  anyUnpriced: boolean;
  unpricedTokens: number;
  unpricedModels: string[];
  perDay: { date: string; tokens: number }[]; // daily-burn series (sparkline + headline)
  perTool: { tool: string; tokens: number; costUsd: number }[]; // local board rows
  perModel: { model: string; tokens: number; costUsd: number; priced: boolean }[];
}

function recordTokens(r: NormalizedRecord): number {
  return r.input + r.output + r.cacheRead + r.cacheCreate5m + r.cacheCreate1h;
}

// PURE: aggregate records + prices into everything the renderer and headline need.
// `records` should already be aggregateByKey'd (one row per date/tool/model).
export function summarize(records: NormalizedRecord[], prices: PriceTable): LocalSummary {
  let totalTokens = 0;
  let totalCostUsd = 0;
  let unpricedTokens = 0;
  const unpricedModels = new Set<string>();

  const perDay = new Map<string, number>();
  const perTool = new Map<string, { tokens: number; costUsd: number }>();
  const perModel = new Map<string, { tokens: number; costUsd: number; priced: boolean }>();

  for (const r of records) {
    const tokens = recordTokens(r);
    const { costUsd, priced } = estimateCost(r, prices);

    totalTokens += tokens;
    totalCostUsd += costUsd;
    if (!priced) {
      unpricedTokens += tokens;
      unpricedModels.add(r.model);
    }

    perDay.set(r.date, (perDay.get(r.date) ?? 0) + tokens);

    const t = perTool.get(r.tool) ?? { tokens: 0, costUsd: 0 };
    t.tokens += tokens;
    t.costUsd += costUsd;
    perTool.set(r.tool, t);

    const m = perModel.get(r.model) ?? { tokens: 0, costUsd: 0, priced };
    m.tokens += tokens;
    m.costUsd += costUsd;
    m.priced = m.priced && priced;
    perModel.set(r.model, m);
  }

  return {
    totalTokens,
    totalCostUsd,
    anyUnpriced: unpricedModels.size > 0,
    unpricedTokens,
    unpricedModels: [...unpricedModels].sort(),
    perDay: [...perDay.entries()].map(([date, tokens]) => ({ date, tokens })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    perTool: [...perTool.entries()].map(([tool, v]) => ({ tool, ...v })).sort((a, b) => b.tokens - a.tokens),
    perModel: [...perModel.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.tokens - a.tokens),
  };
}
