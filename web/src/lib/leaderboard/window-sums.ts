// SQL over usage_day_total / usage_day for the leaderboard write-path and read-path.
// Repo idiom (cli/login/poll/route.ts): db.execute(sql`...`) returns rows AS AN ARRAY (not .rows).
// Aggregates cast ::text + parsed: tokens via Number() (exact <2^53), cost via costUsdStringToMicros
// (integer micro-dollars). Every rank/count-producing query EXCLUDES banned users (§4.6).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { costUsdStringToMicros } from "@/lib/redis/micro-dollars";
import { dateRangeList } from "./windows";
import type { BoardWindow, BoardMetric } from "@tokenboard/contracts";
import type { Scope } from "./keys";

export interface UserDayScore {
  tokens: number;
  micros: bigint;
}

// ── write-path ──────────────────────────────────────────────────────────────

// One affected day's authoritative (cross-device) total for this user — the lbday score.
export async function dayTotalForUser(userId: string, date: string): Promise<UserDayScore | null> {
  const rows = (await db.execute(sql`
    select tokens::text as tokens, cost_usd::text as cost_usd
    from usage_day_total where user_id = ${userId} and date = ${date}
  `)) as unknown as Array<{ tokens: string; cost_usd: string }>;
  const r = rows[0];
  if (!r) return null;
  return { tokens: Number(r.tokens), micros: costUsdStringToMicros(r.cost_usd) };
}

// The user's window total (the lb:{...} score). 'all' OMITS the date lower bound (no sentinel).
export async function windowSumForUser(
  userId: string,
  _window: BoardWindow,
  windowStart: string | null,
): Promise<UserDayScore> {
  const lower = windowStart === null ? sql`` : sql`and date >= ${windowStart}`;
  const rows = (await db.execute(sql`
    select coalesce(sum(tokens),0)::text as tokens,
           coalesce(sum(cost_usd),0)::text as cost_usd
    from usage_day_total
    where user_id = ${userId} ${lower}
  `)) as unknown as Array<{ tokens: string; cost_usd: string }>;
  const r = rows[0]!;
  return { tokens: Number(r.tokens), micros: costUsdStringToMicros(r.cost_usd) };
}

// ── read-path ───────────────────────────────────────────────────────────────

// Scope -> the membership filter for community boards (global = no filter). Returns a sql fragment
// joined into the windowed aggregate so c:{id} boards only rank that community's members.
function communityFilter(scope: Scope): { join: ReturnType<typeof sql>; where: ReturnType<typeof sql> } {
  if (scope === "g") return { join: sql``, where: sql`` };
  const communityId = scope.slice(2); // strip "c:"
  return {
    join: sql`join memberships mm on mm.user_id = udt.user_id and mm.community_id = ${communityId}`,
    where: sql``,
  };
}

function dateLower(windowStart: string | null): ReturnType<typeof sql> {
  return windowStart === null ? sql`` : sql`and udt.date >= ${windowStart}`;
}

// Top-N for the Postgres fallback when the Redis board key is empty/missing. banned-excluded; ranked
// by the requested metric desc. Returns [{userId, score}] where score is tokens | micro-dollars.
export async function fallbackBoard(p: {
  scope: Scope;
  metric: BoardMetric;
  windowStart: string | null;
  windowEnd: string;
  limit: number;
}): Promise<Array<{ userId: string; score: number }>> {
  const { join } = communityFilter(p.scope);
  const orderCol = p.metric === "cost" ? sql`sum(udt.cost_usd)` : sql`sum(udt.tokens)`;
  const rows = (await db.execute(sql`
    select udt.user_id::text as user_id,
           coalesce(sum(udt.tokens),0)::text as tokens,
           coalesce(sum(udt.cost_usd),0)::text as cost_usd
    from usage_day_total udt
    join users u on u.id = udt.user_id and u.banned_at is null
    ${join}
    where udt.date <= ${p.windowEnd} ${dateLower(p.windowStart)}
    group by udt.user_id
    having ${orderCol} > 0
    order by ${orderCol} desc
    limit ${p.limit}
  `)) as unknown as Array<{ user_id: string; tokens: string; cost_usd: string }>;
  return rows.map((r) => ({
    userId: r.user_id,
    score: p.metric === "cost" ? Number(costUsdStringToMicros(r.cost_usd)) : Number(r.tokens),
  }));
}

// "Your rank" + totalEntries for the fallback path (banned-excluded). rank/score null when the user
// has no in-window rows; userId=null -> {rank:null, score:null, totalEntries}.
export async function fallbackMeRank(p: {
  scope: Scope;
  metric: BoardMetric;
  windowStart: string | null;
  windowEnd: string;
  userId: string | null;
}): Promise<{ rank: number | null; score: number | null; totalEntries: number }> {
  const { join } = communityFilter(p.scope);
  const orderCol = p.metric === "cost" ? sql`sum(udt.cost_usd)` : sql`sum(udt.tokens)`;
  const rows = (await db.execute(sql`
    with ranked as (
      select udt.user_id::text as user_id,
             coalesce(sum(udt.tokens),0)::text as tokens,
             coalesce(sum(udt.cost_usd),0)::text as cost_usd,
             rank() over (order by ${orderCol} desc) as rk
      from usage_day_total udt
      join users u on u.id = udt.user_id and u.banned_at is null
      ${join}
      where udt.date <= ${p.windowEnd} ${dateLower(p.windowStart)}
      group by udt.user_id
      having ${orderCol} > 0
    )
    select (select count(*)::int from ranked) as total,
           r.rk::int as rk, r.tokens, r.cost_usd
    from ranked r
    where r.user_id = ${p.userId ?? ""}
  `)) as unknown as Array<{ total: number; rk: number | null; tokens: string; cost_usd: string }>;
  // total comes back on every row; when the user has no row we need a separate count.
  if (rows.length === 0) {
    const t = (await db.execute(sql`
      with ranked as (
        select udt.user_id
        from usage_day_total udt
        join users u on u.id = udt.user_id and u.banned_at is null
        ${join}
        where udt.date <= ${p.windowEnd} ${dateLower(p.windowStart)}
        group by udt.user_id
        having ${orderCol} > 0
      ) select count(*)::int as total from ranked
    `)) as unknown as Array<{ total: number }>;
    return { rank: null, score: null, totalEntries: t[0]?.total ?? 0 };
  }
  const r = rows[0]!;
  return {
    rank: r.rk,
    score: p.metric === "cost" ? Number(costUsdStringToMicros(r.cost_usd)) : Number(r.tokens),
    totalEntries: r.total,
  };
}

// Per-user daily token series for sparklines, zero-filled across [windowStart..windowEnd].
export async function sparklinesForUsers(
  ids: string[],
  windowStart: string,
  windowEnd: string,
): Promise<Map<string, Array<{ date: string; tokens: number }>>> {
  const out = new Map<string, Array<{ date: string; tokens: number }>>();
  if (ids.length === 0) return out;
  const dates = dateRangeList(windowStart, windowEnd);
  const rows = (await db.execute(sql`
    select user_id::text as user_id, date::text as date, sum(tokens)::text as tokens
    from usage_day_total
    where user_id = any(${ids}) and date between ${windowStart} and ${windowEnd}
    group by user_id, date
  `)) as unknown as Array<{ user_id: string; date: string; tokens: string }>;
  const byUser = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = byUser.get(r.user_id) ?? new Map<string, number>();
    m.set(r.date, Number(r.tokens));
    byUser.set(r.user_id, m);
  }
  for (const id of ids) {
    const m = byUser.get(id) ?? new Map<string, number>();
    out.set(id, dates.map((d) => ({ date: d, tokens: m.get(d) ?? 0 })));
  }
  return out;
}

// The user's highest-token tool in the window (one row per user).
export async function topToolForUsers(
  ids: string[],
  windowStart: string | null,
  windowEnd: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const lower = windowStart === null ? sql`` : sql`and date >= ${windowStart}`;
  const rows = (await db.execute(sql`
    select distinct on (user_id) user_id::text as user_id, tool
    from usage_day
    where user_id = any(${ids}) and date <= ${windowEnd} ${lower}
    group by user_id, tool
    order by user_id, sum(tokens) desc, tool asc
  `)) as unknown as Array<{ user_id: string; tool: string }>;
  for (const r of rows) out.set(r.user_id, r.tool);
  return out;
}

// Earliest synced day across the given users — the 'all' sparkline lower bound.
export async function earliestDateForUsers(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const rows = (await db.execute(sql`
    select min(date)::text as min_date from usage_day_total where user_id = any(${ids})
  `)) as unknown as Array<{ min_date: string | null }>;
  return rows[0]?.min_date ?? null;
}
