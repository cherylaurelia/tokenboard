import "server-only";
import { boardTag } from "./keys";
import type { Scope, MetricToken } from "./keys";
import type { BoardWindow } from "@tokenboard/contracts";

// CDN keys by FULL URL query string (Vercel default), so the format/limit/me axes get distinct
// entries automatically; the Cache-Tag is intentionally the COARSER board:{scope}:{metric}:{window}
// (it matches the lb-key purge granularity in write-path.ts). CDN-Cache-Control caches at the edge;
// Vercel strips s-maxage from the browser-facing Cache-Control, so the browser does not hold it.
export function publicBoardHeaders(
  scope: Scope,
  metric: MetricToken,
  window: BoardWindow,
): Record<string, string> {
  const directive = "public, s-maxage=30, stale-while-revalidate=300";
  return {
    "Cache-Control": directive,
    "CDN-Cache-Control": directive,
    "Cache-Tag": boardTag(scope, metric, window),
  };
}

export function noStoreHeaders(): Record<string, string> {
  return { "Cache-Control": "private, no-store" };
}
