import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickStricter,
  rateLimitHeaders,
  retryAfterSeconds,
  resetSeconds,
  type LimitResult,
} from "@/lib/ratelimit/headers";

const r = (success: boolean, limit: number, remaining: number, reset: number): LimitResult => ({
  success,
  limit,
  remaining,
  reset,
});

test("pickStricter chooses the smaller remaining", () => {
  assert.equal(pickStricter([r(true, 120, 50, 1000), r(true, 240, 5, 2000)]).remaining, 5);
});
test("pickStricter tie on remaining -> the larger reset wins", () => {
  assert.equal(pickStricter([r(true, 100, 0, 1000), r(true, 100, 0, 9000)]).reset, 9000);
});
test("resetSeconds converts epoch ms -> ceil seconds", () => {
  assert.equal(resetSeconds(1_700_000_000_500), 1_700_000_001);
});
test("retryAfterSeconds = ceil((reset-now)/1000), floored at 0", () => {
  const now = 1_000_000;
  assert.equal(retryAfterSeconds(now + 4200, now), 5);
  assert.equal(retryAfterSeconds(now - 5000, now), 0);
});
test("rateLimitHeaders floors remaining at 0 and converts reset ms->s", () => {
  const h = rateLimitHeaders(r(false, 120, -3, 1_700_000_000_000));
  assert.equal(h["X-RateLimit-Limit"], "120");
  assert.equal(h["X-RateLimit-Remaining"], "0");
  assert.equal(h["X-RateLimit-Reset"], "1700000000");
});
test("pickStricter throws on empty input (fail loud)", () => {
  assert.throws(() => pickStricter([]));
});
