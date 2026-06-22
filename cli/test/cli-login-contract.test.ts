import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cliLoginStartResponseSchema,
  cliLoginPollResponseSchema,
  cliLoginPollStatusEnvelopeSchema,
  KNOWN_POLL_STATUSES,
  cliLoginApproveRequestSchema,
} from "@tokenboard/contracts";

// Mirrors transport.pollDeviceGrant's decision: strict union, else unknown-status -> pending,
// else fail loud. Kept in the test so the forward-compat contract is pinned.
function classifyPoll(raw: unknown): { kind: "parsed" } | { kind: "keep-polling" } | { kind: "error" } {
  if (cliLoginPollResponseSchema.safeParse(raw).success) return { kind: "parsed" };
  const env = cliLoginPollStatusEnvelopeSchema.safeParse(raw);
  if (env.success && !KNOWN_POLL_STATUSES.includes(env.data.status as (typeof KNOWN_POLL_STATUSES)[number])) {
    return { kind: "keep-polling" };
  }
  return { kind: "error" };
}

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

test("forward-compat: an UNKNOWN future status keeps polling, not crash", () => {
  assert.deepEqual(classifyPoll({ status: "queued_in_some_future_version" }), { kind: "keep-polling" });
});

test("forward-compat: a MALFORMED known status fails loud (not keep-polling)", () => {
  // 'complete' missing its token must NOT be silently treated as keep-polling.
  assert.deepEqual(classifyPoll({ status: "complete", userId: "u-1" }), { kind: "error" });
});

test("forward-compat: well-formed known statuses parse normally", () => {
  assert.deepEqual(classifyPoll({ status: "pending" }), { kind: "parsed" });
  assert.deepEqual(
    classifyPoll({ status: "complete", ingest_token: "tbd_x", userId: "u-1", user: { handle: "devon" } }),
    { kind: "parsed" },
  );
});

test("approve request enforces exactly-9-char user_code + action enum", () => {
  assert.ok(cliLoginApproveRequestSchema.safeParse({ user_code: "WXYZ-1234", action: "approve" }).success);
  assert.equal(cliLoginApproveRequestSchema.safeParse({ user_code: "WXYZ-1234", action: "nope" }).success, false);
  assert.equal(cliLoginApproveRequestSchema.safeParse({ user_code: "SHORT", action: "deny" }).success, false);
});
