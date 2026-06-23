import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeByMessageId } from "../src/collectors/dedup.js";

// Minimal shape the dedup function operates on: a message.id key + the usage block it reads
// output_tokens from (the value that varies across a turn's streaming snapshots).
interface Line {
  messageId: string | null;
  sourcePath: string;
  lineIndex: number;
  usage: { output_tokens?: number };
}
const L = (messageId: string | null, sourcePath: string, lineIndex: number, tokens = 1): Line => ({
  messageId,
  sourcePath,
  lineIndex,
  usage: { output_tokens: tokens },
});
const sum = (lines: Line[]) => lines.reduce((a, l) => a + (l.usage.output_tokens ?? 0), 0);

// THE #1 trust risk. We assert the FUNCTION CONTRACT (one row per id, the MAX-output occurrence),
// never a hardcoded inflation ratio (the real corpus ratio drifts; a fixture hitting a magic
// constant proves nothing).

test("within-file repeats collapse to one row per id", () => {
  const out = dedupeByMessageId([L("a", "f1", 0), L("a", "f1", 1)]);
  assert.equal(out.length, 1);
});

test("cross-file repeat: same id in two files is deduped (GLOBAL, not per-file)", () => {
  // Load-bearing: many ids span >1 file on the real corpus; per-file dedup would over-count.
  const out = dedupeByMessageId([L("dup", "fileB", 0, 5), L("dup", "fileA", 0, 5)]);
  assert.equal(out.length, 1);
});

test("null messageId is always kept (cannot dedupe)", () => {
  const out = dedupeByMessageId([L(null, "f1", 0), L(null, "f1", 1), L("", "f1", 2)]);
  assert.equal(out.length, 3);
});

test("differing output on the same id: keeps the MAX (the final billed write, not a partial)", () => {
  // Claude Code streams several lines per turn sharing one message.id, output_tokens ascending from
  // a partial snapshot to the final value. The turn is billed ONCE at its final (max) output, so we
  // keep the max. (First-occurrence-wins held the partial and under-counted output by ~49%.)
  // Order-independent: the larger value wins regardless of which occurrence comes first.
  const a = dedupeByMessageId([L("x", "f1", 0, 2), L("x", "f1", 1, 601)]);
  assert.equal(a.length, 1);
  assert.equal(a[0]!.usage.output_tokens, 601);
  const b = dedupeByMessageId([L("x", "f1", 0, 601), L("x", "f1", 1, 2)]);
  assert.equal(b[0]!.usage.output_tokens, 601); // max wins even when it comes first
});

test("distinct ids are all kept", () => {
  const out = dedupeByMessageId([L("a", "f1", 0), L("b", "f1", 1), L("c", "f2", 0)]);
  assert.equal(out.length, 3);
});

test("structural: deduped length equals unique-id count; total collapses", () => {
  const input = [L("a", "f1", 0, 9), L("a", "f1", 1, 2), L("b", "f1", 2, 4), L("a", "f2", 0, 3), L("c", "f2", 1, 5)];
  const out = dedupeByMessageId(input);
  const uniqueIds = new Set(input.map((l) => l.messageId)).size;
  assert.equal(out.length, uniqueIds);
  assert.equal(sum(out), 9 + 4 + 5); // a -> max(9,2,3)=9, b -> 4, c -> 5
  assert.ok(sum(out) < sum(input), "dedup must materially collapse the total");
});

test("deterministic: input order does not change the result set", () => {
  const input = [L("a", "f1", 0, 7), L("b", "f2", 0, 3), L("a", "f2", 1, 4), L("c", "f1", 1, 5)];
  const a = dedupeByMessageId(input);
  const b = dedupeByMessageId([...input].reverse());
  const key = (lines: Line[]) =>
    lines
      .map((l) => `${l.messageId}:${l.usage.output_tokens}`)
      .sort()
      .join(",");
  assert.equal(key(a), key(b)); // same id->max selection regardless of order
});
