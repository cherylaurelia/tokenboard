import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeByMessageId } from "../src/collectors/dedup.js";

// Minimal shape the dedup function operates on (plus a token count to check totals).
interface Line {
  messageId: string | null;
  sourcePath: string;
  lineIndex: number;
  tokens: number;
}
const L = (messageId: string | null, sourcePath: string, lineIndex: number, tokens = 1): Line => ({
  messageId,
  sourcePath,
  lineIndex,
  tokens,
});
const sum = (lines: Line[]) => lines.reduce((a, l) => a + l.tokens, 0);

// MUST-TEST #1 — the #1 trust risk. We assert the FUNCTION CONTRACT, never a hardcoded
// inflation ratio (the real corpus ratio is ~1.945x and would drift; a fixture engineered
// to hit a magic constant proves nothing).

test("within-file consecutive repeat: keeps first occurrence only", () => {
  const out = dedupeByMessageId([L("a", "f1", 0), L("a", "f1", 1)]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.lineIndex, 0); // first occurrence
});

test("cross-file repeat: same id in two files is deduped (GLOBAL, not per-file)", () => {
  // Load-bearing: 1266 ids span >1 file on the real corpus; per-file dedup would over-count.
  const out = dedupeByMessageId([L("dup", "fileB", 0), L("dup", "fileA", 0)]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.sourcePath, "fileA"); // sorted order => fileA is "first"
});

test("null messageId is always kept (cannot dedupe)", () => {
  const out = dedupeByMessageId([L(null, "f1", 0), L(null, "f1", 1), L("", "f1", 2)]);
  assert.equal(out.length, 3);
});

test("differing usage on the same id: deterministically keeps the FIRST occurrence", () => {
  // Per ARCH §6.1 (first-occurrence-wins). NOTE: this systematically undercounts vs the
  // final write by ~0.24% on real data (first holds a partial streaming snapshot) —
  // flagged to the spec owner whether last/max is more accurate. This guards against a
  // regression that picks the wrong occurrence.
  const out = dedupeByMessageId([L("x", "f1", 0, 2), L("x", "f1", 1, 601)]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.tokens, 2); // the first, not the larger final
});

test("distinct ids are all kept", () => {
  const out = dedupeByMessageId([L("a", "f1", 0), L("b", "f1", 1), L("c", "f2", 0)]);
  assert.equal(out.length, 3);
});

test("structural: deduped length equals unique-id count; total strictly shrinks", () => {
  const input = [L("a", "f1", 0), L("a", "f1", 1), L("b", "f1", 2), L("a", "f2", 0), L("c", "f2", 1)];
  const out = dedupeByMessageId(input);
  const uniqueIds = new Set(input.map((l) => l.messageId)).size;
  assert.equal(out.length, uniqueIds);
  assert.ok(sum(out) < sum(input), "dedup must materially collapse the total");
  // Loose guardrail only — proves material collapse, NOT any exact ratio.
  assert.ok(sum(input) / sum(out) > 1.0);
});

test("deterministic: shuffled input yields identical output order", () => {
  const input = [L("a", "f1", 0), L("b", "f2", 0), L("a", "f2", 1), L("c", "f1", 1)];
  const a = dedupeByMessageId(input);
  const b = dedupeByMessageId([...input].reverse());
  assert.deepEqual(
    a.map((l) => `${l.sourcePath}:${l.lineIndex}`),
    b.map((l) => `${l.sourcePath}:${l.lineIndex}`),
  );
});
