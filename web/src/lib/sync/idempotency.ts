// §6.4 steps 2 + 13. A 3-state ledger (processing -> done) kept OUTSIDE the usage_day transaction.
// The usage_day ON CONFLICT (user_id,device_id,date,tool,model) upsert is the TRUE double-count guard
// (ARCH §6.4), so a lost/incomplete ledger row can never double-count — the ledger only buys response
// replay + cheap retries.
import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { syncRequests } from "@/db/schema";
import { sha256Bytes } from "@/lib/cli-login/token";
import { canonicalJson } from "./canonical-json";
import type { SyncRequest, SyncResponseEnvelope } from "@tokenboard/contracts";

// A 'processing' row older than this is treated as ABANDONED (a hard-killed prior request). Set well
// above the CLI's request timeout so a genuinely in-flight request is never stolen.
const PROCESSING_TTL_MS = 120_000;

// request_hash (bytea) = sha256 of the SERVER-CANONICALIZED, IDENTITY-BEARING fields only. We hash
// ONLY {tzOffsetMinutes, records} and DELIBERATELY EXCLUDE the advisory field priceTableVersionSeen:
// two semantically-identical syncs that differ only in that advisory field MUST still replay, not 409.
export function requestHashOf(parsed: SyncRequest): Buffer {
  const identity = { tzOffsetMinutes: parsed.tzOffsetMinutes, records: parsed.records };
  return sha256Bytes(canonicalJson(identity));
}

export type ReserveResult =
  | { kind: "reserved" } // winner — proceed with the pipeline
  | { kind: "replay"; response: SyncResponseEnvelope } // stored response, return 200 verbatim
  | { kind: "conflict" } // 409 idempotency_key_conflict
  | { kind: "in_progress" }; // 409 — a concurrent first request is running

// Step 2. The PK is text idempotency_key ALONE, so we scope every check by user_id. responseJson is
// jsonb NOT NULL -> '{}' placeholder at reserve, overwritten at finalize.
export async function reserveIdempotencyKey(
  key: string,
  userId: string,
  requestHash: Buffer,
): Promise<ReserveResult> {
  const inserted = await db
    .insert(syncRequests)
    .values({
      idempotencyKey: key,
      userId,
      requestHash,
      responseJson: sql`'{}'::jsonb`,
      status: "processing",
    })
    .onConflictDoNothing({ target: syncRequests.idempotencyKey })
    .returning({ key: syncRequests.idempotencyKey });

  if (inserted.length > 0) return { kind: "reserved" }; // we won the reserve

  // Lost the reserve (key already existed) OR a concurrent winner inserted first. Re-read.
  const [existing] = await db
    .select()
    .from(syncRequests)
    .where(eq(syncRequests.idempotencyKey, key))
    .limit(1);

  // READ COMMITTED edge: a single-statement ON CONFLICT DO NOTHING auto-commits, so the loser's SELECT
  // normally sees a committed row. If it momentarily reads nothing (winner uncommitted), treat as
  // in_progress (retryable) rather than re-inserting.
  if (!existing) return { kind: "in_progress" };

  // Cross-user safety: a different user's key with this text PK -> conflict (never replay/leak).
  if (existing.userId !== userId) return { kind: "conflict" };

  // Hash mismatch (same key, different IDENTITY body) -> 409 regardless of status.
  if (!existing.requestHash.equals(requestHash)) return { kind: "conflict" };

  // Same key + same body.
  if (existing.status === "done") {
    return { kind: "replay", response: existing.responseJson as SyncResponseEnvelope };
  }

  // status === 'processing'. If STALE (older than the TTL) it's an abandoned hard-kill — atomically
  // reclaim it (CAS on status+age) and proceed. Otherwise a genuine concurrent first request is in
  // flight -> 409 in_progress (the CLI retries the SAME key after a brief backoff).
  const reclaimed = await db
    .update(syncRequests)
    .set({ requestHash, createdAt: sql`now()` }) // reset the age window so a re-killed retry can also reclaim
    .where(
      and(
        eq(syncRequests.idempotencyKey, key),
        eq(syncRequests.userId, userId),
        eq(syncRequests.status, "processing"),
        lt(syncRequests.createdAt, sql`now() - make_interval(secs => ${PROCESSING_TTL_MS / 1000})`),
      ),
    )
    .returning({ key: syncRequests.idempotencyKey });
  if (reclaimed.length > 0) return { kind: "reserved" }; // we took over the abandoned slot

  return { kind: "in_progress" };
}

// Step 13: overwrite the placeholder with the full §6.3 envelope + flip to done. Scoped by user.
export async function finalizeIdempotencyKey(
  key: string,
  userId: string,
  envelope: SyncResponseEnvelope,
): Promise<void> {
  await db
    .update(syncRequests)
    .set({ responseJson: envelope, status: "done" })
    .where(and(eq(syncRequests.idempotencyKey, key), eq(syncRequests.userId, userId)));
}

// Crash-safety: on ANY error AFTER a successful reserve and BEFORE finalize, delete the reserved row
// IF still owned + still 'processing', so the next same-key retry re-reserves cleanly.
export async function releaseReservation(key: string, userId: string): Promise<void> {
  await db
    .delete(syncRequests)
    .where(
      and(
        eq(syncRequests.idempotencyKey, key),
        eq(syncRequests.userId, userId),
        eq(syncRequests.status, "processing"),
      ),
    );
}
