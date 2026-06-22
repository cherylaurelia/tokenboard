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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = boardQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const query = parsed.data;

  // Resolve caller (optional). getUser() — never getSession() (§2.5). Do NOT swallow a transport/
  // server error as anon (that would 403 a real private-board member during an Auth blip): a
  // genuinely-absent session (no cookie) yields {user:null} with no error -> anon; a real server
  // error -> 503 so a private-board member never sees a spurious 403 during an Auth outage.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const status = (error as { status?: number }).status;
    // Missing/invalid session is the normal anonymous case (no session to read). Anything else
    // (network/5xx from the Auth server) is a real outage -> 503, never a silent anon downgrade.
    if (status !== undefined && status !== 401 && status !== 403) {
      return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
    }
  }
  const callerUserId: string | null = data.user?.id ?? null;

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
  return NextResponse.json(checked, { status: 200 });
}
