import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAdmin } from "@/lib/auth/admin-decision";
import type { Viewer } from "@/lib/auth/get-viewer";

const viewer: Viewer = { userId: "11111111-1111-1111-1111-111111111111", handle: "devon", avatar: null };

test("anon viewer (null) is never admin", () => {
  assert.equal(decideAdmin(null, true), null);
  assert.equal(decideAdmin(null, false), null);
});
test("auth outage is never admin (even if a stale is_admin=true is passed)", () => {
  assert.equal(decideAdmin("outage", true), null);
});
test("present viewer with is_admin=false is denied", () => {
  assert.equal(decideAdmin(viewer, false), null);
});
test("present viewer with is_admin=null (no row / not selected) is denied", () => {
  assert.equal(decideAdmin(viewer, null), null);
});
test("present viewer with is_admin=true is allowed (returns the same viewer)", () => {
  assert.equal(decideAdmin(viewer, true), viewer);
});
test("gate is authoritative on the column, not the handle", () => {
  const other: Viewer = { userId: "22222222-2222-2222-2222-222222222222", handle: "doomslug", avatar: null };
  assert.equal(decideAdmin(other, true), other); // a non-owner-looking handle with true is allowed
  assert.equal(decideAdmin(viewer, false), null); // an owner-looking handle with false is denied
});
