// POST /api/v1/cli/login/poll (auth: none). Status machine + one-time atomic token consume.
// ALL device_grants access here goes through Drizzle/postgres-js (NOT supabaseAdmin/PostgREST):
// the consume reads/writes ingest_token_once + last_polled_at (cols added in 0001) and must
// dodge the PostgREST schema cache, AND the consume must be a single atomic statement so the
// returned raw token can ONLY come from the row that won the compare-and-set.
//
// WIRE vs DB status (see wire-status.ts): the CLI sees pending|slow_down|complete|denied|expired;
// 'approved' is a DB-only intermediate it never sees (it sees 'pending' until the token is
// ready, then 'complete' on the FIRST poll, which atomically flips DB status to 'complete').
import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deviceGrants, users } from "@/db/schema";
import { cliLoginPollRequestSchema } from "@tokenboard/contracts";
import { sha256Hex } from "@/lib/cli-login/token";
import { enforce } from "@/lib/ratelimit/enforce";

export const dynamic = "force-dynamic";

const SLOW_DOWN_FLOOR_MS = 4000; // < interval(5s) - jitter -> the CLI polled too fast

export async function POST(request: NextRequest) {
  // §8.2 — 60/min per-IP (unauthenticated poll; the per-grant 5s slow_down stays below). Fail-open.
  const gate = await enforce(request, "cliPoll");
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = cliLoginPollRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // device_grants.device_code stores sha256Hex(raw); hash with the IDENTICAL fn to look up.
  const deviceCodeHash = sha256Hex(parsed.data.device_code);
  const [grant] = await db
    .select()
    .from(deviceGrants)
    .where(eq(deviceGrants.deviceCode, deviceCodeHash))
    .limit(1);

  // Unknown device_code -> 'expired' (no existence oracle).
  if (!grant) return NextResponse.json({ status: "expired" });

  const now = Date.now();

  if (grant.expiresAt.getTime() < now) {
    if (grant.status !== "expired") {
      await db.update(deviceGrants).set({ status: "expired" }).where(eq(deviceGrants.id, grant.id));
    }
    return NextResponse.json({ status: "expired" });
  }
  if (grant.status === "denied") return NextResponse.json({ status: "denied" });
  if (grant.status === "complete") return NextResponse.json({ status: "expired" }); // consumed; no replay

  // slow_down: deterministic per-grant timing. last_polled_at tracks the last ACCEPTED poll,
  // server-written (never a client clock). Checked before pending/approved so a too-fast poll
  // is rate-limited in any state.
  if (grant.lastPolledAt && now - grant.lastPolledAt.getTime() < SLOW_DOWN_FLOOR_MS) {
    return NextResponse.json({ status: "slow_down" });
  }
  await db.update(deviceGrants).set({ lastPolledAt: new Date(now) }).where(eq(deviceGrants.id, grant.id));

  if (grant.status === "pending") return NextResponse.json({ status: "pending" });

  if (grant.status === "approved") {
    if (!grant.userId) return NextResponse.json({ status: "expired" }); // approved must carry user_id

    // Read the handle BEFORE the consuming flip so a transient read failure does NOT strand an
    // already-consumed claim (the token would be lost forever). FK guarantees the row exists.
    const [u] = await db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.id, grant.userId))
      .limit(1);
    if (!u) return NextResponse.json({ status: "pending" }); // retryable; do NOT consume yet

    // ATOMIC one-time consume. A plain UPDATE ... SET col=null RETURNING col yields the
    // POST-update value (null), so we use a CTE: capture the old token under FOR UPDATE, then
    // null it in the same statement. The row is locked, the WHERE is the compare-and-set, and
    // the returned token can ONLY come from the winning flip (no prior SELECT of it to leak).
    // A concurrent loser matches 0 rows in `consumed` -> empty result -> no token.
    const consumed = (await db.execute(sql`
      with consumed as (
        select id, ingest_token_once as token, user_id
        from device_grants
        where id = ${grant.id} and status = 'approved'
        for update
      ),
      upd as (
        update device_grants
        set status = 'complete', ingest_token_once = null
        where id = (select id from consumed)
        returning id
      )
      select token, user_id from consumed
    `)) as unknown as Array<{ token: string | null; user_id: string | null }>;

    const token = consumed[0]?.token;
    const userId = consumed[0]?.user_id;
    if (!token || !userId) return NextResponse.json({ status: "expired" }); // lost CAS or null

    return NextResponse.json({
      status: "complete",
      ingest_token: token, // sourced ONLY from the CTE that won the flip, never a prior SELECT
      userId,
      user: { handle: u.handle },
    });
  }

  return NextResponse.json({ status: "expired" }); // unknown DB status -> terminal, fail safe
}
