import type { PriceTable } from "./price-table";

// MUST-TEST #2 — the cost engine. Pure: (counts + model, priceTable) -> estimate.
//
// ONE implementation shared by the CLI (cosmetic local preview, ARCH §4.3) AND the server
// (authoritative cost at sync, ARCH §6.4 step 7) — so the board can never disagree with the
// local "~$" by more than a price-table version. @tokenboard/cost has NO contracts/zod dep
// (keeps the CLI self-containment gate to zod + node builtins), so it declares its own
// structurally-identical CostCounts. NormalizedRecord is assignable to it (extra fields like
// `date` are fine), so both the CLI summary path and the server compute-cost path type-check.
export interface CostCounts {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
}
//
// LiteLLM ships ABSOLUTE per-token costs (tiny floats), so we multiply counts by the
// fields directly — we do NOT re-derive base*1.25 / base*2 (those multipliers vary by
// model: 30 models break the 1.25x rule, gpt-5's output is 8x). The 5m and 1h cache
// writes are two distinct absolute fields, which is exactly why the cacheCreate5m /
// cacheCreate1h split is load-bearing.
//
// Unknown model (or one with no input price) -> { costUsd: 0, priced: false }. The record
// is NOT dropped; the caller surfaces it as unpriced so the label can hedge honestly.
// 1h fallback: a model with cacheCreate1h>0 but no _above_1hr field falls back to the 5m
// field (closest available) rather than pricing 1h writes free — verified always safe
// (no model has a 1h field without a 5m field).
export function estimateCost(
  counts: CostCounts,
  prices: PriceTable,
): { costUsd: number; priced: boolean } {
  const p = prices[counts.model];
  if (!p || p.input_cost_per_token == null) return { costUsd: 0, priced: false };

  const costUsd =
    counts.input * (p.input_cost_per_token ?? 0) +
    counts.output * (p.output_cost_per_token ?? 0) +
    counts.cacheRead * (p.cache_read_input_token_cost ?? 0) +
    counts.cacheCreate5m * (p.cache_creation_input_token_cost ?? 0) +
    counts.cacheCreate1h *
      (p.cache_creation_input_token_cost_above_1hr ?? p.cache_creation_input_token_cost ?? 0);

  return { costUsd, priced: true };
}
