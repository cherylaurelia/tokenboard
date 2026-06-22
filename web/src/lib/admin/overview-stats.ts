// Owner-dashboard overview aggregates. ONE round-trip via db.execute. Service-role read (sees banned).
// "synced today" = distinct users with a usage_day_total row dated today (UTC). $ folds via
// shapeOverview (micro-dollar idiom, no float).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { shapeOverview, type OverviewRaw, type OverviewStats } from "./admin-shape";

export async function loadOverviewStats(): Promise<OverviewStats> {
  const rows = (await db.execute(sql`
    select
      (select count(*) from users)::text as "usersTotal",
      (select count(*) from users where banned_at is null)::text as "usersLive",
      (select count(*) from users where banned_at is not null)::text as "usersBanned",
      (select count(*) from communities)::text as "communitiesTotal",
      (select count(*) from communities where type = 'community')::text as "communitiesCommunity",
      (select count(*) from communities where type = 'company')::text as "communitiesCompany",
      (select count(*) from memberships)::text as "memberships",
      (select coalesce(sum(tokens),0) from usage_day_total)::text as "tokensAllTime",
      (select coalesce(sum(cost_usd),0) from usage_day_total)::text as "costAllTime",
      (select count(distinct user_id) from usage_day_total
         where date = (now() at time zone 'utc')::date)::text as "syncedToday"
  `)) as unknown as OverviewRaw[];
  return shapeOverview(rows[0]!);
}
