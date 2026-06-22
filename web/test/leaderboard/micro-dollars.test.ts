import { test } from "node:test";
import assert from "node:assert/strict";
import { costUsdStringToMicros, microsToUsd2dp } from "@/lib/redis/micro-dollars";

test("string -> micros is exact (no float)", () => {
  assert.equal(costUsdStringToMicros("38.42"), 38_420_000n);
  assert.equal(costUsdStringToMicros("1762.176792"), 1_762_176_792n);
  assert.equal(costUsdStringToMicros("640"), 640_000_000n);
  assert.equal(costUsdStringToMicros("0"), 0n);
});

test("short fractional digits are zero-padded to 6", () => {
  assert.equal(costUsdStringToMicros("1.5"), 1_500_000n);
});

test("negative values supported", () => {
  assert.equal(costUsdStringToMicros("-1.5"), -1_500_000n);
});

test("non-decimal string throws (fail-loud)", () => {
  assert.throws(() => costUsdStringToMicros("abc"));
  assert.throws(() => costUsdStringToMicros(""));
});

test("micros -> 2dp USD rounds correctly", () => {
  assert.equal(microsToUsd2dp(1_762_176_792n), 1762.18); // round half up at the cent
  assert.equal(microsToUsd2dp(38_420_000), 38.42);
  assert.equal(microsToUsd2dp(0), 0);
  assert.equal(microsToUsd2dp(4_999), 0); // sub-cent rounds to 0
  assert.equal(microsToUsd2dp(5_000), 0.01); // half-cent rounds up
});

test("round-trip string -> micros -> 2dp is stable for 2dp inputs", () => {
  assert.equal(microsToUsd2dp(costUsdStringToMicros("38.42")), 38.42);
});
