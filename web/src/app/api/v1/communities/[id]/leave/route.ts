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

  // ATOMIC last-owner guard + delete (fixes the SELECT-then-DELETE TOCTOU): the DELETE only fires
  // when the caller is NOT the sole owner (the NOT-EXISTS subquery is evaluated under the row lock
  // the DELETE takes), so two concurrent owners can't both pass the guard and orphan the board.
  // RETURNING tells us whether a row was deleted. We then disambiguate the no-delete case.
  const deleted = (await db.execute(sql`
    delete from memberships me
    where me.user_id = ${user.id} and me.community_id = ${id}::uuid
      and (
        me.role <> 'owner'
        or exists (
          select 1 from memberships other
          where other.community_id = ${id}::uuid and other.role = 'owner' and other.user_id <> ${user.id}
        )
      )
    returning me.id
  `)) as unknown as Array<{ id: string }>;

  if (deleted.length === 0) {
    // Either the caller is the sole owner (blocked) or they had no membership (idempotent ok).
    const soleOwner = (await db.execute(sql`
      select 1 from memberships
      where user_id = ${user.id} and community_id = ${id}::uuid and role = 'owner' limit 1
    `)) as unknown as Array<unknown>;
    if (soleOwner.length > 0) {
      return NextResponse.json(
        { error: "last_owner", message: "You're the only owner; transfer ownership before leaving." },
        { status: 409 },
      );
    }
  }
  // Deleted a row, or there was nothing to delete — both are {ok:true} (idempotent leave).
  return NextResponse.json(leaveResponseSchema.parse({ ok: true }), { status: 200 });
}
