import { test } from "node:test";
import assert from "node:assert/strict";
import { boardResponseSchema } from "@tokenboard/contracts";

// IMPLEMENTATION §5 must-test: a board response validates against the canonical §7.2 schema.
const fullEntry = {
  rank: 1,
  handle: "devon",
  displayName: "Devon Lee",
  avatar: "https://avatars.example/acme.png",
  tier: "company",
  tierPill: { label: "Acme Corp", kind: "company", verified: true },
  tokens: 4218511,
  cost: 38.42,
  delta: { rankChange: 2, tokensChange: 612300, pct: 17, direction: "up" },
  sparkline: [{ date: "2026-06-22", tokens: 410220 }],
  topTool: "claude-code",
  isMe: true,
};

const base = {
  community: null,
  window: "7d",
  metric: "tokens",
  generatedAt: "2026-06-22T09:14:02Z",
  priceTableVersion: "litellm-2026-06-21",
  windowStart: "2026-06-16",
  windowEnd: "2026-06-22",
  totalEntries: 1,
  entries: [fullEntry],
};

test("top-N with me-inTopN validates", () => {
  const r = boardResponseSchema.safeParse({
    ...base,
    me: { inTopN: true, rank: 1, totalEntries: 1, handle: "devon" },
  });
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
});

test("me-outOfTopN (with full entry) validates", () => {
  const r = boardResponseSchema.safeParse({
    ...base,
    me: { inTopN: false, rank: 147, totalEntries: 218, entry: { ...fullEntry, rank: 147 } },
  });
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
});

test("me=null validates (no ?me= or unknown handle)", () => {
  assert.ok(boardResponseSchema.safeParse({ ...base, me: null }).success);
});

test("cli-format entry (web-only fields omitted) validates", () => {
  const cliEntry = {
    rank: 1,
    handle: "devon",
    tier: "individual",
    tokens: 100,
    cost: 0.5,
    delta: { rankChange: 0, tokensChange: 0, pct: 0, direction: "new" },
    sparkline: [],
    isMe: false,
  };
  const r = boardResponseSchema.safeParse({
    ...base,
    community: { slug: "acme", name: "Acme", type: "company", joinPolicy: "email_domain", visibility: "public", memberCount: 5 },
    entries: [cliEntry],
    me: null,
  });
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
});

test("a bad entry (negative rank) FAILS validation", () => {
  assert.equal(boardResponseSchema.safeParse({ ...base, entries: [{ ...fullEntry, rank: -1 }], me: null }).success, false);
});
