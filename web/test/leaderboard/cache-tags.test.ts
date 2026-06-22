import { test } from "node:test";
import assert from "node:assert/strict";
import { boardTag, lbKeyToBoardTag, lbRenderKey } from "@/lib/leaderboard/keys";
import { boardCacheable } from "@/lib/leaderboard/cache-decision";
import type { CommunityMeta } from "@tokenboard/contracts";

test("boardTag builds board:{scope}:{metric}:{window}", () => {
  assert.equal(boardTag("g", "t", "7d"), "board:g:t:7d");
  assert.equal(boardTag("c:abc-uuid", "usd", "30d"), "board:c:abc-uuid:usd:30d");
});
test("lbKeyToBoardTag strips only the leading lb: (community scope keeps its colon)", () => {
  assert.equal(lbKeyToBoardTag("lb:g:t:7d"), "board:g:t:7d");
  assert.equal(
    lbKeyToBoardTag("lb:c:550e8400-e29b-41d4-a716-446655440000:usd:30d"),
    "board:c:550e8400-e29b-41d4-a716-446655440000:usd:30d",
  );
});
test("lbKeyToBoardTag rejects a non-lb key (fail loud at the boundary)", () => {
  assert.throws(() => lbKeyToBoardTag("board:g:t:7d"));
});
test("lbRenderKey includes the limit", () => {
  assert.equal(lbRenderKey("g", "t", "7d", 50), "lbrender:g:t:7d:50");
});

const meta = (visibility: CommunityMeta["visibility"]): CommunityMeta => ({
  slug: "x",
  name: "X",
  type: "community",
  joinPolicy: "open",
  visibility,
  memberCount: 1,
});

test("boardCacheable: anon + global -> cacheable", () => {
  assert.equal(boardCacheable({ callerUserId: null, me: undefined, community: null }), true);
});
test("boardCacheable: anon + public community -> cacheable", () => {
  assert.equal(boardCacheable({ callerUserId: null, me: undefined, community: meta("public") }), true);
});
test("boardCacheable: any session -> NOT cacheable", () => {
  assert.equal(boardCacheable({ callerUserId: "u1", me: undefined, community: null }), false);
});
test("boardCacheable: ?me= present -> NOT cacheable", () => {
  assert.equal(boardCacheable({ callerUserId: null, me: "devon", community: null }), false);
});
test("boardCacheable: unlisted/private -> NOT cacheable", () => {
  assert.equal(boardCacheable({ callerUserId: null, me: undefined, community: meta("unlisted") }), false);
  assert.equal(boardCacheable({ callerUserId: null, me: undefined, community: meta("private") }), false);
});
