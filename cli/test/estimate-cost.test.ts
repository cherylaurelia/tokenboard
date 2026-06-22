import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost } from "../src/cost/estimate-cost.js";
import type { PriceTable } from "../src/cost/price-table.js";

// MUST-TEST #2 — the offline cost engine. Fixture table mirrors real LiteLLM shapes:
// - opus-4-8: all fields incl. distinct 5m and 1h cache-write costs (verified live).
// - "five-min-only": has 5m cache-write but NO _above_1hr (claude-4-opus-20250514 shape).
// - "openai-style": no cache fields at all (gpt-5 shape).
const prices: PriceTable = {
  "claude-opus-4-8": {
    input_cost_per_token: 0.000005,
    output_cost_per_token: 0.000025,
    cache_read_input_token_cost: 0.0000005,
    cache_creation_input_token_cost: 0.00000625,
    cache_creation_input_token_cost_above_1hr: 0.00001,
  },
  "five-min-only": {
    input_cost_per_token: 0.000005,
    cache_creation_input_token_cost: 0.00001875,
  },
  "openai-style": {
    input_cost_per_token: 0.00000125,
    output_cost_per_token: 0.00001,
  },
};

test("4-bucket math: opus-4-8 verified example", () => {
  // input 10718, output 467, cacheRead 14830, cw5m 6374, cw1h 0 -> 0.1125175 (live-verified)
  const { costUsd, priced } = estimateCost(
    { model: "claude-opus-4-8", input: 10718, output: 467, cacheRead: 14830, cacheCreate5m: 6374, cacheCreate1h: 0 },
    prices,
  );
  assert.equal(priced, true);
  assert.ok(Math.abs(costUsd - 0.1125175) < 1e-9, `expected ~0.1125175, got ${costUsd}`);
});

test("1h cache writes use the _above_1hr (2x) field, not the 5m rate", () => {
  const { costUsd } = estimateCost(
    { model: "claude-opus-4-8", input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 1_000_000 },
    prices,
  );
  assert.ok(Math.abs(costUsd - 1_000_000 * 0.00001) < 1e-6); // 2x field, = 10
});

test("1h fallback: a model with no _above_1hr falls back to the 5m field, not free", () => {
  const { costUsd } = estimateCost(
    { model: "five-min-only", input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 1_000_000 },
    prices,
  );
  assert.ok(Math.abs(costUsd - 1_000_000 * 0.00001875) < 1e-6); // 18.75, falls back to 5m field
});

test("absent cache fields do not throw and contribute 0", () => {
  const { costUsd, priced } = estimateCost(
    { model: "openai-style", input: 1000, output: 500, cacheRead: 999, cacheCreate5m: 999, cacheCreate1h: 999 },
    prices,
  );
  assert.equal(priced, true);
  assert.ok(Math.abs(costUsd - (1000 * 0.00000125 + 500 * 0.00001)) < 1e-9); // cache buckets = 0
});

test("unknown model -> cost 0, priced false (not a crash, not a wrong number)", () => {
  const r = estimateCost(
    { model: "does-not-exist", input: 9999, output: 9999, cacheRead: 9999, cacheCreate5m: 9999, cacheCreate1h: 9999 },
    prices,
  );
  assert.deepEqual(r, { costUsd: 0, priced: false });
});

test("zero counts on a known model -> cost 0, priced true", () => {
  const r = estimateCost(
    { model: "claude-opus-4-8", input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0 },
    prices,
  );
  assert.deepEqual(r, { costUsd: 0, priced: true });
});
