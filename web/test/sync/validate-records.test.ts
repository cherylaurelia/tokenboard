import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAndNormalize } from "@/lib/sync/validate-records";

const NOW = new Date("2026-06-22T12:00:00.000Z");
const base = {
  date: "2026-06-21",
  tool: "claude-code",
  model: "claude-opus-4-8",
  input: 100,
  output: 50,
  cacheRead: 10,
  cacheCreate5m: 5,
  cacheCreate1h: 0,
};
const ctx = { now: NOW, tzOffsetMinutes: 0 };

test("a valid record passes through", () => {
  const { valid, errors } = validateAndNormalize([base], ctx);
  assert.equal(valid.length, 1);
  assert.equal(errors.length, 0);
});

test("negative count -> NEGATIVE_COUNT (not INVALID_RECORD)", () => {
  const { valid, errors } = validateAndNormalize([{ ...base, output: -5 }], ctx);
  assert.equal(valid.length, 0);
  assert.equal(errors[0]!.code, "NEGATIVE_COUNT");
  assert.equal(errors[0]!.field, "output");
});

test("empty tool -> INVALID_RECORD (not NEGATIVE_COUNT)", () => {
  const { errors } = validateAndNormalize([{ ...base, tool: "" }], ctx);
  assert.equal(errors[0]!.code, "INVALID_RECORD");
});

test("date older than 90d -> DATE_OUT_OF_RANGE", () => {
  const { errors } = validateAndNormalize([{ ...base, date: "2026-01-01" }], ctx);
  assert.equal(errors[0]!.code, "DATE_OUT_OF_RANGE");
});

test("future date beyond grace -> DATE_OUT_OF_RANGE", () => {
  const { errors } = validateAndNormalize([{ ...base, date: "2026-07-01" }], ctx);
  assert.equal(errors[0]!.code, "DATE_OUT_OF_RANGE");
});

test("server-side tool canonicalization: claude_code -> claude-code, then merges", () => {
  // two rows that only differ by tool spelling must merge into ONE after canonicalization.
  const { valid } = validateAndNormalize(
    [
      { ...base, tool: "claude_code", input: 100 },
      { ...base, tool: "ClaudeCode", input: 1 },
    ],
    ctx,
  );
  assert.equal(valid.length, 1);
  assert.equal(valid[0]!.tool, "claude-code");
  assert.equal(valid[0]!.input, 101);
});

test("unknown tool is accepted + flagged TOOL_UNVERIFIED", () => {
  const { valid, flags } = validateAndNormalize([{ ...base, tool: "some-new-tool" }], ctx);
  assert.equal(valid.length, 1);
  assert.ok(flags.some((f) => f.code === "TOOL_UNVERIFIED"));
});
