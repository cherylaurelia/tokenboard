import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, uidKey, ipKey, emailKey } from "@/lib/ratelimit/identifiers";

const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

test("clientIp takes the first x-forwarded-for hop, trimmed (single value on Vercel)", () => {
  assert.equal(clientIp(headers({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 70.0.0.1" })), "203.0.113.7");
});
test("clientIp falls back to x-real-ip", () => {
  assert.equal(clientIp(headers({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
});
test("clientIp falls back to 0.0.0.0 when no header present (never crashes)", () => {
  assert.equal(clientIp(headers({})), "0.0.0.0");
});
test("key prefixes", () => {
  assert.equal(uidKey("u1"), "uid:u1");
  assert.equal(ipKey("1.2.3.4"), "ip:1.2.3.4");
  assert.equal(emailKey("a@acme-corp.com"), "email:a@acme-corp.com");
});
