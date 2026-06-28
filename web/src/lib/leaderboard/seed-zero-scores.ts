// Put a claimed user on the leaderboard at score 0 so "claim = on the board" — even before (or
// without) any synced usage. Uses ZADD NX (add-only-if-absent) so it NEVER overwrites a real score:
// a $0 seed yields to the user's actual total the moment they sync, and re-seeding is a harmless
// no-op once they have a score.
//
// WHY two callers:
//   - approve route (claim time) -> instant board presence.
//   - the nightly sweep -> the 7d/30d boards are ZUNIONSTORE-rebuilt from usage buckets, which drops
//     zero-usage users; re-seeding after the rebuild keeps them present. (`all` has no sweep, so the
//     claim-time seed there persists on its own — re-seeding it is still a cheap no-op.)
//
// Banned users are skipped: their scores must never enter Redis (ZCARD/ZREVRANK count members the
// read-path filters out). Both metrics, all windows, every scope the user belongs to.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { redis } from "@/lib/redis/client";
import {
  lbKey,
  scopeForCommunity,
  ROLLING_BOARD_TTL_SEC,
  METRIC_TOKENS,
  ALL_WINDOWS,
  type Scope,
} from "./keys";

// global + every community the user is a member of (community_id uuids, never slug).
async function scopesForUser(userId: string): Promise<Scope[]> {
  const rows = (await db.execute(sql`
    select community_id::text as community_id from memberships where user_id = ${userId}
  `)) as unknown as Array<{ community_id: string }>;
  return ["g", ...rows.map((r) => scopeForCommunity(r.community_id))];
}

async function isBanned(userId: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    select 1 from users where id = ${userId} and banned_at is not null limit 1
  `)) as unknown as Array<unknown>;
  return rows.length > 0;
}

// Seed score 0 for one user across their scopes. NON-FATAL by contract: the caller decides whether a
// Redis failure should surface (claim swallows it; the sweep logs it). Returns the lb keys touched.
export async function seedZeroScoresForUser(userId: string): Promise<string[]> {
  if (await isBanned(userId)) return [];
  const scopes = await scopesForUser(userId);
  return seedZeroScoresForScopes(userId, scopes);
}

// Lower-level variant when the caller already knows the scopes (the sweep iterates active scopes and
// seeds the global roster, so it skips the per-user membership lookup).
export async function seedZeroScoresForScopes(userId: string, scopes: Scope[]): Promise<string[]> {
  const pipe = redis.pipeline();
  const touched: string[] = [];
  for (const scope of scopes) {
    for (const mt of METRIC_TOKENS) {
      for (const w of ALL_WINDOWS) {
        const k = lbKey(scope, mt, w);
        // NX: only sets when the member is absent — never clobbers a real synced score.
        pipe.zadd(k, { nx: true }, { score: 0, member: userId });
        if (w !== "all") pipe.expire(k, ROLLING_BOARD_TTL_SEC);
        touched.push(k);
      }
    }
  }
  await pipe.exec();
  return touched;
}
