import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cliLoginStartResponseSchema,
  cliLoginPollResponseSchema,
  cliLoginApproveRequestSchema,
} from "@tokenboard/contracts";

// Proves the CLI and server agree on the claim wire shape (single source of truth).

test("start response validates", () => {
  const r = cliLoginStartResponseSchema.safeParse({
    device_code: "abc",
    user_code: "WXYZ-1234",
    verification_url: "http://localhost:3000/claim?code=WXYZ-1234",
    interval: 5,
    expires_in: 600,
  });
  assert.ok(r.success);
});

test("poll discriminated union: each non-terminal/terminal status parses", () => {
  for (const status of ["pending", "slow_down", "denied", "expired"] as const) {
    assert.ok(cliLoginPollResponseSchema.safeParse({ status }).success, status);
  }
});

test("poll 'complete' requires ingest_token + userId + user.handle", () => {
  const ok = cliLoginPollResponseSchema.safeParse({
    status: "complete",
    ingest_token: "tbd_xyz",
    userId: "u-1",
    user: { handle: "devon" },
  });
  assert.ok(ok.success);
  // missing ingest_token -> fails
  const bad = cliLoginPollResponseSchema.safeParse({ status: "complete", userId: "u-1", user: { handle: "devon" } });
  assert.equal(bad.success, false);
});

test("approve request enforces exactly-9-char user_code + action enum", () => {
  assert.ok(cliLoginApproveRequestSchema.safeParse({ user_code: "WXYZ-1234", action: "approve" }).success);
  assert.equal(cliLoginApproveRequestSchema.safeParse({ user_code: "WXYZ-1234", action: "nope" }).success, false);
  assert.equal(cliLoginApproveRequestSchema.safeParse({ user_code: "SHORT", action: "deny" }).success, false);
});
