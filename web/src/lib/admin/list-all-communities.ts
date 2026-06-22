// Every community for the Communities table. Service-role read. memberCount + total spend computed in
// SQL; $ folds via shapeCommunity. total spend counts LIVE members only (join users ... banned_at is
// null) so the displayed total matches the sum of the expandable per-community ranks (assembleBoard
// also excludes banned). created_by handle for the owner col.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { shapeCommunity, type CommunityRaw, type AdminCommunityRow } from "./admin-shape";

export async function listAllCommunities(): Promise<AdminCommunityRow[]> {
  const rows = (await db.execute(sql`
    select c.id::text as id, c.slug::text as slug, c.name, c.type, c.visibility,
           c.join_policy, cu.handle::text as created_by_handle,
           (select count(*) from memberships m where m.community_id = c.id)::int as member_count,
           coalesce((
             select sum(udt.cost_usd) from usage_day_total udt
             join memberships m2 on m2.user_id = udt.user_id and m2.community_id = c.id
             join users bu on bu.id = udt.user_id and bu.banned_at is null
           ),0)::text as cost_usd,
           c.created_at
    from communities c
    left join users cu on cu.id = c.created_by
    order by c.created_at desc
  `)) as unknown as CommunityRaw[];
  return rows.map(shapeCommunity);
}
