// POST /api/v1/sync, §6.4 steps 1-13 IN ORDER.
// Steps 11 (Redis day-bucket ZADD) + 12 (rolling-window + community board keys) run POST-COMMIT
// (after persistUsage's tx) — a Redis failure there is NON-FATAL (Postgres is truth, rebuildable
// §7.6). Step 14 (ISR/CDN tag purge) stays DEFERRED to Phase 9 — no revalidateTag here.
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { syncRequestSchema, syncResponseEnvelopeSchema } from "@tokenboard/contracts";
import { PRICE_TABLE_VERSION } from "@tokenboard/cost";
import { priceTable } from "@/db/price-table-startup";
import { authenticateDevice, bumpDeviceExpiry } from "@/lib/sync/authenticate-device";
import {
  requestHashOf,
  reserveIdempotencyKey,
  finalizeIdempotencyKey,
  releaseReservation,
} from "@/lib/sync/idempotency";
import { validateAndNormalize } from "@/lib/sync/validate-records";
import { priceRecord, sumCostUsd } from "@/lib/sync/compute-cost";
import { persistUsage } from "@/lib/sync/persist-usage";
import { writeLeaderboardOnSync } from "@/lib/leaderboard/write-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Drizzle/postgres-js + node:crypto — never the edge runtime.

const NEXT_SYNC_SUGGESTED_AFTER_SEC = 3600;

export async function POST(request: NextRequest) {
  // PRE-0: parse body (must precede idempotency — can't canonicalize unparseable JSON).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // STEP 1 — authenticate the DEVICE bearer (NOT the Supabase session). No write yet.
  const auth = await authenticateDevice(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // STEP 2a — require Idempotency-Key.
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return NextResponse.json({ error: "missing_idempotency_key" }, { status: 400 });
  }

  // Whole-request structural validation. Per-RECORD invalidity is partial-success (step 3), NOT a 400.
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { tzOffsetMinutes, records } = parsed.data;

  // STEP 2b — idempotency reserve / replay / conflict (scoped by user_id; identity-only hash).
  const requestHash = requestHashOf(parsed.data);
  const reservation = await reserveIdempotencyKey(idempotencyKey, auth.userId, requestHash);
  if (reservation.kind === "replay") {
    return NextResponse.json(reservation.response, { status: 200 }); // no writes, not even the bump
  }
  if (reservation.kind === "conflict") {
    return NextResponse.json({ error: "idempotency_key_conflict" }, { status: 409 });
  }
  if (reservation.kind === "in_progress") {
    return NextResponse.json({ error: "idempotency_request_in_progress" }, { status: 409 });
  }

  // From here we hold a reserved 'processing' row — release it on any error (crash-safety).
  try {
    // Sliding-window token bump (step 1 cont.) — ONLY on the reserved path. Outside the usage tx.
    await bumpDeviceExpiry(auth.deviceRowId);

    // STEPS 3-5 — per-record validate, date-window clamp, server-side normalize (partial success).
    const { valid, errors, flags: validateFlags } = validateAndNormalize(records, {
      now: new Date(),
      tzOffsetMinutes,
    });

    // STEPS 6-7 — pinned price table (module-scope singleton) + server-side cost.
    const priced = valid.map((r) => priceRecord(r, priceTable));

    // STEPS 8-10 — ONE db.transaction: advisory-locked upsert + cross-device rollup + plausibility.
    const { daysAffected, flags: dayFlags } = await persistUsage({
      userId: auth.userId,
      deviceId: auth.deviceRowId,
      priced,
      priceTableVersion: PRICE_TABLE_VERSION,
    });

    // STEPS 11-12 — POST-COMMIT Redis leaderboard writes (§7.3). NON-FATAL: a Redis failure here
    // must NOT fail the sync (Postgres is the source of truth; boards are rebuildable §7.6). On
    // failure we log (no secrets) and return an empty boardsTouched; a retry-queue is Phase 9.
    // Step 14 (CDN/ISR purge of these keys) stays deferred to Phase 9.
    let boardsTouched: string[] = [];
    try {
      boardsTouched = await writeLeaderboardOnSync({ userId: auth.userId, daysAffected });
    } catch (redisErr) {
      console.error(
        "api/v1/sync: post-commit Redis write failed (non-fatal)",
        redisErr instanceof Error ? redisErr.message : redisErr,
      );
    }

    // Advisory machine_hash flag (step 1) — Phase 5 wire body has no machine_hash, so ~never set.
    const machineFlags = auth.machineHashMismatch
      ? [{ code: "MACHINE_HASH_MISMATCH", detail: "presented machine_hash differs from the bound device" }]
      : [];

    // §6.3 ENVELOPE. totalCostUsdDelta is full precision.
    const totalTokens = priced.reduce((acc, p) => acc + p.tokens, 0n);
    const envelope = {
      accepted: priced.length,
      rejected: errors.length,
      priceTableVersionApplied: PRICE_TABLE_VERSION,
      daysAffected,
      computed: {
        totalCostUsdDelta: sumCostUsd(priced.map((p) => p.costUsd6dp)),
        totalTokens: Number(totalTokens),
      },
      flags: [...validateFlags, ...dayFlags, ...machineFlags],
      errors,
      boardsTouched, // §7.3 lb keys touched this sync (CDN purge of these is Phase 9)
      nextSyncSuggestedAfterSec: NEXT_SYNC_SUGGESTED_AFTER_SEC,
    };

    // Fail-loud at the trust boundary: validate our own envelope before storing/returning.
    const checked = syncResponseEnvelopeSchema.parse(envelope);

    // STEP 13 — finalize the ledger (separate statement, AFTER the usage tx commits).
    await finalizeIdempotencyKey(idempotencyKey, auth.userId, checked);
    return NextResponse.json(checked, { status: 200 });
  } catch (err) {
    // Crash-safety: drop the reserved 'processing' row so a retry re-reserves cleanly. The usage_day
    // upsert is idempotent, so a half-done retry just overwrites the same device rows.
    await releaseReservation(idempotencyKey, auth.userId).catch(() => {});
    console.error("api/v1/sync: pipeline failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
