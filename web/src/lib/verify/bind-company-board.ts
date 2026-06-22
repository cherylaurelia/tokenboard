// §5.2 first-verifier-creates the company board; subsequent verifiers join it. The first verifier is
// role='member' NOT admin (anti-admin-grab). reverify_due=now()+180d. Idempotent re-verify refreshes
// reverify_due + verified_via (NOT role). Concurrent first-verifiers: the domain UNIQUE race -> 23505
// -> re-SELECT the now-existing board and join it (never 500). INVARIANT (documented): company
// memberships are ONLY ever written here, always role='member'. CALLED ONLY BY confirm AFTER the
// consume CAS (single-use guaranteed there).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { communities, communityEmailDomains, memberships } from "@/db/schema";
import { slugFromDomain } from "@/lib/communities/slug";

const UNIQUE_VIOLATION = "23505";
const SLUG_RETRIES = 6;

export interface BoundBoard {
  id: string;
  slug: string;
}

export async function bindCompanyBoard(userId: string, domain: string): Promise<BoundBoard> {
  const board = await findOrCreateCompanyBoard(userId, domain);

  // 180d reverify. Idempotent on UNIQUE(user_id,community_id): a re-verify refreshes reverify_due +
  // verified_via, never role (a re-verify must not flip an admin/owner back to member, and the first
  // verifier stays 'member').
  await db
    .insert(memberships)
    .values({
      userId,
      communityId: board.id,
      role: "member",
      joinedVia: "email", // joined_via is free-text (no CHECK)
      verifiedVia: `email:${domain}`,
      reverifyDue: sql`now() + interval '180 days'`,
    })
    .onConflictDoUpdate({
      target: [memberships.userId, memberships.communityId],
      set: { verifiedVia: `email:${domain}`, reverifyDue: sql`now() + interval '180 days'` },
    });

  return board;
}

async function findOrCreateCompanyBoard(userId: string, domain: string): Promise<BoundBoard> {
  const existing = await selectBoardForDomain(domain);
  if (existing) return existing;

  const base = slugFromDomain(domain);
  for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
    // Clamp the base so a "-N" suffix always fits in the 40-char column (a naive .slice(0,40) after
    // appending would truncate the suffix away, making every retry collide identically).
    const slug = attempt === 0 ? base : `${base.slice(0, 38)}-${attempt + 1}`;
    try {
      return await db.transaction(async (tx) => {
        const [c] = await tx
          .insert(communities)
          .values({
            type: "company",
            slug,
            name: domain, // pretty-name refinement deferred; domain is a safe default
            joinPolicy: "email_domain", // satisfies communities_company_is_email_domain CHECK
            visibility: "public",
            joinCode: null,
            createdBy: userId,
          })
          .returning({ id: communities.id, slug: communities.slug });
        await tx.insert(communityEmailDomains).values({ communityId: c!.id, domain });
        return { id: c!.id, slug: c!.slug };
      });
    } catch (err) {
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      // 23505: either the domain UNIQUE lost the race to a concurrent first-verifier (re-select and
      // use it), or only the slug collided (re-select returns null -> loop with the next suffix).
      const raced = await selectBoardForDomain(domain);
      if (raced) return raced;
    }
  }
  throw new Error(`bindCompanyBoard: exhausted slug retries for ${domain}`);
}

async function selectBoardForDomain(domain: string): Promise<BoundBoard | null> {
  const rows = (await db.execute(sql`
    select c.id::text as id, c.slug::text as slug
    from community_email_domains d join communities c on c.id = d.community_id
    where d.domain = ${domain} limit 1
  `)) as unknown as Array<{ id: string; slug: string }>;
  return rows[0] ?? null;
}
