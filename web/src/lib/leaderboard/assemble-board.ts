// §7.5 7-step assembler. Redis-first (ZREVRANGE/ZREVRANK/ZSCORE/ZCARD), Postgres fallback when the
// board key is empty/missing (NOT an error). banned_at users excluded (§4.6) by over-fetching,
// dropping banned in ONE query, re-ranking 1-based. cost divided to 2dp at THIS edge only; cost-board
// delta numbers are ALSO in 2dp dollars so tokensChange matches the displayed cost.
import "server-only";
import { and, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { PRICE_TABLE_VERSION } from "@tokenboard/cost";
import type { BoardQuery, BoardResponse, BoardEntry, BoardMe, CommunityMeta } from "@tokenboard/contracts";
import { redis } from "@/lib/redis/client";
import { lbKey, lbsnapKey, metricToken, type Scope } from "./keys";
import { windowBounds } from "./windows";
import { microsToUsd2dp } from "@/lib/redis/micro-dollars";
import { loadProfiles } from "./profile-cache";
import { computeDelta } from "./deltas";
import {
  fallbackBoard,
  fallbackMeRank,
  sparklinesForUsers,
  topToolForUsers,
  earliestDateForUsers,
} from "./window-sums";
import { windowTotalsForUsers } from "./window-sums-batch";

const OVERFETCH = 32; // buffer so banned drops don't shrink the page below limit.

function toDisplayUnit(metric: BoardQuery["metric"], score: number): number {
  return metric === "cost" ? microsToUsd2dp(score) : score;
}

function isoSecond(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z"); // second precision
}

export async function assembleBoard(params: {
  query: BoardQuery;
  scope: Scope;
  community: CommunityMeta | null;
  meUserId: string | null;
  callerUserId: string | null;
}): Promise<BoardResponse> {
  const { query, scope, community, meUserId } = params;
  const mt = metricToken(query.metric);
  const isCli = query.format === "cli";
  const key = lbKey(scope, mt, query.window);
  const snapKey = lbsnapKey(scope, mt, query.window);
  const now = new Date();
  const { windowStart, windowEnd } = windowBounds(query.window, now);

  // (2) top-N from Redis (over-fetch for banned filtering). Flat [member, score, ...].
  const flat = (await redis.zrange(key, 0, query.limit - 1 + OVERFETCH, {
    rev: true,
    withScores: true,
  })) as Array<string | number>;

  let ranked: Array<{ userId: string; score: number }> = [];
  for (let i = 0; i < flat.length; i += 2) {
    ranked.push({ userId: String(flat[i]), score: Number(flat[i + 1]) });
  }

  let usedFallback = false;
  if (ranked.length === 0) {
    // Empty/missing board key -> Postgres windowed aggregate (NOT an error). banned-excluded.
    usedFallback = true;
    ranked = await fallbackBoard({
      scope,
      metric: query.metric,
      windowStart,
      windowEnd,
      limit: query.limit,
    });
  } else {
    // banned exclusion (Redis path): ONE query.
    const ids = ranked.map((r) => r.userId);
    const allowed = new Set(
      (
        await db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, ids), isNull(users.bannedAt)))
      ).map((r) => r.id),
    );
    ranked = ranked.filter((r) => allowed.has(r.userId));
  }
  ranked = ranked.slice(0, query.limit);
  const ids = ranked.map((r) => r.userId);

  // (3) ?me= rank — single pipeline ZREVRANK + ZSCORE + ZCARD (Postgres fallback when board empty).
  let meRank: number | null = null;
  let meScore: number | null = null;
  let totalEntries = 0;
  if (!usedFallback) {
    // me.rank/totalEntries come from ZREVRANK/ZCARD. These count whoever is IN the ZSET — which is
    // banned-clean because the write-path skips banned users and rebuild reseeds banned-free. The
    // only residual is a user banned AFTER their last sync and BEFORE the next rebuild: they linger
    // in Redis until the nightly rebuild purges them, so me.rank could be off by the (tiny) count of
    // such stragglers. Accepted: the authoritative exclusion is banned_at and rebuild reconciles it;
    // a per-request full-board banned recount would defeat the O(log N) ZSET read.
    if (meUserId) {
      const p = redis.pipeline();
      p.zrevrank(key, meUserId);
      p.zscore(key, meUserId);
      p.zcard(key);
      const [rk, sc, card] = (await p.exec()) as [number | null, number | null, number];
      meRank = rk === null ? null : rk + 1; // 0-based -> 1-based
      meScore = sc === null ? null : Number(sc);
      totalEntries = card;
    } else {
      totalEntries = await redis.zcard(key);
    }
  } else {
    const f = await fallbackMeRank({ scope, metric: query.metric, windowStart, windowEnd, userId: meUserId });
    totalEntries = f.totalEntries;
    if (meUserId) {
      meRank = f.rank;
      meScore = f.score;
    }
  }

  // Caller may be outside the over-fetched page; ensure their id is profile/sparkline-loaded.
  const allIds = meUserId && !ids.includes(meUserId) ? [...ids, meUserId] : ids;

  // The sparkline lower bound: windowStart, or (for 'all') the earliest synced day.
  const sparkStart = windowStart ?? (allIds.length ? await earliestDateForUsers(allIds) : null) ?? windowEnd;

  // (4) profiles, (5) prev snapshot scores+ranks, (6) sparklines, (6b) topTool, (6c) off-metric totals.
  const [profiles, prevScores, prevRanks, sparkMap, topToolMap, totalsMap] = await Promise.all([
    loadProfiles(allIds, community),
    snapshotScores(snapKey, allIds),
    snapshotRanks(snapKey, allIds),
    sparklinesForUsers(allIds, sparkStart, windowEnd),
    isCli ? Promise.resolve(new Map<string, string>()) : topToolForUsers(allIds, windowStart, windowEnd),
    windowTotalsForUsers(allIds, windowStart, windowEnd),
  ]);

  const toEntry = (userId: string, rawScore: number, rank: number): BoardEntry => {
    const prof = profiles.get(userId)!;
    const displayScore = toDisplayUnit(query.metric, rawScore); // tokens | 2dp USD
    const prevRaw = prevScores.get(userId) ?? null;
    const prevDisplay = prevRaw === null ? null : toDisplayUnit(query.metric, prevRaw);
    const delta = computeDelta({
      curScore: displayScore,
      prevScore: prevDisplay, // BOTH in display unit
      curRank: rank,
      prevRank: prevRanks.get(userId) ?? null,
    });
    const totals = totalsMap.get(userId);
    const tokens = query.metric === "tokens" ? rawScore : (totals?.tokens ?? 0);
    const cost = query.metric === "cost" ? displayScore : (totals?.cost2dp ?? 0);
    const base = {
      rank,
      handle: prof.handle,
      tier: prof.tier,
      tokens,
      cost,
      delta,
      sparkline: sparkMap.get(userId) ?? [],
      isMe: userId === meUserId,
    };
    if (isCli) return base as BoardEntry;
    return {
      ...base,
      displayName: prof.displayName,
      avatar: prof.avatar,
      tierPill: prof.tierPill,
      topTool: topToolMap.get(userId) ?? null,
    };
  };

  const entries: BoardEntry[] = ranked.map((r, i) => toEntry(r.userId, r.score, i + 1));

  // (7) me union
  let me: BoardMe = null;
  if (meUserId && meRank !== null) {
    const inTop = entries.find((e) => e.isMe);
    if (inTop) {
      me = { inTopN: true, rank: meRank, totalEntries, handle: inTop.handle };
    } else if (meScore !== null && profiles.has(meUserId)) {
      me = { inTopN: false, rank: meRank, totalEntries, entry: toEntry(meUserId, meScore, meRank) };
    }
  }

  return {
    community,
    window: query.window,
    metric: query.metric,
    generatedAt: isoSecond(now),
    priceTableVersion: PRICE_TABLE_VERSION,
    windowStart: sparkStart,
    windowEnd,
    totalEntries,
    entries,
    me,
  };
}

// Snapshot reads (pipeline ZSCORE/ZREVRANK per id against lbsnap — the PREVIOUS period).
async function snapshotScores(snapKey: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const p = redis.pipeline();
  for (const id of ids) p.zscore(snapKey, id);
  const res = (await p.exec()) as Array<number | null>;
  const m = new Map<string, number>();
  ids.forEach((id, i) => {
    if (res[i] !== null && res[i] !== undefined) m.set(id, Number(res[i]));
  });
  return m;
}

async function snapshotRanks(snapKey: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const p = redis.pipeline();
  for (const id of ids) p.zrevrank(snapKey, id);
  const res = (await p.exec()) as Array<number | null>;
  const m = new Map<string, number>();
  ids.forEach((id, i) => {
    if (res[i] !== null && res[i] !== undefined) m.set(id, (res[i] as number) + 1);
  });
  return m;
}
