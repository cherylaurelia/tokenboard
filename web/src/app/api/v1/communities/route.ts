// POST /api/v1/communities (auth: session). Creates a type='community' board (open|code) + an
// 'owner' membership for the creator. type='company' REJECTED (auto-materialized by verify, §5.2 +
// the communities_company_is_email_domain CHECK). slug derived from name, de-duped on the citext
// UNIQUE; 'code' policy mints a unique ambiguity-safe join_code. Writes via Drizzle. join_url ABSOLUTE.
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { communities, memberships } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCommunityRequestSchema, createCommunityResponseSchema } from "@tokenboard/contracts";
import { slugify, isReservedSlug } from "@/lib/communities/slug";
import { mintJoinCode } from "@/lib/communities/join-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RETRIES = 6;
const UNIQUE_VIOLATION = "23505";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createCommunityRequestSchema.safeParse(body);
  if (!parsed.success) {
    // 'company' fails the z.literal('community') gate -> disambiguate so the client knows why.
    const sentCompany =
      typeof body === "object" && body !== null && (body as Record<string, unknown>).type === "company";
    return NextResponse.json({ error: sentCompany ? "company_is_verify_only" : "invalid_request" }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // §4.6 — a banned user cannot create.
  const banned = (await db.execute(
    sql`select 1 from users where id = ${user.id} and banned_at is not null limit 1`,
  )) as unknown as Array<unknown>;
  if (banned.length > 0) return NextResponse.json({ error: "banned" }, { status: 403 });

  const baseSlug = input.slug ?? slugify(input.name);
  if (!baseSlug || baseSlug.length < 2) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  if (isReservedSlug(baseSlug)) return NextResponse.json({ error: "reserved_slug" }, { status: 400 });

  const origin = request.nextUrl.origin;

  // Retry on slug/join_code unique collisions (mirror cli/login/start's 23505 loop). DB is the
  // uniqueness truth — never pre-check-then-insert (TOCTOU). Clamp the base so a "-N" suffix always
  // fits within the 40-char column (otherwise .slice(0,40) would truncate the suffix away and every
  // retry would collide identically).
  for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug.slice(0, 38)}-${attempt + 1}`;
    const joinCode = input.join_policy === "code" ? mintJoinCode() : null;
    try {
      const created = await db.transaction(async (tx) => {
        const [c] = await tx
          .insert(communities)
          .values({
            type: "community",
            slug,
            name: input.name,
            joinPolicy: input.join_policy,
            visibility: input.visibility,
            joinCode,
            createdBy: user.id,
          })
          .returning({ id: communities.id, slug: communities.slug, joinCode: communities.joinCode });
        await tx.insert(memberships).values({
          userId: user.id,
          communityId: c!.id,
          role: "owner",
          joinedVia: "create", // joined_via is free-text (no CHECK)
          verifiedVia: null, // owner of a type='community' board gets no company badge (correct)
        });
        return c!;
      });
      return NextResponse.json(
        createCommunityResponseSchema.parse({
          id: created.id,
          slug: created.slug,
          join_code: created.joinCode ?? null,
          join_url: `${origin}/community/${created.slug}`,
        }),
        { status: 201 },
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== UNIQUE_VIOLATION || attempt === SLUG_RETRIES - 1) {
        console.error(`communities/create: insert failed (${code ?? "unknown"})`); // never log secrets
        return NextResponse.json({ error: "server_error" }, { status: 500 });
      }
      // 23505: slug or join_code collided -> loop (next slug suffix + a fresh code).
    }
  }
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}
