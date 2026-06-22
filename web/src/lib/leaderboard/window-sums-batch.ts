// Batched per-user window totals for BOTH metrics in ONE query — used by the assembler to fill the
// row's OFF-metric field (the `cost` on a tokens board, the `tokens` on a cost board) without an
// N+1. The ranked metric comes from the Redis score; this supplies the other number.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { microsToUsd2dp, costUsdStringToMicros } from "@/lib/redis/micro-dollars";
import { inList } from "./window-sums";

export interface WindowTotals {
  tokens: number;
  cost2dp: number;
}

export async function windowTotalsForUsers(
  ids: string[],
  windowStart: string | null,
  windowEnd: string,
): Promise<Map<string, WindowTotals>> {
  const out = new Map<string, WindowTotals>();
  if (ids.length === 0) return out;
  const lower = windowStart === null ? sql`` : sql`and date >= ${windowStart}`;
  const rows = (await db.execute(sql`
    select user_id::text as user_id,
           coalesce(sum(tokens),0)::text as tokens,
           coalesce(sum(cost_usd),0)::text as cost_usd
    from usage_day_total
    where user_id in ${inList(ids)} and date <= ${windowEnd} ${lower}
    group by user_id
  `)) as unknown as Array<{ user_id: string; tokens: string; cost_usd: string }>;
  for (const r of rows) {
    out.set(r.user_id, {
      tokens: Number(r.tokens),
      cost2dp: microsToUsd2dp(costUsdStringToMicros(r.cost_usd)),
    });
  }
  return out;
}
