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
  // daily breakdown rows. `model` = the dominant model that day (most tokens), shown as a table column.
  perDay: { date: string; tokens: number; costUsd: number; model: string }[];
  perTool: { tool: string; tokens: number; costUsd: number }[]; // local board rows
  perModel: { model: string; tokens: number; costUsd: number; priced: boolean }[];
}

function recordTokens(r: NormalizedRecord): number {
  return r.input + r.output + r.cacheRead + r.cacheCreate5m + r.cacheCreate1h;
}

// The model with the most tokens in a day's per-model map (ties broken by name for determinism).
function dominantModel(byModel: Map<string, number>): string {
  let best = "";
  let bestTokens = -1;
  for (const [model, tokens] of byModel) {
    if (tokens > bestTokens || (tokens === bestTokens && model < best)) {
      best = model;
      bestTokens = tokens;
    }
  }
  return best;
}

// PURE: aggregate records + prices into everything the renderer and headline need.
// `records` should already be aggregateByKey'd (one row per date/tool/model).
export function summarize(records: NormalizedRecord[], prices: PriceTable): LocalSummary {
  let totalTokens = 0;
  let totalCostUsd = 0;
  let unpricedTokens = 0;
  const unpricedModels = new Set<string>();

  // Per day we track the running total + per-model tokens, so we can name the dominant model.
  const perDay = new Map<string, { tokens: number; costUsd: number; byModel: Map<string, number> }>();
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

    const d = perDay.get(r.date) ?? { tokens: 0, costUsd: 0, byModel: new Map<string, number>() };
    d.tokens += tokens;
    d.costUsd += costUsd;
    d.byModel.set(r.model, (d.byModel.get(r.model) ?? 0) + tokens);
    perDay.set(r.date, d);

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
    perDay: [...perDay.entries()]
      .map(([date, v]) => ({ date, tokens: v.tokens, costUsd: v.costUsd, model: dominantModel(v.byModel) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    perTool: [...perTool.entries()].map(([tool, v]) => ({ tool, ...v })).sort((a, b) => b.tokens - a.tokens),
    perModel: [...perModel.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.tokens - a.tokens),
  };
}
