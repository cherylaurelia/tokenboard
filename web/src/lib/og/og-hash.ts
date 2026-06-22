// The ONE shared OG content-hash helper, imported by BOTH the board page's generateMetadata and the
// OG route — so the og:image URL and the rendered card never drift. The hash keys the immutable CDN
// cache: it changes only when the card's visible content changes (name/window/metric/leader), so a
// privatize action produces a fresh URL while old URLs stay immutable (and only ever held public,
// retraction-safe content). Pure + isomorphic (uses the Web Crypto-free FNV-1a; no node:crypto so it
// works in any runtime and at metadata time).
import type { BoardResponse, BoardWindow, BoardMetric } from "@tokenboard/contracts";

export interface OgHeadline {
  name: string;
  window: BoardWindow;
  metric: BoardMetric;
  leaderHandle: string | null;
  leaderValue: string | null;
}

// FNV-1a 32-bit -> 8-char hex. Stable, dependency-free, sufficient for a cache-busting version tag.
export function ogContentHash(slug: string, h: OgHeadline): string {
  const input = [slug, h.name, h.window, h.metric, h.leaderHandle ?? "", h.leaderValue ?? ""].join("");
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Derive the headline the card shows from a BoardResponse (rank-1 leader + value, public boards only;
// the route decides whether to expose it). Kept here so metadata + route compute the SAME hash input.
export function headlineFromBoard(board: BoardResponse): OgHeadline {
  const top = board.entries[0] ?? null;
  const value = top
    ? board.metric === "cost"
      ? top.cost.toFixed(2)
      : String(top.tokens)
    : null;
  return {
    name: board.community?.name ?? "Global",
    window: board.window,
    metric: board.metric,
    leaderHandle: top?.handle ?? null,
    leaderValue: value,
  };
}

// The og:image URL for a board: the route path + window/metric + the content-hash version tag.
export function ogImageUrl(slug: string, board: BoardResponse): string {
  const headline = headlineFromBoard(board);
  const v = ogContentHash(slug, headline);
  const params = new URLSearchParams({ window: board.window, metric: board.metric, v });
  return `/api/og/community/${slug}?${params.toString()}`;
}
