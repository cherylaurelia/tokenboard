// POST /api/v1/communities/:id/leave (auth: session). Deletes the caller's own membership. For a
// company board this auto-revokes the company badge (the badge is DERIVED from a verified company
// membership in profile-cache.ts — deleting the row removes it on the next prof:{userId} rebuild).
// Idempotent. LAST-OWNER guard: an owner who is the only owner is blocked (409 last_owner) so a
// board is never orphaned. Ownership transfer is Phase 9.
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leaveResponseSchema } from "@tokenboard/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Last-owner guard: block leaving if the caller is the sole 'owner' of this community.
  const lastOwner = (await db.execute(sql`
    select 1 from memberships me
    where me.user_id = ${user.id} and me.community_id = ${id}::uuid and me.role = 'owner'
      and not exists (
        select 1 from memberships other
        where other.community_id = ${id}::uuid and other.role = 'owner' and other.user_id <> ${user.id}
      ) limit 1
  `)) as unknown as Array<unknown>;
  if (lastOwner.length > 0) {
    return NextResponse.json(
      { error: "last_owner", message: "You're the only owner; transfer ownership before leaving." },
      { status: 409 },
    );
  }

  // Idempotent delete — no membership is still {ok:true}.
  await db.execute(sql`delete from memberships where user_id = ${user.id} and community_id = ${id}::uuid`);
  return NextResponse.json(leaveResponseSchema.parse({ ok: true }), { status: 200 });
}
