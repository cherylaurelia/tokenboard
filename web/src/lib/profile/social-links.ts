// PURE social-link validation/normalization for the public profile. NO I/O. The single trust
// boundary for user-controlled content rendered as <a href> — stored-XSS / scheme-abuse is THE risk.
// Two-layer defense: validate on WRITE (normalizeSocialLinks) AND rebuild the href on READ
// (buildSocialUrl), so a value that somehow landed in the DB unvalidated still passes the scheme/host
// gate before it reaches an href. Bio is plain text (normalizeBio) — escaped by React on render;
// never markdown, never dangerouslySetInnerHTML.
//
// CLOSED platform allowlist (NOT an arbitrary-key map). Two kinds:
//   handle — we NEVER trust a user URL: strip a leading '@' (and an accidentally-pasted known host
//            prefix), validate against a strict charset, then BUILD the https URL from a HARDCODED
//            host literal. A handle can't smuggle a path/scheme because '/ : ? # @ whitespace' fail
//            the charset.
//   url    — only the free-form website field parses a user URL: reject a protocol-relative '//'
//            value, prepend https:// to a bare host, then `new URL(value)` and require the PARSED
//            protocol === 'https:'. Re-serialize via url.href so embedded quotes are percent-encoded.

export const SOCIAL_PLATFORMS = ["x", "github", "website", "linkedin", "youtube", "bluesky"] as const;
export type Platform = (typeof SOCIAL_PLATFORMS)[number];

// A blanket safety ceiling on handle input, applied BEFORE the per-platform regex runs. The regex is
// the real per-platform length authority (x 15, github 39, linkedin 100, youtube 64, bluesky 253), so
// this must sit ABOVE the largest of those (bluesky's 253) or it would wrongly reject valid long
// handles (e.g. a full bsky.social DID-ish handle) as "too long" before the regex could accept them.
export const MAX_HANDLE_LEN = 256;
export const MAX_URL_LEN = 200;
export const MAX_BIO_LEN = 280;

interface HandlePlatform {
  kind: "handle";
  label: string;
  // Strict charset for the stripped handle. No '/', ':', '?', '#', '@', or whitespace -> no path or
  // scheme smuggling. Bounded length enforced separately (MAX_HANDLE_LEN).
  re: RegExp;
  toUrl: (handle: string) => string; // host is a HARDCODED literal
  placeholder: string;
}
interface UrlPlatform {
  kind: "url";
  label: string;
  placeholder: string;
}

const PLATFORM_SPECS: Record<Platform, HandlePlatform | UrlPlatform> = {
  x: { kind: "handle", label: "X", re: /^[A-Za-z0-9_]{1,15}$/, toUrl: (h) => `https://x.com/${h}`, placeholder: "@handle" },
  github: { kind: "handle", label: "GitHub", re: /^[A-Za-z0-9-]{1,39}$/, toUrl: (h) => `https://github.com/${h}`, placeholder: "@handle" },
  linkedin: { kind: "handle", label: "LinkedIn", re: /^[A-Za-z0-9-]{1,100}$/, toUrl: (h) => `https://www.linkedin.com/in/${h}`, placeholder: "vanity slug" },
  youtube: { kind: "handle", label: "YouTube", re: /^[A-Za-z0-9_.-]{1,64}$/, toUrl: (h) => `https://www.youtube.com/@${h}`, placeholder: "@handle" },
  bluesky: { kind: "handle", label: "Bluesky", re: /^[A-Za-z0-9.-]{1,253}$/, toUrl: (h) => `https://bsky.app/profile/${h}`, placeholder: "name.bsky.social" },
  website: { kind: "url", label: "Website", placeholder: "https://example.com" },
};

export function platformLabel(p: Platform): string {
  return PLATFORM_SPECS[p].label;
}
export function platformPlaceholder(p: Platform): string {
  return PLATFORM_SPECS[p].placeholder;
}

function isPlatform(key: string): key is Platform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(key);
}

// Strip a leading '@' and any accidental host prefix the user pasted (e.g. "x.com/devon" -> "devon",
// "https://github.com/devon" -> "devon"). The result is then charset-validated, so anything that
// survives stripping but isn't a clean handle is rejected (returns null), never coerced. NOTE: a
// trailing path segment is dropped at the first '/', '?', '#' (so "a/b" -> "a"); this is a DELIBERATE
// forgiving truncation (the host is hardcoded so it's safe), covered by a test so it's not accidental.
//
// The `(?:[a-z0-9-]+\.)*` allows ANY subdomain chain before the known host (ca./uk. LinkedIn,
// mobile./m. Twitter, m. YouTube, www.) — country/mobile subdomains are common in pasted URLs and
// must NOT be rejected. This is safe: the subdomain only LOCATES the handle; the final URL is always
// rebuilt from the platform's HARDCODED host + the charset-validated handle, so a spoofed host can't
// ride along (worst case the handle fails the charset and is rejected).
function stripHandle(raw: string): string {
  let h = raw.trim();
  h = h.replace(/^@+/, "");
  const hostMatch = h.match(
    /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:x\.com|twitter\.com|github\.com|linkedin\.com\/in|youtube\.com|bsky\.app\/profile)\/(.+)$/i,
  );
  if (hostMatch) h = hostMatch[1]!;
  h = h.replace(/^@+/, ""); // youtube @handle after the host strip
  h = h.split(/[/?#]/)[0]!; // cut a trailing path/query so it can't ride along
  return h;
}

// THE scheme-safe href builder. Returns a validated https URL or null. Callers NEVER render the
// stored value directly into href — they re-run this at render so the href is always server-built.
export function buildSocialUrl(platform: Platform, storedValue: string): string | null {
  const spec = PLATFORM_SPECS[platform];
  const value = storedValue.trim();
  if (!value) return null;

  if (spec.kind === "handle") {
    const h = stripHandle(value);
    if (h.length === 0 || h.length > MAX_HANDLE_LEN) return null;
    if (!spec.re.test(h)) return null; // strict charset — no '/ : ? # @ whitespace' -> no smuggling
    return spec.toUrl(h);
  }

  // url-type (website): the ONLY user-URL parse path.
  if (value.length > MAX_URL_LEN) return null;
  // Reject a protocol-relative value up front. Without this, prepending https:// to "//evil.com"
  // yields "https:////evil.com" -> parses to host evil.com (a silent host-swap into a normal https
  // link). Rejecting it keeps the canonical href unambiguous (the user must type a real host/URL).
  if (value.startsWith("//")) return null;
  // Prepend https:// to a bare host ("acme-corp.com" -> "https://acme-corp.com"). If the user already
  // typed a scheme we leave it so a non-https scheme is REJECTED below (never silently upgraded).
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate); // no base arg; an internal tab/newline scheme makes this THROW
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null; // ALLOWLIST the parsed protocol; rejects javascript:/data:/vbscript:/file:/ftp:/http:
  if (!url.hostname.includes(".")) return null; // require a real dotted host (no "localhost", no bare token)
  if (url.href.length > MAX_URL_LEN) return null;
  return url.href; // re-serialized: embedded quotes/angle-brackets are percent-encoded
}

export type NormalizeResult =
  | { ok: true; value: Record<string, string> }
  | { ok: false; errors: Record<string, string> };

// Validate an arbitrary input object into a stored social_links map. Unknown keys are DROPPED (never
// stored). Empty/whitespace values OMIT the key. For each known key we store the user-facing value
// (the stripped handle for handle-platforms; the full normalized https URL for website) and reject —
// with a per-field error — anything buildSocialUrl can't produce a safe URL from.
export function normalizeSocialLinks(input: unknown): NormalizeResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: { _: "social_links must be an object" } };
  }
  const out: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isPlatform(key)) continue; // DROP unknown keys silently — never store them
    if (typeof raw !== "string") {
      errors[key] = "must be a string";
      continue;
    }
    const value = raw.trim();
    if (value.length === 0) continue; // empty -> omit the key
    const spec = PLATFORM_SPECS[key];
    if (value.length > (spec.kind === "url" ? MAX_URL_LEN : MAX_HANDLE_LEN)) {
      errors[key] = "too long";
      continue;
    }
    const built = buildSocialUrl(key, value);
    if (built === null) {
      errors[key] = "invalid";
      continue;
    }
    // Store the canonical user-facing form: full URL for website, stripped handle otherwise (so the
    // edit form round-trips what the user meant, and the href is always rebuilt at render).
    out[key] = spec.kind === "url" ? built : stripHandle(value);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}

// Bio is plain text: trim, cap, empty -> null. NO markdown, NO sanitize-then-inject — React escapes
// the text child on render. Returns { ok:false } only when over the cap (a non-string is the route's
// zod job).
export function normalizeBio(
  input: string | null | undefined,
): { ok: true; value: string | null } | { ok: false } {
  if (input == null) return { ok: true, value: null };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > MAX_BIO_LEN) return { ok: false };
  return { ok: true, value: trimmed };
}
