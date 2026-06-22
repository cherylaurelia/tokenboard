import { test } from "node:test";
import assert from "node:assert/strict";
import { unionWindowFromBuckets } from "@/lib/leaderboard/sweep-math";
import { currentWindowBucketDates, previousWindowBucketDates } from "@/lib/leaderboard/windows";

const NOW = new Date("2026-06-22T09:00:00.000Z");

test("union SUMs a member's scores across present buckets", () => {
  const out = unionWindowFromBuckets([
    new Map([["u1", 100], ["u2", 50]]),
    new Map([["u1", 30]]),
  ]);
  assert.equal(out.get("u1"), 130);
  assert.equal(out.get("u2"), 50);
});

test("a member present only in OUT-OF-WINDOW buckets is absent (decay)", () => {
  // The current window passes only in-window buckets; a user with no in-window bucket -> not in the
  // union -> falls out of the board. Simulate: current union gets buckets WITHOUT that member.
  const current = unionWindowFromBuckets([new Map([["active", 10]])]);
  assert.equal(current.has("wentQuiet"), false);
  assert.equal(current.get("active"), 10);
});

test("empty buckets union to an empty map", () => {
  assert.equal(unionWindowFromBuckets([]).size, 0);
  assert.equal(unionWindowFromBuckets([new Map()]).size, 0);
});

test("previous window is the current window shifted back exactly one day", () => {
  // The delta baseline is the equal-length window ENDING YESTERDAY (today-1), so it overlaps the
  // current window by (n-1) days and is shifted back exactly one day. Both span 7 days.
  const cur = currentWindowBucketDates("7d", NOW);
  const prev = previousWindowBucketDates("7d", NOW);
  assert.equal(cur.length, 7);
  assert.equal(prev.length, 7);
  assert.equal(cur[0], "2026-06-16"); // today-6
  assert.equal(cur[cur.length - 1], "2026-06-22"); // today
  assert.equal(prev[0], "2026-06-15"); // today-7 (current start - 1)
  assert.equal(prev[prev.length - 1], "2026-06-21"); // today-1 (current end - 1)
});
