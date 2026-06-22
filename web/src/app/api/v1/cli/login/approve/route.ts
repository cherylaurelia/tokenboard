// POST /api/v1/cli/login/approve (auth: session). The bind+mint step. Re-resolves the user
// via getUser() (authoritative; never a client-passed id). Mints the raw ingest token, stores
// ONLY sha256 in ingest_devices (bytea, via Drizzle so the Buffer encodes correctly), and
// stashes the raw token transiently on device_grants.ingest_token_once for the NEXT poll.
// The token is NEVER returned to the browser. ALL device_grants writes here are via Drizzle.
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { deviceGrants, ingestDevices } from "@/db/schema";
import { cliLoginApproveRequestSchema } from "@tokenboard/contracts";
import { mintIngestToken, sha256Bytes } from "@/lib/cli-login/token";

export const dynamic = "force-dynamic";

const INGEST_TTL_DAYS = 90; // initial sliding window; sync bumps it (Phase 5)

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = cliLoginApproveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // AUTHZ: the user is whoever the verified session says — never the request body.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [grant] = await db
    .select()
    .from(deviceGrants)
    .where(eq(deviceGrants.userCode, parsed.data.user_code))
    .limit(1);
  if (!grant || grant.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "invalid_or_expired_code" }, { status: 400 });
  }

  if (parsed.data.action === "deny") {
    // Honor the CAS result: report 'denied' ONLY if a still-pending grant was actually flipped.
    const denied = await db
      .update(deviceGrants)
      .set({ status: "denied" })
      .where(and(eq(deviceGrants.id, grant.id), eq(deviceGrants.status, "pending")))
      .returning({ id: deviceGrants.id });
    if (denied.length === 0) {
      return NextResponse.json({ error: "already_processed" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, action: "denied" });
  }

  if (grant.status !== "pending") {
    return NextResponse.json({ error: "already_processed" }, { status: 409 });
  }

  // Mint the raw token; persist ONLY its sha256 (bytea) in ingest_devices via Drizzle —
  // supabase-js (PostgREST/JSON) cannot serialize a Node Buffer as Postgres bytea. The
  // ingest_devices.id is the device_id used in usage_day's PK in Phase 5.
  const rawToken = mintIngestToken(); // "tbd_" + base64url(32 bytes)
  const tokenHash = sha256Bytes(rawToken); // Buffer -> bytea (raw bytes, never hex/utf8)
  const ingestExpires = new Date(Date.now() + INGEST_TTL_DAYS * 86_400_000);
  try {
    await db.insert(ingestDevices).values({
      userId: user.id,
      tokenHash,
      machineHash: grant.machineHash,
      status: "active",
      expiresAt: ingestExpires,
    });
  } catch {
    console.error("cli/login/approve: ingest_devices insert failed");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Bind grant -> approved + stash the raw token transiently for the next poll. CAS guards
  // both double-approve (status='pending') AND the read->bind expiry TOCTOU (expires_at>now()).
  const bound = await db
    .update(deviceGrants)
    .set({ userId: user.id, status: "approved", ingestTokenOnce: rawToken })
    .where(
      and(
        eq(deviceGrants.id, grant.id),
        eq(deviceGrants.status, "pending"),
        gt(deviceGrants.expiresAt, sql`now()`),
      ),
    )
    .returning({ id: deviceGrants.id });
  if (bound.length === 0) {
    // Lost the CAS (concurrent approve / just-expired). The ingest_devices row just inserted
    // is an orphan: hash-only, status='active', expires in 90d, raw token NOWHERE — NOT a leak.
    // A Phase-5+ cleanup of ingest_devices rows with no completed grant is tracked (no cron now).
    return NextResponse.json({ error: "already_processed" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, action: "approved" });
}
