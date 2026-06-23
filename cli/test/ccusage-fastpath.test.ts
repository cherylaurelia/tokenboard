import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsFromDailyPayload, canSkipFanOut } from "../src/collectors/ccusage-source.js";
import { CCUSAGE_SOURCES } from "../src/collectors/ccusage-sources.js";

// The fast path skips the 8-spawn ccusage fan-out when the combined `ccusage daily` probe proves the
// only agent with data is Claude Code (first-party). These tests pin the two load-bearing invariants:
// (1) the ambiguity fail-safe in agentsFromDailyPayload, (2) the never-under-count decision in
// canSkipFanOut. They also document the ccusage@20 metadata.agents shape the probe depends on.

test("claude-only payload -> agent set {claude} -> fast path allowed", () => {
  const payload = { daily: [{ metadata: { agents: ["claude"] } }, { metadata: { agents: ["Claude"] } }] };
  const agents = agentsFromDailyPayload(payload);
  assert.deepEqual(agents, new Set(["claude"])); // lowercased + de-duped
  assert.equal(canSkipFanOut(agents), true);
});

test("genuinely empty machine (no rows) -> empty set -> fast path allowed (fan-out would also be empty)", () => {
  assert.deepEqual(agentsFromDailyPayload({ daily: [] }), new Set());
  assert.deepEqual(agentsFromDailyPayload({}), new Set());
  assert.equal(canSkipFanOut(new Set()), true);
});

test("FAIL-SAFE: rows present but no parseable agents -> null -> fan out (never silently under-count)", () => {
  // The decisive under-count guard: data-bearing rows whose metadata.agents is missing / non-array /
  // non-string must NOT be mistaken for a claude-only machine.
  assert.equal(agentsFromDailyPayload({ daily: [{ metadata: { agents: undefined } }] }), null);
  assert.equal(agentsFromDailyPayload({ daily: [{ metadata: {} }] }), null);
  assert.equal(agentsFromDailyPayload({ daily: [{}] }), null);
  assert.equal(agentsFromDailyPayload({ daily: [{ metadata: { agents: "claude" } }] }), null); // string, not array
  assert.equal(agentsFromDailyPayload({ daily: [{ metadata: { agents: [123] } }] }), null); // non-string members
  assert.equal(canSkipFanOut(null), false);
});

test("any non-claude agent (recognized OR unknown rename) -> fan out fully", () => {
  assert.equal(canSkipFanOut(new Set(["claude", "codex"])), false);
  assert.equal(canSkipFanOut(new Set(["codex"])), false);
  // a future rename/split we don't recognize must still force the fan-out, never the fast skip
  assert.equal(canSkipFanOut(new Set(["claude", "github-copilot"])), false);
});

test("every CCUSAGE_SOURCES subcommand is treated as non-claude (so its presence forces fan-out)", () => {
  for (const source of CCUSAGE_SOURCES) {
    assert.notEqual(source, "claude"); // the source list must never include the first-party tool
    assert.equal(canSkipFanOut(new Set([source])), false);
    assert.equal(canSkipFanOut(new Set(["claude", source])), false);
  }
});
