// POST /api/v1/communities/:id/join (auth: session). Canonical join: open=no code, code=validate
// {code}, company=409 verify_url (§3.3). Delegates to joinCommunity() + joinOutcomeToResponse().
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinByIdRequestSchema } from "@tokenboard/contracts";
import { joinCommunity, joinOutcomeToResponse, type CommunityRow } from "@/lib/communities/join";

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

  const rows = (await db.execute(sql`
    select c.id::text as id, c.slug::text as slug, c.name,
           c.join_policy as "joinPolicy", c.join_code as "joinCode"
    from communities c where c.id = ${id}::uuid limit 1
  `)) as unknown as Array<CommunityRow>;
  const community = rows[0];
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const outcome = await joinCommunity(user.id, community, parsed.data.code);
  return joinOutcomeToResponse(outcome, request.nextUrl.origin);
}
