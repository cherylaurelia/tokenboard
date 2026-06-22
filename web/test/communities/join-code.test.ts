import { test } from "node:test";
import assert from "node:assert/strict";
import { mintJoinCode } from "@/lib/communities/join-code";

// IMPLEMENTATION §5: the join code must be exactly 6 chars from the ambiguity-safe alphabet (no
// 0/O/1/I/L) — guards against a char(6) trailing-space padding mismatch on join.

test("mintJoinCode is always 6 chars of the ambiguity-safe alphabet", () => {
  for (let i = 0; i < 5000; i++) {
    assert.match(mintJoinCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  }
});

test("mintJoinCode varies (not a constant)", () => {
  const set = new Set(Array.from({ length: 50 }, () => mintJoinCode()));
  assert.ok(set.size > 1);
});
