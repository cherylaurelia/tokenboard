// Shared join logic for BOTH POST /communities/:id/join and the friendly POST /communities/join.
// Re-checks banned (§4.6), branches on join_policy, idempotent (a re-join or a UNIQUE race ->
// already_member, never 500). Company boards are NOT joinable here (verify-only, §5.2). The
// response mapper lives here too so both routes emit byte-identical bodies. `origin` is passed in
// (request.nextUrl.origin) so board_url is ABSOLUTE per §3.3.
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { joinResponseSchema } from "@tokenboard/contracts";

export type JoinOutcome =
  | { kind: "joined"; role: "member"; slug: string; name: string }
  | { kind: "already_member"; role: "member" | "admin" | "owner"; slug: string; name: string }
  | { kind: "banned" }
  | { kind: "needs_verification"; communityId: string }
  | { kind: "invalid_join_code" };

export interface CommunityRow {
  id: string;
  slug: string;
  name: string;
  joinPolicy: "open" | "code" | "email_domain";
  joinCode: string | null;
}

// `suppliedCode` is the user-typed invite code (zod-validated to 6 chars) or undefined.
export async function joinCommunity(
  userId: string,
  community: CommunityRow,
  suppliedCode: string | undefined,
): Promise<JoinOutcome> {
  // §4.6 — banned users cannot join. Session != ban status; re-check authoritatively.
  const banned = (await db.execute(
    sql`select 1 from users where id = ${userId} and banned_at is not null limit 1`,
  )) as unknown as Array<unknown>;
  if (banned.length > 0) return { kind: "banned" };

  // Idempotent: already a member -> report current role (no write).
  const existing = (await db.execute(
    sql`select role from memberships where user_id = ${userId} and community_id = ${community.id} limit 1`,
  )) as unknown as Array<{ role: "member" | "admin" | "owner" }>;
  if (existing[0]) {
    return { kind: "already_member", role: existing[0].role, slug: community.slug, name: community.name };
  }

  if (community.joinPolicy === "email_domain") {
    return { kind: "needs_verification", communityId: community.id };
  }

  if (community.joinPolicy === "code") {
    // Codes are minted from an UPPERCASE ambiguity-safe alphabet; trimEnd() defends against any
    // char(6) trailing-space round-trip, then case-insensitive compare. Not a security secret (low-
    // value invite); brute-force lockout lives in join-lockout.ts (the route records each miss).
    const stored = community.joinCode?.trimEnd().toUpperCase() ?? null;
    const typed = suppliedCode?.trim().toUpperCase() ?? null;
    if (!stored || !typed || stored !== typed) return { kind: "invalid_join_code" };
  }

  // joined_via is free-text NOT NULL (no CHECK); verified_via for code/open mirrors the descriptor.
  const joinedVia = community.joinPolicy === "code" ? "code" : "open";
  const verifiedVia = community.joinPolicy === "code" ? "code" : "open";

  // INSERT with onConflictDoNothing on UNIQUE(user_id,community_id): a concurrent double-join is a
  // no-op insert -> re-read role -> already_member (never 500).
  const inserted = await db
    .insert(memberships)
    .values({ userId, communityId: community.id, role: "member", joinedVia, verifiedVia })
    .onConflictDoNothing({ target: [memberships.userId, memberships.communityId] })
    .returning({ id: memberships.id });

  if (inserted.length === 0) {
    const row = (await db.execute(
      sql`select role from memberships where user_id = ${userId} and community_id = ${community.id} limit 1`,
    )) as unknown as Array<{ role: "member" | "admin" | "owner" }>;
    return { kind: "already_member", role: row[0]?.role ?? "member", slug: community.slug, name: community.name };
  }
  return { kind: "joined", role: "member", slug: community.slug, name: community.name };
}

// Shared response mapper — both join routes call this so the bodies never diverge. `origin` makes
// board_url + verify_url ABSOLUTE (§3.3). verify_url path is /verify/email per §3.3 canonical.
export function joinOutcomeToResponse(outcome: JoinOutcome, origin: string): NextResponse {
  switch (outcome.kind) {
    case "banned":
      return NextResponse.json({ error: "banned" }, { status: 403 });
    case "invalid_join_code":
      return NextResponse.json({ error: "invalid_join_code" }, { status: 403 });
    case "needs_verification":
      return NextResponse.json(
        { error: "requires_email_verification", verify_url: `${origin}/verify/email?community=${outcome.communityId}` },
        { status: 409 },
      );
    case "already_member":
      return NextResponse.json(
        joinResponseSchema.parse({
          joined: true,
          already_member: true,
          role: outcome.role,
          community: { slug: outcome.slug, name: outcome.name },
          board_url: `${origin}/community/${outcome.slug}`,
        }),
        { status: 200 },
      );
    case "joined":
      return NextResponse.json(
        joinResponseSchema.parse({
          joined: true,
          role: "member",
          community: { slug: outcome.slug, name: outcome.name },
          board_url: `${origin}/community/${outcome.slug}`,
        }),
        { status: 200 },
      );
  }
}
