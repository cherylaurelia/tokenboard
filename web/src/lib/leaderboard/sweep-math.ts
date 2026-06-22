// Pure decay math (no I/O, no server-only fence so it's unit-testable under tsx). SUM over PRESENT
// buckets only — a member with no present-bucket score is absent (fell out of the window). The
// sweep itself (sweep.ts) does the Redis ZUNIONSTORE; this mirrors that math for tests + reuse.
export function unionWindowFromBuckets(buckets: Array<Map<string, number>>): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of buckets) {
    for (const [member, score] of b) out.set(member, (out.get(member) ?? 0) + score);
  }
  return out;
}
