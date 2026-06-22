// POST /api/v1/communities/join (auth: session). The invite form has a CODE, not a uuid. Resolve
// the code -> community, then delegate to the SAME joinCommunity() logic. No match -> 403.
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinByCodeRequestSchema } from "@tokenboard/contracts";
import { joinCommunity, joinOutcomeToResponse, type CommunityRow } from "@/lib/communities/join";
import { checkJoinLockout, recordJoinFailure } from "@/lib/communities/join-lockout";
import { profKey } from "@/lib/leaderboard/keys";
import { redis } from "@/lib/redis/client";
import { enforce } from "@/lib/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = joinByCodeRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // §8.2 — 30/hr per-user + 60/hr per-IP (volume). Fail-open on an Upstash error.
  const gate = await enforce(request, "communitiesJoin", { uid: user.id });
  if (!gate.ok) return gate.response;

  // §8.2 brute-force lockout: this route resolves an unknown code to ANY community, so a never-
  // matching code has no community to key on — lock on the user's wrong-code counter (key "*").
  const lockKey = "*";
  const lock = await checkJoinLockout(user.id, lockKey);
  if (lock.locked) {
    return NextResponse.json(
      { error: "too_many_attempts", message: "Too many wrong codes; try again later." },
      { status: 429, headers: { "Retry-After": String(lock.retryAfter) } },
    );
  }

  // join_code is char(6); the minter emits exactly 6 non-space chars. Match case-insensitively and
  // trim the stored char(6) defensively against any trailing-space round-trip.
  const code = parsed.data.code.trim().toUpperCase();
  const rows = (await db.execute(sql`
    select c.id::text as id, c.slug::text as slug, c.name,
           c.join_policy as "joinPolicy", c.join_code as "joinCode"
    from communities c
    where upper(trim(trailing from c.join_code)) = ${code} and c.join_policy = 'code' limit 1
  `)) as unknown as Array<CommunityRow>;
  const community = rows[0];
  if (!community) {
    await recordJoinFailure(user.id, lockKey); // count the miss against the user's wrong-code budget
    const res = NextResponse.json({ error: "invalid_join_code" }, { status: 403 });
    for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
    return res;
  }

  const outcome = await joinCommunity(user.id, community, code);
  if (outcome.kind === "joined") await redis.del(profKey(user.id)).catch(() => {});

  const res = joinOutcomeToResponse(outcome, request.nextUrl.origin);
  for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
  return res;
}
