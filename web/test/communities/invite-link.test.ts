import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteLink, parseInviteCode, INVITE_JOIN_PATH } from "@/lib/communities/invite-link";

test("inviteLink builds the canonical communities link", () => {
  assert.equal(inviteLink("https://tokenboard.app", "ABCD23"), "https://tokenboard.app/communities?code=ABCD23");
  assert.equal(INVITE_JOIN_PATH, "/communities");
});

test("parseInviteCode reads the code from a full invite link", () => {
  assert.equal(parseInviteCode("https://tokenboard.app/communities?code=ABCD23"), "ABCD23");
});

test("parseInviteCode uppercases a lowercase code in a link", () => {
  assert.equal(parseInviteCode("https://tokenboard.app/communities?code=abcd23"), "ABCD23");
});

test("parseInviteCode reads a link with extra query params", () => {
  assert.equal(parseInviteCode("https://tokenboard.app/communities?ref=x&code=ABCD23&y=1"), "ABCD23");
});

test("parseInviteCode accepts a bare code (any case, surrounding whitespace)", () => {
  assert.equal(parseInviteCode("  abcd23 "), "ABCD23");
  assert.equal(parseInviteCode("ABCD23"), "ABCD23");
});

test("parseInviteCode handles a relative path or bare query fragment", () => {
  assert.equal(parseInviteCode("/communities?code=ABCD23"), "ABCD23");
  assert.equal(parseInviteCode("code=ABCD23"), "ABCD23");
});

test("parseInviteCode rejects junk and ambiguous-alphabet chars", () => {
  assert.equal(parseInviteCode(""), null);
  assert.equal(parseInviteCode("   "), null);
  assert.equal(parseInviteCode("hello"), null);
  assert.equal(parseInviteCode("ABCDEFG"), null);
  assert.equal(parseInviteCode("ABCDE0"), null);
  assert.equal(parseInviteCode("ABCDEI"), null);
  assert.equal(parseInviteCode("https://tokenboard.app/communities"), null);
  assert.equal(parseInviteCode("https://tokenboard.app/communities?code=NOPE!!"), null);
});
