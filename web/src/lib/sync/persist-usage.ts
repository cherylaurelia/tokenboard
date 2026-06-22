// §6.4 steps 8-10 in ONE Postgres transaction. Per affected (user_id, date):
//   8. upsert usage_day (overwrite this device's row — idempotent at the PK).
//   9. recompute usage_day_total = SUM over ALL the user's rows that date (cross-device SUM).
//  10. plausibility flag (advisory only — never clip/exclude).
// A pg_advisory_xact_lock keyed on (user_id, date) is taken BEFORE the SUM so two concurrent
// multi-device syncs for the same day can't lose-update the rollup (READ COMMITTED would otherwise
// under-count). The lock is released automatically at commit/rollback.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { usageDay, usageDayTotal } from "@/db/schema";
import { isImplausibleDayTotal } from "./plausibility";
import type { PricedRecord } from "./compute-cost";
import type { SyncFlag } from "./validate-records";

export interface PersistResult {
  daysAffected: string[];
  flags: SyncFlag[];
}

export async function persistUsage(params: {
  userId: string;
  deviceId: string;
  priced: PricedRecord[];
  priceTableVersion: string;
}): Promise<PersistResult> {
  const { userId, deviceId, priced, priceTableVersion } = params;
  if (priced.length === 0) return { daysAffected: [], flags: [] };

  const daysAffected = [...new Set(priced.map((p) => p.record.date))].sort();
  const flags: SyncFlag[] = [];

  await db.transaction(async (tx) => {
    // Step 8 — upsert each record's usage_day row (overwrite this device's row on conflict).
    for (const p of priced) {
      const r = p.record;
      await tx
        .insert(usageDay)
        .values({
          userId,
          deviceId,
          date: r.date,
          tool: r.tool,
          model: r.model,
          inputTokens: BigInt(r.input),
          outputTokens: BigInt(r.output),
          cacheReadTokens: BigInt(r.cacheRead),
          cacheCreate5m: BigInt(r.cacheCreate5m),
          cacheCreate1h: BigInt(r.cacheCreate1h),
          tokens: p.tokens,
          costUsd: p.costUsd6dp,
          priceTableVersion,
        })
        .onConflictDoUpdate({
          target: [usageDay.userId, usageDay.deviceId, usageDay.date, usageDay.tool, usageDay.model],
          set: {
            inputTokens: BigInt(r.input),
            outputTokens: BigInt(r.output),
            cacheReadTokens: BigInt(r.cacheRead),
            cacheCreate5m: BigInt(r.cacheCreate5m),
            cacheCreate1h: BigInt(r.cacheCreate1h),
            tokens: p.tokens,
            costUsd: p.costUsd6dp,
            priceTableVersion,
            updatedAt: sql`now()`,
          },
        });
    }

    // Steps 9-10 — per affected day: advisory lock, recompute the cross-device total, flag.
    for (const date of daysAffected) {
      // Serialize concurrent rollups for this (user, date) so the read-modify-write can't lose updates.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext(${date}))`);

      await tx.execute(sql`
        insert into usage_day_total (user_id, date, tokens, cost_usd, updated_at)
        select user_id, date, sum(tokens), sum(cost_usd), now()
          from usage_day where user_id = ${userId} and date = ${date}
          group by user_id, date
        on conflict (user_id, date) do update set
          tokens = excluded.tokens, cost_usd = excluded.cost_usd, updated_at = now()
      `);

      const [total] = await tx
        .select({ tokens: usageDayTotal.tokens })
        .from(usageDayTotal)
        .where(and(eq(usageDayTotal.userId, userId), eq(usageDayTotal.date, date)))
        .limit(1);

      if (total && isImplausibleDayTotal(BigInt(total.tokens))) {
        flags.push({
          code: "DAY_TOTAL_IMPLAUSIBLE",
          date,
          detail: "day total exceeds the plausibility ceiling; flagged not clipped, counts preserved",
        });
      }
    }
  });

  return { daysAffected, flags };
}
