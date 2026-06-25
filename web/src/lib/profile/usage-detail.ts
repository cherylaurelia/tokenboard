// Profile-only usage detail for the rich profile chart: a per-day series carrying BOTH tokens and
// cost (so the chart can toggle between them) plus a per-tool token breakdown over the same window.
// This is intentionally separate from the shared board sparkline (§7.2 {date,tokens}) — it's a
// profile-page read, not part of the cached board contract, so it doesn't bloat the board API/cache.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inList } from "@/lib/leaderboard/window-sums";
import { dateRangeList } from "@/lib/leaderboard/windows";

export interface UsageDayPoint {
  date: string; // YYYY-MM-DD
  tokens: number;
  cost: number; // USD
}

export interface ToolSlice {
  tool: string;
  tokens: number;
}

export interface ProfileUsageDetail {
  points: UsageDayPoint[];
  tools: ToolSlice[]; // descending by tokens
}

// windowStart/windowEnd are inclusive ISO dates (the board's sparkline bounds). One user.
export async function profileUsageDetail(
  userId: string,
  windowStart: string,
  windowEnd: string,
): Promise<ProfileUsageDetail> {
  const dates = dateRangeList(windowStart, windowEnd);

  // Per-day tokens + cost from the cross-device totals table (board score source).
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

  // Per-tool token totals across the window (usage_day carries the per-tool rows).
  const toolRows = (await db.execute(sql`
    select tool, sum(tokens)::text as tokens
    from usage_day
    where user_id in ${inList([userId])} and date between ${windowStart} and ${windowEnd}
    group by tool
    having sum(tokens) > 0
    order by sum(tokens) desc, tool asc
  `)) as unknown as Array<{ tool: string; tokens: string }>;

  const tools: ToolSlice[] = toolRows.map((r) => ({ tool: r.tool, tokens: Number(r.tokens) }));

  return { points, tools };
}
