// GET /api/v1/board — assembles the §7.2 JSON (auth-OPTIONAL). Public/global anon-readable; private
// community boards session-gated (getUser + membership) -> 403. nodejs runtime (Drizzle).
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { boardQuerySchema, boardResponseSchema } from "@tokenboard/contracts";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveBoardScope } from "@/lib/leaderboard/resolve-scope";
import { assembleBoard } from "@/lib/leaderboard/assemble-board";
import { metricToken } from "@/lib/leaderboard/keys";
import { boardCacheable } from "@/lib/leaderboard/cache-decision";
import { publicBoardHeaders, noStoreHeaders } from "@/lib/leaderboard/cache-headers";
import { enforce } from "@/lib/ratelimit/enforce";

// No `dynamic = "force-dynamic"`: the route reads cookies (getUser) + the DB per request, so it is
// dynamic regardless — and dropping the explicit directive removes any ambiguity about whether a
// force-dynamic handler's manually-set Cache-Control reaches the Vercel edge (§8.1). Public-anon
// reads carry s-maxage + a Cache-Tag; every authed / non-public / error path is no-store.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = boardQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const query = parsed.data;

  // Resolve caller (optional). getUser() — never getSession() (§2.5). The common anonymous read has
  // NO session, which auth-js reports as an AuthSessionMissingError (a 400/401/403 "no session"
  // class) — that is NOT an outage, it's anon. Only a genuine transport/5xx error (the Auth server
  // is unreachable) should 503, so a private-board member never sees a spurious 403 during an
  // outage. Discriminate on the error name/class, not just the numeric status (session-missing is
  // status 400 in auth-js 2.108.2 — checking !=401/403 wrongly 503'd every anon read).
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const name = (error as { name?: string }).name ?? "";
    const status = (error as { status?: number }).status;
    // No-session is the normal anonymous read: AuthSessionMissingError (status 400 in auth-js) or a
    // 401/403. Anything else — incl. the broad AuthApiError base for a 5xx/transport failure — is a
    // real outage -> 503, so a private-board member never sees a spurious 403 (don't match the base
    // class name, which would mask genuine Auth-server errors as anon).
    const isNoSession = name === "AuthSessionMissingError" || status === 401 || status === 403;
    if (!isNoSession) {
      return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
    }
  }
  const callerUserId: string | null = data.user?.id ?? null;

  // §8.2 — 120/min per-user + 240/min per-IP (anon = IP only). Fail-open on an Upstash error.
  const gate = await enforce(request, "board", { uid: callerUserId });
  if (!gate.ok) return gate.response;

  const resolved = await resolveBoardScope(query.community, callerUserId);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.status === 403 ? "forbidden" : "not_found" },
      { status: resolved.status },
    );
  }

  // ?me=<handle> -> user_id (citext handle lookup). Exclude banned: a banned handle resolves to
  // meUserId=null => me=null (§4.6).
  let meUserId: string | null = null;
  if (query.me) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.handle, query.me), isNull(users.bannedAt)))
      .limit(1);
    meUserId = u?.id ?? null;
  }

  const board = await assembleBoard({
    query,
    scope: resolved.scope,
    community: resolved.community,
    meUserId,
    callerUserId,
  });

  // Fail-loud at the trust boundary: validate our own response against the §7.2 schema.
  const checked = boardResponseSchema.parse(board);
  const res = NextResponse.json(checked, { status: 200 });

  // §8.1 — CDN-cache ONLY a response that provably can't vary by viewer (anon + !me + public/global).
  // Any session / ?me= / unlisted / private -> no-store. Defense-in-depth: a public, s-maxage entry
  // must never carry Set-Cookie (cache-poison) — if one rode along, fall back to no-store.
  const cacheable =
    boardCacheable({ callerUserId, me: query.me, community: resolved.community }) &&
    !res.headers.has("set-cookie");
  const cacheHeaders = cacheable
    ? publicBoardHeaders(resolved.scope, metricToken(query.metric), query.window)
    : noStoreHeaders();
  for (const [k, v] of Object.entries({ ...cacheHeaders, ...gate.headers })) res.headers.set(k, v);
  return res;
}
