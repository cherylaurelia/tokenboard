// Pure UTC window math (§7.3). Derive ONCE per request so Redis scores, the SQL window-sum, sparkline
// zero-fill, the fallback, AND the sweep all agree (off-by-one here desyncs decay). Inclusive both
// ends: 7d = today-6..today (7 days), 30d = today-29..today.
import type { BoardWindow } from "@tokenboard/contracts";

export function todayUtcYmd(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Number of days a rolling window spans (all -> caller supplies the earliest bound).
export function windowDayCount(window: BoardWindow): number | null {
  if (window === "7d") return 7;
  if (window === "30d") return 30;
  return null; // all
}

// Contiguous UTC date list [start..end] inclusive, ascending.
export function dateRangeList(windowStart: string, windowEnd: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${windowStart}T00:00:00Z`);
  const end = new Date(`${windowEnd}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(ymd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// windowStart/windowEnd for 7d/30d. For 'all' there is NO lower bound -> windowStart=null (callers
// OMIT the date predicate; sparkline uses an explicit earliest from data).
export function windowBounds(
  window: BoardWindow,
  now: Date = new Date(),
): { windowStart: string | null; windowEnd: string } {
  const windowEnd = todayUtcYmd(now);
  const count = windowDayCount(window);
  if (count === null) return { windowStart: null, windowEnd };
  const start = new Date(`${windowEnd}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (count - 1));
  return { windowStart: ymd(start), windowEnd };
}

// The CURRENT window's contiguous day-bucket dates (today-(n-1)..today). The sweep ZUNIONSTOREs these.
// SINGLE SOURCE OF TRUTH — the sweep MUST reuse this (the test asserts currentWindowBucketDates ===
// dateRangeList(windowBounds)).
export function currentWindowBucketDates(window: "7d" | "30d", now: Date = new Date()): string[] {
  const { windowStart, windowEnd } = windowBounds(window, now);
  return dateRangeList(windowStart!, windowEnd);
}

// The PREVIOUS window's day-bucket dates (shifted back one full day): for 7d that is today-7..today-1.
// The nightly sweep snapshots lbsnap from THESE buckets so deltas are genuinely period-over-period,
// NOT a same-day copy of the about-to-be-rebuilt lb:*. Reconstructed from day-buckets so the baseline
// survives an lb:* TTL expiry too.
export function previousWindowBucketDates(window: "7d" | "30d", now: Date = new Date()): string[] {
  const n = windowDayCount(window)!;
  const end = new Date(`${todayUtcYmd(now)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1); // windowEnd = yesterday
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (n - 1));
  return dateRangeList(ymd(start), ymd(end));
}
