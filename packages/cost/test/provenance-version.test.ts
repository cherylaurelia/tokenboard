import { test } from "node:test";
import assert from "node:assert/strict";
import provenance from "../src/provenance.json" with { type: "json" };
import {
  PRICE_TABLE_VERSION,
  PRICE_TABLE_COMMIT_SHA,
  PRICE_TABLE_UPSTREAM_SHA256,
} from "../src/provenance-version";

// Drift guard: the hand-mirrored TS constants MUST equal provenance.json (the artifact the vendor
// script writes). If a price-table bump updates provenance.json but not the constants, this fails.
test("version constants match provenance.json", () => {
  assert.equal(PRICE_TABLE_VERSION, provenance.priceTableVersion);
  assert.equal(PRICE_TABLE_COMMIT_SHA, provenance.commitSha);
  assert.equal(PRICE_TABLE_UPSTREAM_SHA256, provenance.upstreamSha256);
});
