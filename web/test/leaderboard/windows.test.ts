import { test } from "node:test";
import assert from "node:assert/strict";
import {
  windowBounds,
  dateRangeList,
  currentWindowBucketDates,
  previousWindowBucketDates,
} from "@/lib/leaderboard/windows";

const NOW = new Date("2026-06-22T09:00:00.000Z");

test("7d window is today-6..today inclusive (7 days)", () => {
  const { windowStart, windowEnd } = windowBounds("7d", NOW);
  assert.equal(windowEnd, "2026-06-22");
  assert.equal(windowStart, "2026-06-16");
  assert.equal(dateRangeList(windowStart!, windowEnd).length, 7);
});

test("30d window is today-29..today (30 days)", () => {
  const { windowStart, windowEnd } = windowBounds("30d", NOW);
  assert.equal(windowStart, "2026-05-24");
  assert.equal(dateRangeList(windowStart!, windowEnd).length, 30);
});

test("all window has no lower bound", () => {
  const { windowStart } = windowBounds("all", NOW);
  assert.equal(windowStart, null);
});

test("dateRangeList is contiguous ascending", () => {
  const list = dateRangeList("2026-06-20", "2026-06-22");
  assert.deepEqual(list, ["2026-06-20", "2026-06-21", "2026-06-22"]);
});

test("currentWindowBucketDates === dateRangeList(windowBounds) (sweep + read agree)", () => {
  const { windowStart, windowEnd } = windowBounds("7d", NOW);
  assert.deepEqual(currentWindowBucketDates("7d", NOW), dateRangeList(windowStart!, windowEnd));
});

test("previousWindowBucketDates is the prior window shifted one day back (today-7..today-1)", () => {
  const prev = previousWindowBucketDates("7d", NOW);
  assert.equal(prev[0], "2026-06-15"); // today-7
  assert.equal(prev[prev.length - 1], "2026-06-21"); // today-1
  assert.equal(prev.length, 7);
});
