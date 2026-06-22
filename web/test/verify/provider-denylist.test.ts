import { test } from "node:test";
import assert from "node:assert/strict";
import { blockedProvider, isBlockedProvider } from "@/lib/verify/provider-denylist";

// IMPLEMENTATION §5 must-test: §5.3 free + disposable denylist (a personal/throwaway domain must
// NOT form a company board).

test("blocks free providers incl ISP/country variants", () => {
  for (const d of ["gmail.com", "outlook.com", "yahoo.co.uk", "protonmail.ch", "icloud.com", "comcast.net", "gmx.de"]) {
    assert.equal(blockedProvider(d), "free", d);
  }
});

test("blocks proton sub-aliases via suffix", () => {
  assert.equal(isBlockedProvider("foo.proton.me"), true);
});

test("blocks vendored disposable domains", () => {
  for (const d of ["mailinator.com", "guerrillamail.com", "10minutemail.com", "yopmail.com", "sharklasers.com"]) {
    assert.equal(blockedProvider(d), "disposable", d);
  }
});

test("allows a real work domain", () => {
  assert.equal(blockedProvider("acme-corp.com"), null);
  assert.equal(isBlockedProvider("acme-corp.com"), false);
});

test("is case-insensitive", () => {
  assert.equal(blockedProvider("GMAIL.com"), "free");
  assert.equal(blockedProvider("Mailinator.COM"), "disposable");
});
