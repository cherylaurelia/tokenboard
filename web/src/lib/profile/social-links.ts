export const SOCIAL_PLATFORMS = ["x", "github", "linkedin", "bluesky"] as const;
export type Platform = (typeof SOCIAL_PLATFORMS)[number];

export const MAX_HANDLE_LEN = 256;
export const MAX_BIO_LEN = 280;

interface HandlePlatform {
  kind: "handle";
  label: string;

  re: RegExp;
  toUrl: (handle: string) => string;
  placeholder: string;
}

const PLATFORM_SPECS: Record<Platform, HandlePlatform> = {
  x: { kind: "handle", label: "X", re: /^[A-Za-z0-9_]{1,15}$/, toUrl: (h) => `https://x.com/${h}`, placeholder: "@handle" },
  github: { kind: "handle", label: "GitHub", re: /^[A-Za-z0-9-]{1,39}$/, toUrl: (h) => `https://github.com/${h}`, placeholder: "@handle" },
  linkedin: { kind: "handle", label: "LinkedIn", re: /^[A-Za-z0-9-]{1,100}$/, toUrl: (h) => `https://www.linkedin.com/in/${h}`, placeholder: "linkedin.com/in/your-name" },
  bluesky: { kind: "handle", label: "Bluesky", re: /^[A-Za-z0-9.-]{1,253}$/, toUrl: (h) => `https://bsky.app/profile/${h}`, placeholder: "name.bsky.social" },
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

function stripHandle(raw: string): string {
  let h = raw.trim();
  h = h.replace(/^@+/, "");
  const hostMatch = h.match(
    /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:x\.com|twitter\.com|github\.com|linkedin\.com\/in|bsky\.app\/profile)\/(.+)$/i,
  );
  if (hostMatch) h = hostMatch[1]!;
  h = h.replace(/^@+/, ""); 
  h = h.split(/[/?#]/)[0]!;
  return h;
}

export function buildSocialUrl(platform: Platform, storedValue: string): string | null {
  const spec = PLATFORM_SPECS[platform];
  const value = storedValue.trim();
  if (!value) return null;

  const h = stripHandle(value);
  if (h.length === 0 || h.length > MAX_HANDLE_LEN) return null;
  if (!spec.re.test(h)) return null; 
  return spec.toUrl(h);
}

export type NormalizeResult =
  | { ok: true; value: Record<string, string> }
  | { ok: false; errors: Record<string, string> };

export function normalizeSocialLinks(input: unknown): NormalizeResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: { _: "social_links must be an object" } };
  }
  const out: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isPlatform(key)) continue; 
    if (typeof raw !== "string") {
      errors[key] = "must be a string";
      continue;
    }
    const value = raw.trim();
    if (value.length === 0) continue;
    if (value.length > MAX_HANDLE_LEN) {
      errors[key] = "too long";
      continue;
    }
    if (buildSocialUrl(key, value) === null) {
      errors[key] = "invalid";
      continue;
    }
   
    out[key] = stripHandle(value);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}

export function normalizeBio(
  input: string | null | undefined,
): { ok: true; value: string | null } | { ok: false } {
  if (input == null) return { ok: true, value: null };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > MAX_BIO_LEN) return { ok: false };
  return { ok: true, value: trimmed };
}
