// Pure row shapers for the admin dashboard, extracted so `node --import tsx --test` can load them
// (the loader fns that call db.execute keep `server-only`). $ via the micro-dollar idiom (cost_usd is
// a numeric STRING — never float). Tokens stay well under 2^53 even as a global SUM at tokenboard
// scale, so Number() is exact for display.
import { costUsdStringToMicros, microsToUsd2dp } from "@/lib/redis/micro-dollars";

export interface OverviewStats {
  usersTotal: number;
  usersLive: number;
  usersBanned: number;
  communitiesTotal: number;
  communitiesCommunity: number;
  communitiesCompany: number;
  memberships: number;
  tokensAllTime: number;
  costAllTime2dp: number;
  syncedToday: number;
}
export interface OverviewRaw {
  usersTotal: string;
  usersLive: string;
  usersBanned: string;
  communitiesTotal: string;
  communitiesCommunity: string;
  communitiesCompany: string;
  memberships: string;
  tokensAllTime: string;
  costAllTime: string;
  syncedToday: string;
}
export function shapeOverview(r: OverviewRaw): OverviewStats {
  return {
    usersTotal: Number(r.usersTotal),
    usersLive: Number(r.usersLive),
    usersBanned: Number(r.usersBanned),
    communitiesTotal: Number(r.communitiesTotal),
    communitiesCommunity: Number(r.communitiesCommunity),
    communitiesCompany: Number(r.communitiesCompany),
    memberships: Number(r.memberships),
    tokensAllTime: Number(r.tokensAllTime),
    costAllTime2dp: microsToUsd2dp(costUsdStringToMicros(r.costAllTime)),
    syncedToday: Number(r.syncedToday),
  };
}

export interface AdminUserRow {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
  isAdmin: boolean;
  bannedAt: string | null;
  createdAt: string;
  tokens: number;
  cost2dp: number;
  communityCount: number;
  globalRank: number | null;
}
export interface UserRaw {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  github_login: string | null;
  is_admin: boolean;
  banned_at: string | null;
  created_at: string;
  tokens: string;
  cost_usd: string;
  community_count: number;
  global_rank: number | null;
}
export function shapeUser(r: UserRaw): AdminUserRow {
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    githubLogin: r.github_login,
    isAdmin: r.is_admin,
    bannedAt: r.banned_at,
    createdAt: r.created_at,
    tokens: Number(r.tokens),
    cost2dp: microsToUsd2dp(costUsdStringToMicros(r.cost_usd)),
    communityCount: r.community_count,
    globalRank: r.global_rank,
  };
}

export interface AdminCommunityRow {
  id: string;
  slug: string;
  name: string;
  type: "community" | "company";
  visibility: "public" | "unlisted" | "private";
  joinPolicy: "open" | "code" | "email_domain";
  createdByHandle: string | null;
  memberCount: number;
  totalSpend2dp: number;
  createdAt: string;
}
export interface CommunityRaw {
  id: string;
  slug: string;
  name: string;
  type: AdminCommunityRow["type"];
  visibility: AdminCommunityRow["visibility"];
  join_policy: AdminCommunityRow["joinPolicy"];
  created_by_handle: string | null;
  member_count: number;
  cost_usd: string;
  created_at: string;
}
export function shapeCommunity(r: CommunityRaw): AdminCommunityRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
    visibility: r.visibility,
    joinPolicy: r.join_policy,
    createdByHandle: r.created_by_handle,
    memberCount: r.member_count,
    totalSpend2dp: microsToUsd2dp(costUsdStringToMicros(r.cost_usd)),
    createdAt: r.created_at,
  };
}
