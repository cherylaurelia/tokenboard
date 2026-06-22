import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson } from "@/lib/sync/canonical-json";

test("stable key order: reordered keys canonicalize identically", () => {
  const a = canonicalJson({ b: 1, a: 2, c: { y: 1, x: 2 } });
  const b = canonicalJson({ c: { x: 2, y: 1 }, a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1,"c":{"x":2,"y":1}}');
});

test("no whitespace; arrays keep order", () => {
  assert.equal(canonicalJson({ records: [3, 1, 2] }), '{"records":[3,1,2]}');
});

test("undefined keys are dropped (mirrors JSON.stringify)", () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
});

test("different content canonicalizes differently (hash will differ)", () => {
  assert.notEqual(canonicalJson({ records: [{ input: 1 }] }), canonicalJson({ records: [{ input: 2 }] }));
});
