// POST /api/v1/admin/users/:id/ban {banned:boolean} — owner-only. Sets/clears users.banned_at (the
// §4.6 ranking exclusion already wired across write/read/join paths) AND revokes the auth session via
// supabaseAdmin.auth.admin.updateUserById(id,{ban_duration}). id IS the auth user id (public.users.id
// === auth.users.id, 1:1 FK) — no lookup. ban_duration blocks token REFRESH (enforced on the next
// refresh — the <=1h access-token TTL is the residual window; NOT an instant logout). Then bust
// prof:{id} + revalidate the GLOBAL board tags AND the banned user's per-COMMUNITY board tags so they
// drop from every live RENDER. Service-role write. Logged (no secrets). 404 (not 403) for non-admins.
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { redis } from "@/lib/redis/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { enforce } from "@/lib/ratelimit/enforce";
import { boardTag, profKey, scopeForCommunity, METRIC_TOKENS, ALL_WINDOWS } from "@/lib/leaderboard/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_DURATION = "876000h"; // ~100yr permanent ban; "none" lifts it.
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  const admin = await requireAdmin();
  if (!admin) return notFound(); // 404, never 403
  const gate = await enforce(request, "admin", { uid: admin.userId });
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const banned = (body as { banned?: unknown })?.banned;
  if (typeof banned !== "boolean") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (id === admin.userId) return NextResponse.json({ error: "cannot_ban_self" }, { status: 400 });

  const updated = (await db.execute(sql`
    update users set banned_at = ${banned ? sql`now()` : sql`null`}, updated_at = now()
    where id = ${id}::uuid
    returning id::text as id, banned_at
  `)) as unknown as Array<{ id: string; banned_at: string | null }>;
  if (updated.length === 0) return notFound();

  // Auth-level token revocation (non-fatal — banned_at already excludes from boards).
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: banned ? BAN_DURATION : "none",
    });
    if (error) console.error("admin.ban: updateUserById error (non-fatal)", error.message);
  } catch (err) {
    console.error("admin.ban: updateUserById threw (non-fatal)", err instanceof Error ? err.message : err);
  }

  // The banned user's community memberships (for per-community tag busting). Service-role read.
  const memberRows = (await db.execute(sql`
    select community_id::text as "communityId" from memberships where user_id = ${id}::uuid
  `)) as unknown as Array<{ communityId: string }>;

  // Cache bust: prof first (the effective freshness lever), then each board tag in its OWN try/catch.
  // Bust the GLOBAL board AND every community the user belongs to so they drop/return on every live
  // RENDER (the data layer re-excludes on the next uncached read; this closes the SWR window).
  try {
    await redis.del(profKey(id));
  } catch (err) {
    console.error("admin.ban: prof del failed (non-fatal)", err instanceof Error ? err.message : err);
  }
  const scopes = ["g" as const, ...memberRows.map((r) => scopeForCommunity(r.communityId))];
  for (const scope of scopes)
    for (const m of METRIC_TOKENS)
      for (const w of ALL_WINDOWS) {
        try {
          revalidateTag(boardTag(scope, m, w), "max");
        } catch (err) {
          console.error("admin.ban: revalidateTag failed (non-fatal)", err instanceof Error ? err.message : err);
        }
      }

  console.info("admin.ban", { actor: admin.userId, target: id, banned }); // NO secrets
  const res = NextResponse.json({ ok: true, id, banned: updated[0]!.banned_at !== null }, { status: 200 });
  for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
  return res;
}
