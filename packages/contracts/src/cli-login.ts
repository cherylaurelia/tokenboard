// @tokenboard/contracts — CLI device-authorization (claim) wire contracts (ARCH §3, §4.3).
// Shared by the server routes (validate) and the CLI (parse). Single source of truth.
import { z } from "zod";

export const cliLoginStartRequestSchema = z.object({
  client_name: z.string().min(1).max(120),
  machine_hash: z.string().min(1).max(128),
});

export const cliLoginStartResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_url: z.string().url(),
  interval: z.number().int().positive(),
  expires_in: z.number().int().positive(),
});
export type CliLoginStartResponse = z.infer<typeof cliLoginStartResponseSchema>;

export const cliLoginPollRequestSchema = z.object({ device_code: z.string().min(1) });

// WIRE statuses = the ARCH §3 routes-table set (pending|slow_down|complete) + the §4.3-prose
// terminals denied|expired. The 'complete' arm adds top-level userId (documented superset:
// §4.3 step 5 requires the CLI to persist {"userId":"<uuid>"} in auth.json). KNOWN shapes are
// STRICT — a malformed `complete` (missing token) MUST fail loud, not be papered over.
export const cliLoginPollResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("slow_down") }),
  z.object({ status: z.literal("denied") }),
  z.object({ status: z.literal("expired") }),
  z.object({
    status: z.literal("complete"),
    ingest_token: z.string().min(1),
    userId: z.string().min(1),
    user: z.object({ handle: z.string().min(1) }),
  }),
]);
export type CliLoginPollResponse = z.infer<typeof cliLoginPollResponseSchema>;

// FORWARD-COMPAT: the CLI is published independently of the server, so an older CLI may meet a
// newer server that adds a status. The transport parses against the strict union; on failure
// it must distinguish "unknown future status" (keep polling) from "malformed known response"
// (fail loud). This minimal envelope extracts just the status string to make that call.
export const cliLoginPollStatusEnvelopeSchema = z.object({ status: z.string() });
export const KNOWN_POLL_STATUSES = ["pending", "slow_down", "denied", "expired", "complete"] as const;

// user_code is char(9) "WXYZ-1234" — exactly 9 chars (matches the DB CHAR column).
export const cliLoginApproveRequestSchema = z.object({
  user_code: z.string().length(9),
  action: z.enum(["approve", "deny"]),
});
