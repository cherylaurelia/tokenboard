// §7.3 decay sweep. TWO-PHASE per run:
//   PHASE A — for every (scope,metric,window): rebuild lbsnap from the PREVIOUS window's day-buckets
//             (today-7..today-1 for 7d). A genuine period-over-period baseline (NOT a same-day copy
//             of the about-to-be-rebuilt lb:*), reconstructed from buckets so it survives an lb:*
//             TTL expiry.
//   PHASE B — for every (scope,metric,window): ZUNIONSTORE lb from the CURRENT window's buckets
//             AGGREGATE SUM + EXPIRE 2d. Missing buckets contribute nothing = correct decay.
// Doing ALL snapshots before ANY rebuild means an overlapping double-fire can never snapshot a
// half-rebuilt board. The `all` board is NEVER swept (incremental-only). Idempotent on QStash retry.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { redis } from "@/lib/redis/client";
import {
  lbKey,
  lbsnapKey,
  lbdayKey,
  scopeForCommunity,
  ROLLING_BOARD_TTL_SEC,
  SNAPSHOT_TTL_SEC,
  METRIC_TOKENS,
  SWEPT_WINDOWS,
  type Scope,
  type MetricToken,
} from "./keys";
import { currentWindowBucketDates, previousWindowBucketDates } from "./windows";

// Active scopes = global + every community that has >=1 membership.
async function activeScopes(): Promise<Scope[]> {
  const rows = (await db.execute(sql`
    select distinct community_id::text as community_id from memberships
  `)) as unknown as Array<{ community_id: string }>;
  return ["g", ...rows.map((r) => scopeForCommunity(r.community_id))];
}

function bucketKeys(scope: Scope, metric: MetricToken, dates: string[]): string[] {
  return dates.map((d) => lbdayKey(scope, metric, d));
}

export async function runLeaderboardSweep(now: Date = new Date()): Promise<{ scopes: number; boards: number }> {
  const scopes = await activeScopes();
  let boards = 0;

  // PHASE A — snapshots first (previous-period baseline), ALL scopes, before any rebuild. Batched
  // into ONE pipeline (not serial round-trips) so a many-community sweep doesn't stack latency.
  // ZUNIONSTORE over the PREVIOUS window's buckets: an empty source yields an empty/deleted lbsnap
  // => deltas read 'new' (correct cold-board); EXPIRE on a now-missing key is a harmless no-op.
  const snapPipe = redis.pipeline();
  for (const scope of scopes) {
    for (const metric of METRIC_TOKENS) {
      for (const w of SWEPT_WINDOWS) {
        const src = bucketKeys(scope, metric, previousWindowBucketDates(w, now));
        const dest = lbsnapKey(scope, metric, w);
        snapPipe.zunionstore(dest, src.length, src, { aggregate: "sum" });
        snapPipe.expire(dest, SNAPSHOT_TTL_SEC);
      }
    }
  }
  await snapPipe.exec(); // PHASE A fully commits before PHASE B starts (no half-rebuilt snapshots).

  // PHASE B — rebuild current boards + re-EXPIRE, also one pipeline.
  const buildPipe = redis.pipeline();
  for (const scope of scopes) {
    for (const metric of METRIC_TOKENS) {
      for (const w of SWEPT_WINDOWS) {
        const src = bucketKeys(scope, metric, currentWindowBucketDates(w, now));
        const dest = lbKey(scope, metric, w);
        buildPipe.zunionstore(dest, src.length, src, { aggregate: "sum" });
        buildPipe.expire(dest, ROLLING_BOARD_TTL_SEC); // zunionstore sets no TTL
        boards++;
      }
    }
  }
  await buildPipe.exec();
  return { scopes: scopes.length, boards };
}

// Pure decay math lives in sweep-math.ts (no server-only fence -> unit-testable). Re-exported here
// for callers that import from the sweep module.
export { unionWindowFromBuckets } from "./sweep-math";
