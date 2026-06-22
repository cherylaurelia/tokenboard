// POST /api/v1/communities/:id/join (auth: session). Canonical join: open=no code, code=validate
// {code}, company=409 verify_url (§3.3). Delegates to joinCommunity() + joinOutcomeToResponse().
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinByIdRequestSchema } from "@tokenboard/contracts";
import { joinCommunity, joinOutcomeToResponse, type CommunityRow } from "@/lib/communities/join";
import { checkJoinLockout, recordJoinFailure } from "@/lib/communities/join-lockout";
import { profKey } from "@/lib/leaderboard/keys";
import { redis } from "@/lib/redis/client";
import { enforce } from "@/lib/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; // Next 16 async params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = joinByIdRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // §8.2 — 30/hr per-user + 60/hr per-IP (volume). Fail-open on an Upstash error.
  const gate = await enforce(request, "communitiesJoin", { uid: user.id });
  if (!gate.ok) return gate.response;

  // §8.2 brute-force lockout: lock after 10 wrong codes per (user, community)/hr (separate control).
  const lock = await checkJoinLockout(user.id, id);
  if (lock.locked) {
    return NextResponse.json(
      { error: "too_many_attempts", message: "Too many wrong codes; try again later." },
      { status: 429, headers: { "Retry-After": String(lock.retryAfter) } },
    );
  }

  const rows = (await db.execute(sql`
    select c.id::text as id, c.slug::text as slug, c.name,
           c.join_policy as "joinPolicy", c.join_code as "joinCode"
    from communities c where c.id = ${id}::uuid limit 1
  `)) as unknown as Array<CommunityRow>;
  const community = rows[0];
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const outcome = await joinCommunity(user.id, community, parsed.data.code);
  if (outcome.kind === "invalid_join_code") await recordJoinFailure(user.id, id);
  if (outcome.kind === "joined") await redis.del(profKey(user.id)).catch(() => {});

  const res = joinOutcomeToResponse(outcome, request.nextUrl.origin);
  for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
  return res;
}
