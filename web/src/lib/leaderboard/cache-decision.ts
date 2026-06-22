// PURE cacheability decision — no I/O, no server-only (so the test runner loads it). CDN-cacheable
// ONLY when the response cannot vary by viewer. The /api/v1/board body varies only by URL query
// params (me/metric/window/limit/format/community) and NOT by session (assemble-board.ts never reads
// callerUserId; profile-cache.ts ignores _community / emits the real displayName). We STILL gate on
// callerUserId/visibility — stricter than today's body requires — because (a) it future-proofs an
// alias-in-API change and (b) the authed path may carry a Set-Cookie (cache-poison hazard). Do NOT
// loosen this predicate.
import type { CommunityMeta } from "@tokenboard/contracts";

export function boardCacheable(args: {
  callerUserId: string | null;
  me: string | undefined; // query.me
  community: CommunityMeta | null;
}): boolean {
  if (args.callerUserId !== null) return false; // any session -> never CDN-cache
  if (args.me) return false; // ?me= -> per-target row, not a public read
  if (args.community === null) return true; // global is public
  return args.community.visibility === "public"; // unlisted/private -> never
}
