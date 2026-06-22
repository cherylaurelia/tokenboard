import "server-only";
import { loadPriceTable, PRICE_TABLE_COMMIT_SHA, type PriceTable } from "@tokenboard/cost";

// Load ONCE at module scope (ARCH §6.6: never fetched live; §8.1: in-process cache for the single
// pinned version). loadPriceTable() fails loud on an empty/sentinel-less snapshot.
export const priceTable: PriceTable = loadPriceTable();

// Audit/ops cross-check: if PRICE_TABLE_SHA is pinned in env, it MUST match the snapshot's provenance
// commit. Fail loud on mismatch (a stale env pin vs a bumped snapshot is an ops bug). Empty env is
// acceptable — provenance.json is the runtime source of truth, not env.
const pinned = process.env.PRICE_TABLE_SHA?.trim();
if (pinned && pinned !== PRICE_TABLE_COMMIT_SHA) {
  throw new Error(
    `PRICE_TABLE_SHA env (${pinned}) != vendored snapshot commit (${PRICE_TABLE_COMMIT_SHA}) — ` +
      "the env pin is stale or the snapshot was bumped without updating ops config.",
  );
}
