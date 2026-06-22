import provenance from "./provenance.json" with { type: "json" };

// The pinned LiteLLM table identity. Hand-mirrored as plain string constants so consumers (the web
// route, the startup audit) never depend on a JSON import attribute resolving through transpilePackages.
// The assert below pins these to provenance.json at module load (a test also covers it), so they can
// never silently drift from the artifact the vendor script writes.
export const PRICE_TABLE_VERSION = "litellm-2026-06-21";
export const PRICE_TABLE_COMMIT_SHA = "9f97111edd736cf81e532f345663885457b916a9";
export const PRICE_TABLE_UPSTREAM_SHA256 =
  "e860025a4ddf7eb576b46a43126a0a523e0a60bdc296516d3533ddc17be31d6e";

if (
  provenance.priceTableVersion !== PRICE_TABLE_VERSION ||
  provenance.commitSha !== PRICE_TABLE_COMMIT_SHA ||
  provenance.upstreamSha256 !== PRICE_TABLE_UPSTREAM_SHA256
) {
  throw new Error(
    "provenance-version.ts constants drifted from provenance.json — update the constants after a price-table bump.",
  );
}
