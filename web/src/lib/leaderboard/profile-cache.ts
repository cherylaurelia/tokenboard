// prof:{user_id} HASH cache (§7.5): handle, displayName, avatar, tier, tierPill(JSON). 6h TTL.
// Batch HGETALL pipeline -> Postgres fallback (users + memberships for tier, banned-excluded) ->
// HSET populate. tierPill is JSON.stringify'd on write / JSON.parse'd on read (nested object).
// windowTokens/windowCost2dp (the off-metric column) are window-specific, so the ASSEMBLER fills
// them from its batched window query — NOT cached here.
import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users, memberships, communities } from "@/db/schema";
import { redis } from "@/lib/redis/client";
import { profKey, PROFILE_TTL_SEC } from "./keys";
import type { Tier, TierPill, CommunityMeta } from "@tokenboard/contracts";

export interface CachedProfile {
  handle: string;
  displayName: string | null;
  avatar: string | null;
  tier: Tier;
  tierPill: TierPill;
  windowTokens?: number; // filled by the assembler's off-metric query (not cached)
  windowCost2dp?: number;
}

// @upstash/redis auto-deserializes JSON-looking hash values on read, so tierPill (written as a
// JSON string) comes back as either the parsed object OR a string depending on the client version
// — type it as unknown and normalize in decodeProfile.
interface ProfHash {
  handle: string;
  displayName: string;
  avatar: string;
  tier: Tier;
  tierPill: unknown;
}

export async function loadProfiles(
  ids: string[],
  community: CommunityMeta | null,
): Promise<Map<string, CachedProfile>> {
  const out = new Map<string, CachedProfile>();
  if (ids.length === 0) return out;

  // (1) batch HGETALL
  const p = redis.pipeline();
  for (const id of ids) p.hgetall(profKey(id));
  const hashes = (await p.exec()) as Array<ProfHash | null>;

  const misses: string[] = [];
  ids.forEach((id, i) => {
    const h = hashes[i];
    if (h && h.handle) out.set(id, decodeProfile(h));
    else misses.push(id);
  });

  // (2) Postgres fallback for misses + (3) populate cache. A banned id reaching here yields no row
  // (build excludes banned) so it simply gets no profile and is dropped upstream.
  if (misses.length > 0) {
    const built = await buildProfilesFromPostgres(misses, community);
    const wp = redis.pipeline();
    for (const [id, prof] of built) {
      out.set(id, prof);
      wp.hset(profKey(id), {
        handle: prof.handle,
        displayName: prof.displayName ?? "",
        avatar: prof.avatar ?? "",
        tier: prof.tier,
        tierPill: JSON.stringify(prof.tierPill),
      });
      wp.expire(profKey(id), PROFILE_TTL_SEC);
    }
    await wp.exec();
  }
  return out;
}

const FALLBACK_PILL: TierPill = { label: "GitHub", kind: "individual", verified: true };

function decodeProfile(h: ProfHash): CachedProfile {
  // @upstash/redis may return tierPill already-parsed (object) or as a JSON string. Normalize both,
  // and GUARD the parse: a single corrupt cached value must not crash the whole board decode — fall
  // back to the individual pill (the cache is rebuildable; a bad entry is non-fatal).
  let tierPill: TierPill = FALLBACK_PILL;
  try {
    const parsed = typeof h.tierPill === "string" ? JSON.parse(h.tierPill) : h.tierPill;
    if (parsed && typeof parsed === "object" && typeof (parsed as TierPill).kind === "string") {
      tierPill = parsed as TierPill;
    }
  } catch {
    // corrupt cached tierPill -> keep the safe fallback
  }
  return {
    handle: h.handle,
    displayName: h.displayName === "" ? null : h.displayName,
    avatar: h.avatar === "" ? null : h.avatar,
    tier: h.tier,
    tierPill,
  };
}

// Tier ladder (DESIGN §7.1/§7.2): individual = baseline GitHub identity; company = verified member
// (memberships.verified_via not null) of a company-type community; community = member of a
// community-type room. Type-safe drizzle joins (inArray) — no raw uuid-array binding.
//
// COMPANY-board alias-by-default (DESIGN §7.2) is a Phase-7 RENDER concern — FLAGGED, not done here;
// Phase 6 emits the real displayName even on company boards.
async function buildProfilesFromPostgres(
  ids: string[],
  _community: CommunityMeta | null,
): Promise<Map<string, CachedProfile>> {
  const rows = await db
    .select({ id: users.id, handle: users.handle, displayName: users.displayName, avatar: users.avatarUrl })
    .from(users)
    .where(and(inArray(users.id, ids), isNull(users.bannedAt)));

  const memberRows = await db
    .select({
      userId: memberships.userId,
      type: communities.type,
      name: communities.name,
      verifiedVia: memberships.verifiedVia,
    })
    .from(memberships)
    .innerJoin(communities, eq(memberships.communityId, communities.id))
    .where(inArray(memberships.userId, ids));

  const bestPill = new Map<string, TierPill>();
  for (const v of memberRows) {
    const cur = bestPill.get(v.userId);
    const verified = v.verifiedVia != null;
    if (v.type === "company" && verified) {
      bestPill.set(v.userId, { label: v.name, kind: "company", verified: true });
    } else if (!cur) {
      bestPill.set(v.userId, { label: v.name, kind: "community", verified: false });
    }
  }

  const out = new Map<string, CachedProfile>();
  for (const r of rows) {
    const pill: TierPill = bestPill.get(r.id) ?? { label: "GitHub", kind: "individual", verified: true };
    out.set(r.id, {
      handle: r.handle,
      displayName: r.displayName,
      avatar: r.avatar,
      tier: pill.kind,
      tierPill: pill,
    });
  }
  return out;
}
