// §7.1 Redis key-builders — the ONLY place key strings form (no magic strings elsewhere).
// MEMBER = user_id uuid (never handle). Community keyed by community_id uuid (never slug).
import type { BoardWindow, BoardMetric } from "@tokenboard/contracts";

// scope = "g" (global) | "c:{community_id}". metric token = "t" (tokens) | "usd" (cost).
export type Scope = "g" | `c:${string}`;
export type MetricToken = "t" | "usd";

export function scopeForCommunity(communityId: string | null): Scope {
  return communityId === null ? "g" : `c:${communityId}`;
}

export function metricToken(metric: BoardMetric): MetricToken {
  return metric === "cost" ? "usd" : "t";
}

// lb:{scope}:{metric}:{window} — the materialized rolling board.
export function lbKey(scope: Scope, metric: MetricToken, window: BoardWindow): string {
  return `lb:${scope}:${metric}:${window}`;
}

// lbday:{scope}:{metric}:{YYYY-MM-DD} — per-day source bucket.
export function lbdayKey(scope: Scope, metric: MetricToken, date: string): string {
  return `lbday:${scope}:${metric}:${date}`;
}

// lbsnap:{scope}:{metric}:{window} — frozen PREVIOUS-PERIOD copy for deltas.
export function lbsnapKey(scope: Scope, metric: MetricToken, window: BoardWindow): string {
  return `lbsnap:${scope}:${metric}:${window}`;
}

// prof:{user_id} — profile cache hash.
export function profKey(userId: string): string {
  return `prof:${userId}`;
}

// TTL constants (§7.4), seconds.
export const DAY_BUCKET_TTL_SEC = 40 * 24 * 60 * 60; // 3_456_000
export const ROLLING_BOARD_TTL_SEC = 2 * 24 * 60 * 60; // 172_800
export const SNAPSHOT_TTL_SEC = 2 * 24 * 60 * 60; // 172_800 — lbsnap re-written nightly
export const PROFILE_TTL_SEC = 6 * 60 * 60; // 21_600

// The two metrics and the two swept windows, enumerated once.
export const METRIC_TOKENS: MetricToken[] = ["t", "usd"];
export const SWEPT_WINDOWS: Array<"7d" | "30d"> = ["7d", "30d"]; // 'all' is incremental-only
export const ALL_WINDOWS: BoardWindow[] = ["7d", "30d", "all"];
