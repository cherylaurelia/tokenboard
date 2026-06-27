import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSocialUrl,
  normalizeSocialLinks,
  normalizeBio,
  MAX_BIO_LEN,
} from "@/lib/profile/social-links";

// --- handle platforms: server-built host, strict charset, no smuggling (the #1 risk) ---

test("x: strips leading @ and builds the canonical host", () => {
  assert.equal(buildSocialUrl("x", "@devon"), "https://x.com/devon");
  assert.equal(buildSocialUrl("x", "devon"), "https://x.com/devon");
  assert.equal(buildSocialUrl("x", "https://x.com/devon"), "https://x.com/devon"); // pasted URL coerced to handle
});

test("github / linkedin / bluesky build their canonical hosts", () => {
  assert.equal(buildSocialUrl("github", "@devon"), "https://github.com/devon");
  assert.equal(buildSocialUrl("linkedin", "devon-lee"), "https://www.linkedin.com/in/devon-lee");
  assert.equal(buildSocialUrl("bluesky", "devon.bsky.social"), "https://bsky.app/profile/devon.bsky.social");
});

test("handle platforms reject quote/whitespace/scheme/dotdot smuggling", () => {
  assert.equal(buildSocialUrl("x", 'a"><script>'), null);
  assert.equal(buildSocialUrl("x", "a b"), null); // whitespace
  assert.equal(buildSocialUrl("github", "../../evil"), null); // strips to ".." -> fails charset
  assert.equal(buildSocialUrl("x", "@@@"), null); // empty after strip
  assert.equal(buildSocialUrl("x", "a".repeat(99)), null); // overlong handle
});

test("handle path is truncated at the first slash (deliberate forgiving behavior)", () => {
  assert.equal(buildSocialUrl("x", "a/b"), "https://x.com/a"); // documented: keeps first segment, host is hardcoded so safe
});

test("accepts country/mobile subdomains on pasted handle-platform URLs", () => {
  // ca./uk. LinkedIn (Canadian/UK users), mobile. Twitter — common in pasted URLs. The subdomain
  // only LOCATES the handle; the link is rebuilt from the hardcoded host.
  assert.equal(buildSocialUrl("linkedin", "https://ca.linkedin.com/in/angela-felicia"), "https://www.linkedin.com/in/angela-felicia");
  assert.equal(buildSocialUrl("linkedin", "https://uk.linkedin.com/in/someone"), "https://www.linkedin.com/in/someone");
  assert.equal(buildSocialUrl("x", "https://mobile.twitter.com/handle"), "https://x.com/handle");
});

test("a spoofed host (x.com.evil.com) is NOT silently linked", () => {
  // The subdomain allowance must not let an attacker host ride along: the value doesn't end at a
  // real host boundary, so it fails the charset and is rejected (never builds an evil.com link).
  assert.equal(buildSocialUrl("x", "https://x.com.evil.com/in/victim"), null);
  assert.equal(buildSocialUrl("github", "https://github.com.evil.com/victim"), null);
});

// --- normalizeSocialLinks: allowlist + drop unknown + per-field errors ---

test("drops unknown platform keys (never stored)", () => {
  const r = normalizeSocialLinks({ myspace: "x", x: "@devon" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(Object.keys(r.value), ["x"]);
    assert.equal(r.value.x, "devon"); // stores the stripped handle, not the built URL
  }
});

test("omits empty values; rejects an invalid one with a per-field error", () => {
  const r = normalizeSocialLinks({ github: "  ", x: 'a"><script>' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.x, "invalid");
});

test("stores the stripped handle, not the built URL", () => {
  const r = normalizeSocialLinks({ x: "@devon" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.x, "devon");
});

test("rejects a non-object input", () => {
  assert.equal(normalizeSocialLinks("nope").ok, false);
  assert.equal(normalizeSocialLinks(null).ok, false);
  assert.equal(normalizeSocialLinks([]).ok, false);
});

// --- normalizeBio: plain text, trim, cap, empty -> null ---

test("bio trims, empty -> null, over-cap rejected", () => {
  assert.deepEqual(normalizeBio("  hi  "), { ok: true, value: "hi" });
  assert.deepEqual(normalizeBio("   "), { ok: true, value: null });
  assert.deepEqual(normalizeBio(null), { ok: true, value: null });
  assert.equal(normalizeBio("a".repeat(MAX_BIO_LEN + 1)).ok, false);
});
