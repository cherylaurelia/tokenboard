// §7.3 / §6.4 steps 11+12 — POST-COMMIT leaderboard writer. Runs AFTER persistUsage's tx commits
// (a rolled-back DB leaves no phantom score). Returns the lb keys it touched (boardsTouched); the
// CDN/ISR purge of those is Phase 9. ZADD is ABSOLUTE-SET (idempotent overwrite), never ZINCRBY (a
// re-sync overwrites usage_day, so the board SETs the recomputed total). The CALLER wraps this in
// try/catch — a Redis failure post-commit is NON-FATAL (Postgres is truth, rebuildable §7.6).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { redis } from "@/lib/redis/client";
import {
  lbKey,
  lbdayKey,
  scopeForCommunity,
  DAY_BUCKET_TTL_SEC,
  ROLLING_BOARD_TTL_SEC,
  ALL_WINDOWS,
  type Scope,
  type MetricToken,
} from "./keys";
import { windowBounds } from "./windows";
import { dayTotalForUser, windowSumForUser } from "./window-sums";

interface UserDayScoreLite {
  tokens: number;
  micros: bigint;
}

// Scopes a user's scores belong to: global + every community membership (community_id uuids, never
// slug). A user is always on the global board.
async function scopesForUser(userId: string): Promise<Scope[]> {
  const rows = (await db.execute(sql`
    select community_id::text as community_id from memberships where user_id = ${userId}
  `)) as unknown as Array<{ community_id: string }>;
  return ["g", ...rows.map((r) => scopeForCommunity(r.community_id))];
}

// A banned user can still sync (device auth checks the token, not users.banned_at), so we must NOT
// let their scores enter Redis — otherwise ZCARD/ZREVRANK (me.rank, totalEntries) would count a
// member the read-path filters out of entries[]. The read-path excludes banned too (belt+braces),
// and rebuild seeds banned-free; this keeps the live board banned-clean between rebuilds.
async function isBanned(userId: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    select 1 from users where id = ${userId} and banned_at is not null limit 1
  `)) as unknown as Array<unknown>;
  return rows.length > 0;
}

export async function writeLeaderboardOnSync(params: {
  userId: string;
  daysAffected: string[];
  now?: Date;
}): Promise<string[]> {
  const { userId, daysAffected } = params;
  const now = params.now ?? new Date();
  if (daysAffected.length === 0) return [];

  // Banned users never enter the leaderboard (§4.6 — the only ranking exclusion).
  if (await isBanned(userId)) return [];

  const scopes = await scopesForUser(userId);

  // Day-bucket scores (one SQL per affected day, reused across scopes — usage_day_total is
  // per-(user,date), so a member's contribution to ANY board they're on is their own total).
  const dayScores = new Map<string, UserDayScoreLite>();
  for (const date of daysAffected) {
    const s = await dayTotalForUser(userId, date);
    if (s) dayScores.set(date, { tokens: s.tokens, micros: s.micros });
  }

  // Each window's sum once (per user; same across scopes for the same reason).
  const bounds = {
    "7d": windowBounds("7d", now),
    "30d": windowBounds("30d", now),
    all: windowBounds("all", now),
  } as const;
  const windowSums = new Map<string, UserDayScoreLite>();
  for (const w of ALL_WINDOWS) {
    const s = await windowSumForUser(userId, w, bounds[w].windowStart);
    windowSums.set(w, { tokens: s.tokens, micros: s.micros });
  }

  const pipe = redis.pipeline();
  const touched: string[] = [];
  const metrics: Array<[MetricToken, (s: UserDayScoreLite) => number]> = [
    ["t", (s) => s.tokens],
    ["usd", (s) => Number(s.micros)],
  ];

  for (const scope of scopes) {
    for (const [mt, pick] of metrics) {
      // 1) day buckets + 40d TTL
      for (const date of daysAffected) {
        const s = dayScores.get(date);
        const k = lbdayKey(scope, mt, date);
        if (s) {
          pipe.zadd(k, { score: pick(s), member: userId });
        } else {
          pipe.zrem(k, userId); // all rows for that date removed -> drop from the bucket
        }
        pipe.expire(k, DAY_BUCKET_TTL_SEC);
      }
      // 2) incremental rolling-window patch (absolute set) + TTL (none on `all`)
      for (const w of ALL_WINDOWS) {
        const s = windowSums.get(w)!;
        const k = lbKey(scope, mt, w);
        pipe.zadd(k, { score: pick(s), member: userId });
        if (w !== "all") pipe.expire(k, ROLLING_BOARD_TTL_SEC);
        touched.push(k);
      }
    }
  }

  await pipe.exec(); // one round-trip; rejection caught by the CALLER (non-fatal).
  return touched;
}
