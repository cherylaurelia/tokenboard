import { test } from "node:test";
import assert from "node:assert/strict";
import { renderLocalPreview } from "../src/render/local-preview.js";
import type { LocalSummary } from "../src/aggregate/summary.js";
import type { TerminalStyle } from "../src/render/terminal-style.js";

const summary: LocalSummary = {
  totalTokens: 2_800_000_000,
  totalCostUsd: 2700.5,
  anyUnpriced: false,
  unpricedTokens: 0,
  unpricedModels: [],
  perDay: [
    { date: "2026-06-08", tokens: 804_600, costUsd: 2, model: "claude-opus-4-8" },
    { date: "2026-06-19", tokens: 493_600_000, costUsd: 473, model: "claude-opus-4-8" },
    { date: "2026-06-22", tokens: 1_100_000_000, costUsd: 902, model: "claude-opus-4-8" },
  ],
  perTool: [{ tool: "claude-code", tokens: 2_800_000_000, costUsd: 2700.5 }],
  perModel: [
    { model: "claude-opus-4-8", tokens: 2_799_974_500, costUsd: 2700.5, priced: true },
    { model: "claude-sonnet-4-6", tokens: 25_500, costUsd: 0, priced: true },
  ],
};

const ansi = /\x1b\[/;

test("color OFF (level 0) emits ZERO ANSI — pipes/CI/NO_COLOR/--no-color stay byte-clean", () => {
  const style: TerminalStyle = { color: false, level: 0, width: 80, ascii: false };
  assert.equal(ansi.test(renderLocalPreview(summary, style)), false);
});

test("color OFF + ascii also byte-clean", () => {
  const style: TerminalStyle = { color: false, level: 0, width: 80, ascii: true };
  const out = renderLocalPreview(summary, style);
  assert.equal(ansi.test(out), false);
  assert.ok(out.includes("+") && out.includes("|")); // ascii box glyphs
});

test("truecolor (level 3) emits coral + the table still contains the plain data", () => {
  const style: TerminalStyle = { color: true, level: 3, width: 80, ascii: false };
  const out = renderLocalPreview(summary, style);
  assert.ok(out.includes("\x1b[38;2;204;120;92m"), "expected truecolor coral escape");
  assert.ok(out.includes("TOTAL") && out.includes("2.8B")); // data intact under the color
});

test("model column shows the dominant model name (display-shortened)", () => {
  const style: TerminalStyle = { color: false, level: 0, width: 80, ascii: false };
  const out = renderLocalPreview(summary, style);
  assert.ok(out.includes("opus-4.8"), "dominant model shown as a column, shortened");
  assert.ok(out.includes("model"), "model column header present");
});
