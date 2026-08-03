import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRecordsForSync } from "../src/commands/sync.js";
import { currentVersion } from "../src/version.js";
import type { NormalizedRecord } from "@tokenboard/contracts";

const rec = (date: string, tool: string): NormalizedRecord => ({
  date,
  tool,
  model: "claude-sonnet-4",
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheCreate5m: 0,
  cacheCreate1h: 0,
});

const records = [
  rec("2026-07-01", "claude-code"),
  rec("2026-07-15", "codex"),
  rec("2026-08-01", "claude-code"),
  rec("2026-08-02", "gemini"),
];

test("no options passes every record through", () => {
  assert.equal(filterRecordsForSync(records, {}).length, 4);
});

test("since keeps only records on/after the day (inclusive)", () => {
  const kept = filterRecordsForSync(records, { since: "2026-08-01" });
  assert.deepEqual(kept.map((r) => r.date), ["2026-08-01", "2026-08-02"]);
});

test("sources keeps only the named tools, case-insensitively", () => {
  const kept = filterRecordsForSync(records, { sources: ["Codex", "GEMINI"] });
  assert.deepEqual(kept.map((r) => r.tool), ["codex", "gemini"]);
});

test("since and sources combine (AND)", () => {
  const kept = filterRecordsForSync(records, { since: "2026-07-10", sources: ["claude-code"] });
  assert.deepEqual(kept.map((r) => r.date), ["2026-08-01"]);
});

test("empty sources list is treated as no source filter", () => {
  assert.equal(filterRecordsForSync(records, { sources: [] }).length, 4);
});

test("currentVersion resolves the installed @tokenboard/cli version", () => {
  assert.match(currentVersion(), /^\d+\.\d+\.\d+/);
});
