// Step 1 of §7.5: slug -> community_id + visibility gate. Private boards require a session whose
// memberships include the community (getUser, never getSession — §2.5/§4.2). Public/unlisted +
// global are anon-readable. memberCount = COUNT(memberships) roster (NOT ZCARD of synced members).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { CommunityMeta } from "@tokenboard/contracts";
import { scopeForCommunity, type Scope } from "./keys";

export type ResolveResult =
  | { ok: true; scope: Scope; community: CommunityMeta | null }
  | { ok: false; status: 403 | 404 };

export async function resolveBoardScope(
  communitySlug: string,
  callerUserId: string | null,
): Promise<ResolveResult> {
  if (communitySlug === "" || communitySlug.toLowerCase() === "global") {
    return { ok: true, scope: "g", community: null };
  }

  const rows = (await db.execute(sql`
    select c.id::text as id, c.slug::text as slug, c.name, c.type,
           c.join_policy as "joinPolicy", c.visibility,
           (select count(*) from memberships m where m.community_id = c.id)::int as "memberCount"
    from communities c where c.slug = ${communitySlug} limit 1
  `)) as unknown as Array<{
    id: string;
    slug: string;
    name: string;
    type: "community" | "company";
    joinPolicy: "open" | "code" | "email_domain";
    visibility: "public" | "unlisted" | "private";
    memberCount: number;
  }>;
  const c = rows[0];
  if (!c) return { ok: false, status: 404 };

  if (c.visibility === "private") {
    if (!callerUserId) return { ok: false, status: 403 };
    const mem = (await db.execute(sql`
      select 1 from memberships where user_id = ${callerUserId} and community_id = ${c.id} limit 1
    `)) as unknown as Array<unknown>;
    if (mem.length === 0) return { ok: false, status: 403 };
  }

  return {
    ok: true,
    scope: scopeForCommunity(c.id),
    community: {
      slug: c.slug,
      name: c.name,
      type: c.type,
      joinPolicy: c.joinPolicy,
      visibility: c.visibility,
      memberCount: c.memberCount,
    },
  };
}
