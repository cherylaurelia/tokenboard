// POST /api/v1/profile (auth: session). The ONE profile write. Updates ONLY users.bio +
// users.social_links for the AUTHENTICATED user — never handle/display_name/avatar_url (GitHub-owned)
// or is_admin/banned_at (privilege/moderation). Social links validated by the pure normalizer
// (allowlist platforms, scheme-safe https URLs, length caps). Busts prof:{userId} (the tier/pill
// cache; bio+links themselves are served fresh by the force-dynamic page on router.refresh, not the
// prof cache). §8.2 rate-limited (30/min uid, 60/min ip). Mirrors POST /api/v1/communities.
import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileUpdateRequestSchema, profileUpdateResponseSchema } from "@tokenboard/contracts";
import { normalizeSocialLinks, normalizeBio } from "@/lib/profile/social-links";
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
  const parsed = profileUpdateRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A banned user cannot edit (mirrors the communities route's banned check).
  const banned = (await db.execute(
    sql`select 1 from users where id = ${user.id} and banned_at is not null limit 1`,
  )) as unknown as Array<unknown>;
  if (banned.length > 0) return NextResponse.json({ error: "banned" }, { status: 403 });

  // §8.2 — 30/min per-user + 60/min per-IP.
  const gate = await enforce(request, "profileUpdate", { uid: user.id });
  if (!gate.ok) return gate.response;

  // The trust boundary: the zod schema is shape+caps only; the normalizer allowlists keys and builds
  // scheme-safe URLs. NEVER write parsed.data.social_links directly.
  const links = normalizeSocialLinks(parsed.data.social_links ?? {});
  if (!links.ok) return NextResponse.json({ error: "invalid_social_links", fields: links.errors }, { status: 400 });
  const bio = normalizeBio(parsed.data.bio);
  if (!bio.ok) return NextResponse.json({ error: "invalid_bio" }, { status: 400 });

  // WHITELIST: exactly these columns, only for the authed uuid. The id comes from the session — NEVER
  // from the body (no mass-assignment / spoofing). No row trigger sets updated_at, so set it here.
  const [saved] = await db
    .update(users)
    .set({ bio: bio.value, socialLinks: links.value, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning({ bio: users.bio, socialLinks: users.socialLinks });

  await redis.del(profKey(user.id)).catch(() => {}); // non-fatal: refreshes the tier/pill cache

  const res = NextResponse.json(
    profileUpdateResponseSchema.parse({ bio: saved!.bio ?? null, social_links: saved!.socialLinks ?? {} }),
    { status: 200 },
  );
  for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v); // fail-open => may be empty
  return res;
}
