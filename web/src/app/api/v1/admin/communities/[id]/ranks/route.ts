// GET /api/v1/admin/communities/:id/ranks — owner-only. Returns assembleBoard(scope=c:{id}) JSON so
// the /tuna UI lazy-loads ranks ONLY when the admin expands a row (bounds the N+1 fan-out to opened
// rows). 404 for non-admins; gate BEFORE enforce(). Service-role read inside assembleBoard.
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { enforce } from "@/lib/ratelimit/enforce";
import { assembleBoard } from "@/lib/leaderboard/assemble-board";
import { scopeForCommunity } from "@/lib/leaderboard/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  const admin = await requireAdmin();
  if (!admin) return notFound();
  const gate = await enforce(request, "admin", { uid: admin.userId });
  if (!gate.ok) return gate.response;

  const board = await assembleBoard({
    query: { community: "global", window: "all", metric: "cost", limit: 200, format: "json" },
    scope: scopeForCommunity(id),
    community: null,
    meUserId: null,
    callerUserId: admin.userId,
  });
  const res = NextResponse.json(
    { totalEntries: board.totalEntries, entries: board.entries },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
  for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
  return res;
}
