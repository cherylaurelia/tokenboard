// POST /api/v1/verify/email/confirm (auth: session). §5.3 CONFIRM + BIND. Loads the pending row,
// locks at >=5 attempts, increments attempts BEFORE the compare (so a crash mid-compare still counts
// the try), constant-time hash compare (domain in the hash), then an ATOMIC compare-and-set consume
// (mirrors the poll route's CTE: UPDATE ... WHERE consumed_at IS NULL RETURNING is the one-shot
// guard) and binds the company board. A double-submit / magic-link-vs-OTP race that loses the CAS
// returns the replay-safe response (the board bind is idempotent on the membership UNIQUE).
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyEmailConfirmRequestSchema, verifyEmailConfirmResponseSchema } from "@tokenboard/contracts";
import { hashOtp, constantTimeEqualBytea } from "@/lib/verify/code";
import { bindCompanyBoard } from "@/lib/verify/bind-company-board";
import { profKey } from "@/lib/leaderboard/keys";
import { redis } from "@/lib/redis/client";
import { enforce } from "@/lib/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = verifyEmailConfirmRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const banned = (await db.execute(
    sql`select 1 from users where id = ${user.id} and banned_at is not null limit 1`,
  )) as unknown as Array<unknown>;
  if (banned.length > 0) return NextResponse.json({ error: "banned" }, { status: 403 });

  // §8.2 — 10/15min per-user + 30/hr per-IP (request VOLUME). Orthogonal to the §5.3 per-code
  // attempt-lockout below (MAX_ATTEMPTS) which guards a SINGLE code against guessing. Both apply.
  const gate = await enforce(request, "verifyConfirm", { uid: user.id });
  if (!gate.ok) return gate.response;

  const { domain, code } = parsed.data;

  // ATOMIC check-and-increment (fixes the SELECT-then-UPDATE TOCTOU): bump attempts on the latest
  // pending row ONLY while attempts < MAX, in one statement, so concurrent confirms serialize on the
  // row lock and the 5-try cap can't be exceeded by racing requests. RETURNING gives us the row to
  // compare. 0 rows -> either no pending row OR already locked out; we disambiguate below.
  const bumped = (await db.execute(sql`
    update email_verifications set attempts = attempts + 1
    where id = (
      select id from email_verifications
      where user_id = ${user.id} and domain = ${domain} and consumed_at is null and expires_at > now()
      order by created_at desc limit 1
    ) and attempts < ${MAX_ATTEMPTS}
    returning id::text as id, code_hash as "codeHash"
  `)) as unknown as Array<{ id: string; codeHash: Buffer }>;
  const row = bumped[0];
  if (!row) {
    // Distinguish locked-out (a pending row exists at/over the cap) from genuinely no pending row.
    const pending = (await db.execute(sql`
      select attempts from email_verifications
      where user_id = ${user.id} and domain = ${domain} and consumed_at is null and expires_at > now()
      order by created_at desc limit 1
    `)) as unknown as Array<{ attempts: number }>;
    if (pending[0] && pending[0].attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "too_many_attempts", message: "Too many tries; start over to get a fresh code." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "no_pending_verification", message: "That code expired or was already used. Start verification again." },
      { status: 400 },
    );
  }

  // postgres-js decodes code_hash (bytea) to a Buffer; constant-time compare with the SAME hash input
  // (pepper:userId:domain:code) used at mint.
  if (!constantTimeEqualBytea(hashOtp(user.id, domain, code), row.codeHash)) {
    return NextResponse.json(
      { error: "invalid_code", message: "Wrong code; check the email and try again." },
      { status: 400 },
    );
  }

  // ATOMIC single-use consume: the WHERE consumed_at IS NULL RETURNING is the compare-and-set
  // (mirrors poll's CTE). A concurrent loser gets 0 rows -> already consumed by the winner; treat as
  // replay-safe success (the board bind below is idempotent on the membership UNIQUE).
  await db.execute(sql`
    update email_verifications set consumed_at = now(), email = ${domain}
    where id = ${row.id}::uuid and consumed_at is null
    returning id
  `);

  let board: { id: string; slug: string };
  try {
    board = await bindCompanyBoard(user.id, domain);
  } catch (err) {
    console.error(`verify/confirm: bind failed (${(err as { code?: string }).code ?? "unknown"})`);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // The company badge is DERIVED from the verified membership in profile-cache.ts (tierPill,
  // kind='company'). Bust prof:{userId} so the badge appears immediately rather than within the 6h
  // TTL (non-fatal — a cache-bust failure must not fail an already-bound verification).
  await redis.del(profKey(user.id)).catch(() => {});

  const res = NextResponse.json(
    verifyEmailConfirmResponseSchema.parse({
      verified: true,
      community: { id: board.id, slug: board.slug },
      joined: true,
      badge: "company",
    }),
    { status: 200 },
  );
  for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
  return res;
}
