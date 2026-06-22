// §7.6 rebuild-from-Postgres — Redis loss is a non-event. For each active scope+metric: DEL the
// target keyspace (so a stale/banned member can't survive), re-seed the last 40 days of day-buckets
// from usage_day_total (banned-excluded), then run the sweep to materialize 7d/30d + re-seed `all`.
// Idempotent + hot-safe (DEL-before-seed + authoritative ZADD).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { redis } from "@/lib/redis/client";
import { costUsdStringToMicros } from "@/lib/redis/micro-dollars";
import {
  lbKey,
  lbdayKey,
  lbsnapKey,
  scopeForCommunity,
  DAY_BUCKET_TTL_SEC,
  ALL_WINDOWS,
  METRIC_TOKENS,
  type Scope,
  type MetricToken,
} from "./keys";
import { todayUtcYmd } from "./windows";
import { runLeaderboardSweep } from "./sweep";
import { windowSumForUser } from "./window-sums";

const REBUILD_DAYS = 40;

// rows of (scope, date, user_id, tokens, micros) for the last 40 days. Global = all non-banned;
// community boards filter by memberships. Returned grouped for ZADD.
interface DayRow {
  scope: Scope;
  date: string;
  userId: string;
  tokens: number;
  micros: bigint;
}

async function seedRows(): Promise<DayRow[]> {
  const out: DayRow[] = [];

  // Global buckets: every non-banned user's per-day total over the last 40 days.
  const g = (await db.execute(sql`
    select udt.date::text as date, udt.user_id::text as user_id,
           udt.tokens::text as tokens, udt.cost_usd::text as cost_usd
    from usage_day_total udt
    join users u on u.id = udt.user_id and u.banned_at is null
    where udt.date >= current_date - ${REBUILD_DAYS}
  `)) as unknown as Array<{ date: string; user_id: string; tokens: string; cost_usd: string }>;
  for (const r of g) {
    out.push({ scope: "g", date: r.date, userId: r.user_id, tokens: Number(r.tokens), micros: costUsdStringToMicros(r.cost_usd) });
  }

  // Community buckets: same rows, scoped to each community the user belongs to.
  const c = (await db.execute(sql`
    select m.community_id::text as community_id, udt.date::text as date, udt.user_id::text as user_id,
           udt.tokens::text as tokens, udt.cost_usd::text as cost_usd
    from usage_day_total udt
    join users u on u.id = udt.user_id and u.banned_at is null
    join memberships m on m.user_id = udt.user_id
    where udt.date >= current_date - ${REBUILD_DAYS}
  `)) as unknown as Array<{ community_id: string; date: string; user_id: string; tokens: string; cost_usd: string }>;
  for (const r of c) {
    out.push({
      scope: scopeForCommunity(r.community_id),
      date: r.date,
      userId: r.user_id,
      tokens: Number(r.tokens),
      micros: costUsdStringToMicros(r.cost_usd),
    });
  }
  return out;
}

export async function rebuildBoardsFromPostgres(now: Date = new Date()): Promise<{ scopes: number; buckets: number }> {
  const rows = await seedRows();
  const scopes = new Set<Scope>(["g", ...rows.map((r) => r.scope)]);

  // 1) DEL the target keyspace (lb + lbday + lbsnap, both metrics, all/swept windows) per scope so a
  // departed/banned member can't survive a rebuild. Buckets for the 40d window are re-DEL'd by date.
  const delPipe = redis.pipeline();
  const today = todayUtcYmd(now);
  for (const scope of scopes) {
    for (const metric of METRIC_TOKENS) {
      for (const w of ALL_WINDOWS) {
        delPipe.del(lbKey(scope, metric, w));
        if (w !== "all") delPipe.del(lbsnapKey(scope, metric, w));
      }
      for (let i = 0; i < REBUILD_DAYS + 1; i++) {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - i);
        delPipe.del(lbdayKey(scope, metric, d.toISOString().slice(0, 10)));
      }
    }
  }
  await delPipe.exec();

  // 2) Re-seed day buckets (authoritative ZADD), both metrics, + 40d TTL.
  const seedPipe = redis.pipeline();
  for (const r of rows) {
    seedPipe.zadd(lbdayKey(r.scope, "t", r.date), { score: r.tokens, member: r.userId });
    seedPipe.zadd(lbdayKey(r.scope, "usd", r.date), { score: Number(r.micros), member: r.userId });
  }
  for (const scope of scopes) {
    for (const metric of METRIC_TOKENS) {
      for (let i = 0; i < REBUILD_DAYS + 1; i++) {
        const d = new Date(`${today}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - i);
        seedPipe.expire(lbdayKey(scope, metric, d.toISOString().slice(0, 10)), DAY_BUCKET_TTL_SEC);
      }
    }
  }
  await seedPipe.exec();

  // 3) Materialize 7d/30d (+ lbsnap) via the sweep.
  await runLeaderboardSweep(now);

  // 4) Re-seed the `all` board (never swept) = each user's all-time window sum.
  const allUsers = [...new Set(rows.map((r) => `${r.scope}::${r.userId}`))];
  const allPipe = redis.pipeline();
  for (const su of allUsers) {
    const sep = su.indexOf("::");
    const scope = su.slice(0, sep) as Scope;
    const userId = su.slice(sep + 2);
    const s = await windowSumForUser(userId, "all", null);
    allPipe.zadd(lbKey(scope, "t", "all"), { score: s.tokens, member: userId });
    allPipe.zadd(lbKey(scope, "usd", "all"), { score: Number(s.micros), member: userId });
  }
  await allPipe.exec();

  return { scopes: scopes.size, buckets: rows.length };
}
