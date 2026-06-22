// Every user, INCLUDING banned (the People table is the one place banned must show — assembleBoard
// excludes them by design, so this is its OWN raw query that omits the banned filter). Service-role
// read. all-time tokens/$ from a usage_day_total LEFT JOIN (zero-usage + banned still appear). $ folds
// via shapeUser. global_rank is a window rank over LIVE rows with cost>0 only (banned/zero -> null) so
// the column roughly matches the public global-cost ordering. NOTE: an admin-glance approximation —
// SQL rank() gives ties a shared rank with gaps, while the live board uses sequential 1-based ranks
// off the Redis ZSET; a tokens>0/cost=0 user shows on the live usd board but is null here. Acceptable.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { shapeUser, type UserRaw, type AdminUserRow } from "./admin-shape";

export async function listAllUsers(): Promise<AdminUserRow[]> {
  const rows = (await db.execute(sql`
    with spend as (
      select user_id,
             coalesce(sum(tokens),0)::text as tokens,
             coalesce(sum(cost_usd),0)::text as cost_usd
      from usage_day_total group by user_id
    )
    select u.id::text as id, u.handle::text as handle, u.display_name, u.avatar_url,
           u.github_login::text as github_login, u.is_admin, u.banned_at, u.created_at,
           coalesce(s.tokens,'0') as tokens, coalesce(s.cost_usd,'0') as cost_usd,
           (select count(*) from memberships m where m.user_id = u.id)::int as community_count,
           case when u.banned_at is null and coalesce(s.cost_usd::numeric,0) > 0
                then rank() over (
                  order by case when u.banned_at is null then coalesce(s.cost_usd::numeric,0)
                                else null end desc nulls last
                )::int
                else null end as global_rank
    from users u
    left join spend s on s.user_id = u.id
    order by (u.banned_at is null) desc, coalesce(s.cost_usd::numeric,0) desc, u.created_at asc
  `)) as unknown as UserRaw[];
  return rows.map(shapeUser);
}
