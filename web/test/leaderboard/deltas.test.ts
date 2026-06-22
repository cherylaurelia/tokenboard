import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDelta } from "@/lib/leaderboard/deltas";

test("climbed -> direction up, positive rankChange", () => {
  const d = computeDelta({ curScore: 1200, prevScore: 1000, curRank: 1, prevRank: 3 });
  assert.equal(d.direction, "up");
  assert.equal(d.rankChange, 2);
  assert.equal(d.tokensChange, 200);
  assert.equal(d.pct, 20);
});

test("dropped -> direction down, negative rankChange", () => {
  const d = computeDelta({ curScore: 900, prevScore: 1000, curRank: 4, prevRank: 2 });
  assert.equal(d.direction, "down");
  assert.equal(d.rankChange, -2);
  assert.equal(d.tokensChange, -100);
});

test("same rank -> flat", () => {
  assert.equal(computeDelta({ curScore: 10, prevScore: 9, curRank: 5, prevRank: 5 }).direction, "flat");
});

test("no prev snapshot -> new (zeros)", () => {
  const d = computeDelta({ curScore: 500, prevScore: null, curRank: 7, prevRank: null });
  assert.deepEqual(d, { rankChange: 0, tokensChange: 0, pct: 0, direction: "new" });
});

test("pct guarded when prev <= 0", () => {
  assert.equal(computeDelta({ curScore: 100, prevScore: 0, curRank: 1, prevRank: 1 }).pct, 0);
});

test("cost-board delta is in 2dp dollar units (caller passes dollars, matches the cost field)", () => {
  // curScore/prevScore are the DISPLAY-unit dollars, so tokensChange is dollars (~8.42), not
  // micro-dollars (~8.42e6). Float subtraction, so assert within a cent.
  const d = computeDelta({ curScore: 38.42, prevScore: 30.0, curRank: 1, prevRank: 2 });
  assert.ok(Math.abs(d.tokensChange - 8.42) < 0.005, `expected ~8.42 dollars, got ${d.tokensChange}`);
});
