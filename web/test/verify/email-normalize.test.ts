import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkEmail } from "@/lib/verify/email-normalize";

// IMPLEMENTATION §5 must-test: §5.3 email normalization (+subaddress strip, lowercase, malformed).

test("lowercases + strips +subaddress to one normalized slot", () => {
  const a = normalizeWorkEmail("Devon+Foo@Acme-Corp.com");
  const b = normalizeWorkEmail("devon+bar@acme-corp.com");
  assert.equal(a.ok && a.normalized, "devon@acme-corp.com");
  assert.equal(b.ok && b.normalized, "devon@acme-corp.com"); // both collapse -> one mailbox
});

test("strips at the FIRST plus only", () => {
  const r = normalizeWorkEmail("a+b+c@acme-corp.com");
  assert.equal(r.ok && r.localPart, "a");
});

test("trims surrounding whitespace", () => {
  const r = normalizeWorkEmail("  devon@acme-corp.com  ");
  assert.equal(r.ok && r.normalized, "devon@acme-corp.com");
});

test("strips a trailing FQDN root dot", () => {
  const r = normalizeWorkEmail("devon@acme-corp.com.");
  assert.equal(r.ok && r.domain, "acme-corp.com");
});

test("treats a subdomain as a DISTINCT domain (documented policy)", () => {
  const r = normalizeWorkEmail("devon@mail.acme-corp.com");
  assert.equal(r.ok && r.domain, "mail.acme-corp.com");
});

test("rejects unquoted multiple @ (last-@ split would mis-domain)", () => {
  assert.equal(normalizeWorkEmail("a@b@acme-corp.com").ok, false);
});

test("rejects no-@ / empty side", () => {
  assert.equal(normalizeWorkEmail("nope").ok, false);
  assert.equal(normalizeWorkEmail("@acme-corp.com").ok, false);
  assert.equal(normalizeWorkEmail("devon@").ok, false);
});

test("rejects dotless or doubled-dot domains", () => {
  assert.equal(normalizeWorkEmail("devon@localhost").ok, false);
  assert.equal(normalizeWorkEmail("devon@acme..com").ok, false);
});

test("rejects internal whitespace / control chars", () => {
  assert.equal(normalizeWorkEmail("de von@acme-corp.com").ok, false);
});
