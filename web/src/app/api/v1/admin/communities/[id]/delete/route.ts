// POST /api/v1/admin/communities/:id/delete — owner-only, DESTRUCTIVE + irreversible. DELETE the
// communities row; the 0000 FKs `on delete cascade` drop memberships + community_email_domains
// automatically. Deleting a COMPANY board drops every verified member's membership (and thus their
// derived company badge on next prof rebuild) — accepted owner action, confirm-gated (typed slug) in
// the UI. Purge that scope's board cache tags + del the orphaned no-TTL all-window lb keys (windowed
// keys decay via TTL; the scope vanishes from sweep/rebuild once memberships cascade). Service-role
// write. Logged (no secrets). 404 for non-admins.
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { redis } from "@/lib/redis/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { enforce } from "@/lib/ratelimit/enforce";
import { boardTag, lbKey, scopeForCommunity, METRIC_TOKENS, ALL_WINDOWS } from "@/lib/leaderboard/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  const admin = await requireAdmin();
  if (!admin) return notFound();
  const gate = await enforce(request, "admin", { uid: admin.userId });
  if (!gate.ok) return gate.response;

  const deleted = (await db.execute(sql`
    delete from communities where id = ${id}::uuid
    returning id::text as id, slug::text as slug
  `)) as unknown as Array<{ id: string; slug: string }>;
  if (deleted.length === 0) return notFound(); // already gone -> 404

  const scope = scopeForCommunity(id);
  for (const m of METRIC_TOKENS)
    for (const w of ALL_WINDOWS) {
      try {
        revalidateTag(boardTag(scope, m, w), "max");
      } catch (err) {
        console.error(
          "admin.deleteCommunity: revalidateTag failed (non-fatal)",
          err instanceof Error ? err.message : err,
        );
      }
    }
  // The 'all'-window lb keys have NO TTL — del them so they don't orphan permanently (windowed keys
  // decay; the deleted scope is never re-touched by sweep/rebuild once memberships cascade).
  try {
    await redis.del(lbKey(scope, "t", "all"), lbKey(scope, "usd", "all"));
  } catch (err) {
    console.error("admin.deleteCommunity: orphan key del failed (non-fatal)", err instanceof Error ? err.message : err);
  }

  console.info("admin.deleteCommunity", { actor: admin.userId, id, slug: deleted[0]!.slug }); // NO secrets
  const res = NextResponse.json({ ok: true, id, slug: deleted[0]!.slug }, { status: 200 });
  for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
  return res;
}
