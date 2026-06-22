import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeOverview, shapeUser, shapeCommunity } from "@/lib/admin/admin-shape";

test("overview $ fold: numeric-string sum -> 2dp USD with no float drift", () => {
  const o = shapeOverview({
    usersTotal: "10",
    usersLive: "9",
    usersBanned: "1",
    communitiesTotal: "3",
    communitiesCommunity: "2",
    communitiesCompany: "1",
    memberships: "42",
    tokensAllTime: "6900000",
    costAllTime: "1180.005000",
    syncedToday: "4",
  });
  assert.equal(o.costAllTime2dp, 1180.01); // round-half-up cents, no float drift
  assert.equal(o.tokensAllTime, 6_900_000); // Number() exact at scale
  assert.equal(o.usersBanned, 1);
});

test("shapeUser: banned row carries globalRank=null; $ folds to 2dp", () => {
  const u = shapeUser({
    id: "u1",
    handle: "devon",
    display_name: null,
    avatar_url: null,
    github_login: "devon",
    is_admin: false,
    banned_at: "2026-06-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    tokens: "0",
    cost_usd: "38.421000",
    community_count: 2,
    global_rank: null,
  });
  assert.equal(u.globalRank, null);
  assert.equal(u.cost2dp, 38.42);
  assert.equal(u.bannedAt, "2026-06-01T00:00:00Z");
});

test("shapeCommunity maps snake_case -> camel + folds total spend to 2dp", () => {
  const c = shapeCommunity({
    id: "c1",
    slug: "steel-cartel",
    name: "Steel Cartel",
    type: "community",
    visibility: "public",
    join_policy: "open",
    created_by_handle: "devon",
    member_count: 5,
    cost_usd: "0",
    created_at: "2026-02-01T00:00:00Z",
  });
  assert.equal(c.joinPolicy, "open");
  assert.equal(c.createdByHandle, "devon");
  assert.equal(c.totalSpend2dp, 0);
});
