// @tokenboard/cost — public API surface (the deliberate package entry, NOT an internal barrel).
// ONE cost engine shared by web (authoritative §6.4 cost) and cli (cosmetic §4.3 preview), so the
// board and the local "~$" can never drift beyond a price-table version. Extensionless relative
// re-exports (the monorepo is on moduleResolution: bundler).
export { estimateCost, type CostCounts } from "./estimate-cost";
export { loadPriceTable, type PriceTable, type PriceEntry } from "./price-table";
export {
  PRICE_TABLE_VERSION,
  PRICE_TABLE_COMMIT_SHA,
  PRICE_TABLE_UPSTREAM_SHA256,
} from "./provenance-version";
