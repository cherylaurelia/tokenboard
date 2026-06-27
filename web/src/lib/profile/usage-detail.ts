import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inList } from "@/lib/leaderboard/window-sums";
import { dateRangeList } from "@/lib/leaderboard/windows";

export interface UsageDayPoint {
  date: string;
  tokens: number;
  cost: number; 
}

export interface ProfileUsageDetail {
  points: UsageDayPoint[];
}

export async function profileUsageDetail(
  userId: string,
  windowStart: string,
  windowEnd: string,
): Promise<ProfileUsageDetail> {
  const dates = dateRangeList(windowStart, windowEnd);

  const dayRows = (await db.execute(sql`
    select date::text as date, sum(tokens)::text as tokens, coalesce(sum(cost_usd),0)::text as cost_usd
    from usage_day_total
    where user_id in ${inList([userId])} and date between ${windowStart} and ${windowEnd}
    group by date
  `)) as unknown as Array<{ date: string; tokens: string; cost_usd: string }>;

  const byDate = new Map<string, { tokens: number; cost: number }>();
  for (const r of dayRows) {
    byDate.set(r.date, { tokens: Number(r.tokens), cost: Number(r.cost_usd) });
  }
  const points: UsageDayPoint[] = dates.map((d) => {
    const v = byDate.get(d);
    return { date: d, tokens: v?.tokens ?? 0, cost: v?.cost ?? 0 };
  });

  return { points };
}
