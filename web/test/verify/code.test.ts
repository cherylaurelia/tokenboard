import { test } from "node:test";
import assert from "node:assert/strict";
import { mintOtpCode, hashOtp, constantTimeEqualBytea } from "@/lib/verify/code";

// IMPLEMENTATION §5 must-test: §5.3 code mint + hash. The hash is salted per (user, DOMAIN) so two
// domains can't collide on the global code_hash UNIQUE.

test("mintOtpCode is always 6 digits", () => {
  for (let i = 0; i < 2000; i++) {
    assert.match(mintOtpCode(), /^[0-9]{6}$/);
  }
});

test("hashOtp is deterministic for the same user+domain+code", () => {
  const a = hashOtp("user-1", "acme-corp.com", "123456");
  const b = hashOtp("user-1", "acme-corp.com", "123456");
  assert.ok(constantTimeEqualBytea(a, b));
});

test("hashOtp differs by user, by DOMAIN, and by code", () => {
  const base = hashOtp("user-1", "acme-corp.com", "123456");
  assert.equal(constantTimeEqualBytea(base, hashOtp("user-2", "acme-corp.com", "123456")), false);
  assert.equal(constantTimeEqualBytea(base, hashOtp("user-1", "other-co.com", "123456")), false);
  assert.equal(constantTimeEqualBytea(base, hashOtp("user-1", "acme-corp.com", "654321")), false);
});

test("constantTimeEqualBytea returns false (no throw) on length mismatch", () => {
  assert.equal(constantTimeEqualBytea(Buffer.from("ab"), Buffer.from("abc")), false);
});
