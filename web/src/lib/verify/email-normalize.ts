// §5.3 work-email normalization. Pure, no I/O. trim -> lowercase -> split on the LAST '@' (RFC 5321
// allows '@' in a quoted local-part; the domain is everything after the FINAL '@') -> strip
// plus-subaddressing by taking the local-part up to the FIRST '+'. The dedup key is the NORMALIZED
// address so devon+x@acme-corp.com and devon+y@acme-corp.com collapse to one slot. Gmail dot-
// stripping is intentionally NOT implemented (provider-specific; gmail is a denied free provider).
// DOMAIN-IDENTITY POLICY (§5.3, DOCUMENTED): subdomains are treated as DISTINCT domains —
// mail.acme-corp.com vs acme-corp.com mint separate boards. No public-suffix-list dep in the tree,
// so eTLD+1 canonicalization is a Phase-9 follow-up; flagged in risks.
export type NormalizedEmail =
  | { ok: true; normalized: string; localPart: string; domain: string }
  | { ok: false; reason: "malformed" };

export function normalizeWorkEmail(raw: string): NormalizedEmail {
  const lowered = raw.trim().toLowerCase();
  if (/\s/.test(lowered) || /[\x00-\x1f]/.test(lowered)) return { ok: false, reason: "malformed" };
  const at = lowered.lastIndexOf("@");
  if (at <= 0 || at === lowered.length - 1) return { ok: false, reason: "malformed" };
  const rawLocal = lowered.slice(0, at);
  let domain = lowered.slice(at + 1);
  if (rawLocal.includes("@")) return { ok: false, reason: "malformed" }; // unquoted multiple '@'
  if (domain.endsWith(".")) domain = domain.slice(0, -1); // strip FQDN root dot before validation
  if (!domain.includes(".") || domain.startsWith(".") || domain.includes("..")) {
    return { ok: false, reason: "malformed" };
  }
  const localPart = rawLocal.split("+")[0]!; // strip +subaddress at the FIRST '+'
  if (localPart.length === 0) return { ok: false, reason: "malformed" };
  return { ok: true, normalized: `${localPart}@${domain}`, localPart, domain };
}
