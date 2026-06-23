import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectClaudeCodeLinesCached, parseFileLines } from "../src/collectors/claude-code-cache.js";
import { collectClaudeCodeLines, findJsonlFiles } from "../src/collectors/claude-code-source.js";

// A countable assistant-usage JSONL line (the only shape the filter keeps).
const usageLine = (id: string, input = 10, output = 20) =>
  JSON.stringify({
    type: "assistant",
    message: { id, model: "claude-x", usage: { input_tokens: input, output_tokens: output } },
    timestamp: "2026-06-23T00:00:00Z",
  });

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "tb-cache-"));
}

// THE invariant: the cached collector must return EXACTLY what the uncached one does, so the
// downstream dedup + totals are unchanged. Cold and warm runs must agree byte-for-byte.
test("cached output equals uncached, and is stable cold vs warm", () => {
  const root = tmp();
  const cfg = tmp();
  try {
    writeFileSync(join(root, "a.jsonl"), `${usageLine("m1")}\n${usageLine("m2")}\nnot json\n`);
    writeFileSync(join(root, "b.jsonl"), `${usageLine("m3")}\n`);
    const files = findJsonlFiles(root);

    const uncached = collectClaudeCodeLines(root);
    const cold = collectClaudeCodeLinesCached(files, cfg); // populates the cache
    const warm = collectClaudeCodeLinesCached(files, cfg); // reads from cache

    assert.deepEqual(cold, uncached, "cold cached must equal uncached");
    assert.deepEqual(warm, uncached, "warm cached must equal uncached");
    assert.equal(warm.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(cfg, { recursive: true, force: true });
  }
});

// A file whose CONTENT changes (size differs) must be re-read, not served stale from cache.
test("a changed file invalidates its cache entry", () => {
  const root = tmp();
  const cfg = tmp();
  try {
    const f = join(root, "a.jsonl");
    writeFileSync(f, `${usageLine("m1")}\n`);
    const files = findJsonlFiles(root);

    const first = collectClaudeCodeLinesCached(files, cfg);
    assert.equal(first.length, 1);

    // Append a new usage line -> size changes -> must be re-read.
    writeFileSync(f, `${usageLine("m1")}\n${usageLine("m2")}\n`);
    const second = collectClaudeCodeLinesCached(files, cfg);
    assert.equal(second.length, 2, "appended line must be picked up (size invalidation)");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(cfg, { recursive: true, force: true });
  }
});

// A corrupt/missing cache must fall back to a full read, never throw.
test("missing/corrupt cache falls back to a full read", () => {
  const root = tmp();
  const cfg = tmp();
  try {
    writeFileSync(join(root, "a.jsonl"), `${usageLine("m1")}\n`);
    writeFileSync(join(cfg, "parse-cache.json"), "{ this is not valid json");
    const files = findJsonlFiles(root);
    const out = collectClaudeCodeLinesCached(files, cfg);
    assert.equal(out.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(cfg, { recursive: true, force: true });
  }
});

// parseFileLines is the shared parser both paths use — guard its filter/skip behavior directly.
test("parseFileLines keeps only countable assistant lines, skips malformed", () => {
  const out = parseFileLines("/x/f.jsonl", `${usageLine("m1")}\n{"type":"user"}\nbad\n${usageLine("m2")}\n`);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((l) => l.messageId),
    ["m1", "m2"],
  );
  assert.equal(out[1]!.lineIndex, 3, "lineIndex must reflect the original file position");
});
