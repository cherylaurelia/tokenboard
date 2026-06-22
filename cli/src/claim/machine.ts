// Stable-ish machine identity, non-PII once hashed. The server re-salts with HASH_PEPPER
// (never sees the raw hostname). For de-dup/labeling only — never a security boundary.
import { hostname, platform, arch, userInfo } from "node:os";
import { createHash } from "node:crypto";

export function machineHash(): string {
  let user = "";
  try {
    user = userInfo().username;
  } catch {
    // some containers have no passwd entry — fine, hash without it
  }
  const stable = [hostname(), platform(), arch(), user].join(" ");
  return createHash("sha256").update(stable).digest("hex");
}

export function clientLabel(): string {
  return `${hostname()} (${platform()})`;
}
