// The communities-hub data: every community a user is a member of + the caller's standing on each
// board (rank / spend / delta). One membership JOIN, then one assembleBoard(limit=1, me=user) per
// board to pull the caller's row. N lookups for N memberships — fine for a handful; flagged for
// batching (a single multi-scope query) if a user joins many communities.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { BoardDelta, BoardQuery } from "@tokenboard/contracts";
import { scopeForCommunity } from "./keys";
import { assembleBoard } from "./assemble-board";
import { WEB_DEFAULT_METRIC, WEB_DEFAULT_WINDOW } from "@/lib/board/web-defaults";

export interface MyCommunity {
  id: string;
  slug: string;
  name: string;
  type: "community" | "company";
  role: "member" | "admin" | "owner";
  memberCount: number;
  joinPolicy: "open" | "code" | "email_domain";
  emailDomain: string | null;
  visibility: "public" | "unlisted" | "private";
  rank: number | null;
  totalEntries: number;
  displayCost: number | null;
  delta: BoardDelta | null;
}

interface Row {
  id: string;
  slug: string;
  name: string;
  type: "community" | "company";
  role: "member" | "admin" | "owner";
  joinPolicy: "open" | "code" | "email_domain";
  visibility: "public" | "unlisted" | "private";
  memberCount: number;
  emailDomain: string | null;
}

// A non-owner viewer MUST NOT see a user's private-board membership; the owner sees all theirs. The
// visibility filter runs in SQL so private boards never reach the per-board assemble loop for
// non-owners. The bound JS boolean is a valid top-level boolean operand in drizzle/postgres-js (it
// is code-controlled, never user input).
export async function listMyCommunities(userId: string, viewerIsOwner: boolean): Promise<MyCommunity[]> {
  const rows = (await db.execute(sql`
    select c.id::text as id, c.slug::text as slug, c.name, c.type,
           m.role, c.join_policy as "joinPolicy", c.visibility as "visibility",
           (select count(*) from memberships mm where mm.community_id = c.id)::int as "memberCount",
           (select d.domain from community_email_domains d where d.community_id = c.id limit 1) as "emailDomain"
    from memberships m
    join communities c on c.id = m.community_id
    where m.user_id = ${userId}
      and (${viewerIsOwner} or c.visibility in ('public', 'unlisted'))
    order by c.name asc
  `)) as unknown as Row[];

  // Per board, the caller's standing (cost metric, 7d window to match the card visuals).
  const query: BoardQuery = {
    community: "",
    window: WEB_DEFAULT_WINDOW,
    metric: WEB_DEFAULT_METRIC,
    limit: 1,
    format: "json",
  };

  return Promise.all(
    rows.map(async (r): Promise<MyCommunity> => {
      const board = await assembleBoard({
        query,
        scope: scopeForCommunity(r.id),
        community: null, // meta already in hand; the assembler doesn't need it for the me-row math
        meUserId: userId,
        callerUserId: userId,
      });
      const meEntry = board.me?.inTopN === false ? board.me.entry : board.entries.find((e) => e.isMe);
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        type: r.type,
        role: r.role,
        memberCount: r.memberCount,
        joinPolicy: r.joinPolicy,
        emailDomain: r.emailDomain,
        visibility: r.visibility,
        rank: board.me?.rank ?? null,
        totalEntries: board.totalEntries,
        displayCost: meEntry?.cost ?? null,
        delta: meEntry?.delta ?? null,
      };
    }),
  );
}
