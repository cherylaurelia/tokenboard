#!/usr/bin/env node
// Re-runnable vendoring of the LiteLLM price table for the CLI's OFFLINE local-preview
// cost estimate (ARCH §6.6 "refresh via reviewed CI, never live"). Cosmetic-only: the
// snapshot is read solely by the local estimate, never POSTed, never feeds a board.
//
// Pins to the exact commit + sha256 in provenance.json and HARD-FAILS on mismatch, so a
// re-fetch can never silently shift the vendored numbers. A bump = edit provenance.json
// (new SHA + sha256 + date) and re-run in a reviewed PR.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// The vendored snapshot now lives in the shared @tokenboard/cost package (consumed by web + cli).
const costDir = join(here, "..", "..", "packages", "cost", "src");
const provenance = JSON.parse(readFileSync(join(costDir, "provenance.json"), "utf8"));

const url = `https://raw.githubusercontent.com/BerriAI/litellm/${provenance.commitSha}/model_prices_and_context_window.json`;
const KEEP_FIELDS = provenance.fields;

const fail = (msg) => {
  console.error(`vendor-litellm-prices: ${msg}`);
  process.exit(1);
};

console.log(`fetching ${url}`);
const res = await fetch(url);
if (!res.ok) fail(`fetch failed: HTTP ${res.status}`);
const raw = await res.text();

// HARD-VERIFY against the pinned hash before trusting a single byte.
const sha256 = createHash("sha256").update(raw).digest("hex");
if (sha256 !== provenance.upstreamSha256) {
  fail(
    `sha256 mismatch — refusing to vendor.\n  expected ${provenance.upstreamSha256}\n  got      ${sha256}\n` +
      `If this is an intentional upstream bump, update provenance.json (commitSha + upstreamSha256 + fetchedAt) in a reviewed PR.`,
  );
}

const upstream = JSON.parse(raw);
const trimmed = {};
let kept = 0;
for (const [model, entry] of Object.entries(upstream)) {
  if (model === "sample_spec") continue; // docs template, not a model
  if (entry == null || entry.input_cost_per_token == null) continue; // token-priced only
  const projected = {};
  for (const f of KEEP_FIELDS) {
    if (entry[f] != null) projected[f] = entry[f];
  }
  trimmed[model.toLowerCase()] = projected;
  kept++;
}

if (!trimmed["claude-opus-4-8"]) {
  fail("sentinel model 'claude-opus-4-8' missing from trimmed table — aborting.");
}

// Stable key order for clean diffs.
const sorted = Object.fromEntries(Object.keys(trimmed).sort().map((k) => [k, trimmed[k]]));
const out = join(costDir, "litellm-snapshot.json");
writeFileSync(out, JSON.stringify(sorted, null, 0) + "\n");
console.log(`wrote ${out} — ${kept} models, ${(JSON.stringify(sorted).length / 1024).toFixed(0)}KB (sha256 ${sha256.slice(0, 12)}…)`);
