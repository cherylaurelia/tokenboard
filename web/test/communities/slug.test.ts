import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, slugFromDomain, isReservedSlug } from "@/lib/communities/slug";

// IMPLEMENTATION §5: community slug derivation + reserved guard.

test("slugify lowercases, collapses non-alnum, trims hyphens", () => {
  assert.equal(slugify("Frontend Guild!!"), "frontend-guild");
  assert.equal(slugify("  --Steel  Cartel--  "), "steel-cartel");
});

test("slugify strips accents (NFKD)", () => {
  assert.equal(slugify("Café Crew"), "cafe-crew");
});

test("slugify clamps to 40 chars without a trailing hyphen", () => {
  const s = slugify("a".repeat(50));
  assert.ok(s.length <= 40);
  assert.doesNotMatch(s, /-$/);
});

test("slugFromDomain takes the first label", () => {
  assert.equal(slugFromDomain("acme-corp.com"), "acme-corp");
  assert.equal(slugFromDomain("mail.acme-corp.com"), "mail");
});

test("isReservedSlug is case-insensitive and hits app routes", () => {
  assert.equal(isReservedSlug("global"), true);
  assert.equal(isReservedSlug("Verify"), true);
  assert.equal(isReservedSlug("API"), true);
  assert.equal(isReservedSlug("steel-cartel"), false);
});
