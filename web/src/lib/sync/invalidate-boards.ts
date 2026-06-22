// §6.4 step 14 — purge the CDN/ISR caches for the boards a sync touched + the syncing user's profile
// render cache. Called POST-COMMIT, wrapped NON-FATAL by the route. lb keys -> board tags via keys.ts
// (the single source of tag shapes). revalidateTag(tag,"max") is the Next 16 two-arg form: it marks
// the tag stale and, on Vercel, purges the CDN entry for responses carrying that Cache-Tag. The OG
// `v` hash is content-derived (og-hash.ts) so it auto-rotates on data change — no explicit OG purge.
// lbsnap is the intentional daily baseline — NOT purged here.
//
// ORDER: redis.del(prof:{userId}) FIRST (the effective lever — the board/profile render reads
// prof:{user_id} via loadProfiles), THEN each revalidateTag in its OWN try/catch so a tag-purge blip
// cannot skip the Redis bust. revalidateTag('profile:{handle}') is OMITTED because no such tagged
// cache exists yet (it would be a no-op + cost a handle SELECT) — re-add it (with the handle) only
// when a tagged profile cache is introduced.
import "server-only";
import { revalidateTag } from "next/cache";
import { redis } from "@/lib/redis/client";
import { lbKeyToBoardTag, profKey } from "@/lib/leaderboard/keys";

export async function invalidateTouchedBoards(params: {
  boardsTouched: string[];
  userId: string;
}): Promise<void> {
  const { boardsTouched, userId } = params;

  // The effective freshness lever first (resilient to a later revalidateTag throw). Catch locally so
  // a Redis blip on the DEL does NOT abort the board tag revalidations below — each control is
  // independent best-effort.
  try {
    await redis.del(profKey(userId));
  } catch (err) {
    console.error("invalidate-boards: prof del failed (non-fatal)", err instanceof Error ? err.message : err);
  }

  // De-dupe tags (boardsTouched repeats a scope across windows) before revalidating.
  const tags = new Set<string>();
  for (const lbKey of boardsTouched) tags.add(lbKeyToBoardTag(lbKey));
  for (const tag of tags) {
    try {
      revalidateTag(tag, "max");
    } catch (err) {
      console.error(
        "invalidate-boards: revalidateTag failed (non-fatal)",
        tag,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
