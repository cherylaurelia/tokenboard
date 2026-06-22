// Pure slug helpers for community creation + the company-board derivation. No I/O.
// slugify: lowercase, strip accents (NFKD), non-alnum -> hyphen, collapse + trim hyphens, clamp 40.
// RESERVED_SLUGS protects the app's own first-class routes from being shadowed by a community slug.

const MAX_SLUG = 40;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alnum runs -> single hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, ""); // re-trim if the clamp left a trailing hyphen
}

// Company board slug from a domain: the first DNS label (acme-corp.com -> acme-corp).
export function slugFromDomain(domain: string): string {
  const firstLabel = domain.trim().toLowerCase().split(".")[0] ?? "";
  return slugify(firstLabel);
}

// Reserved against the app's own routes (and "global", the pseudo-community). Lowercase set.
export const RESERVED_SLUGS = new Set<string>([
  "global",
  "communities",
  "community",
  "user",
  "users",
  "profile",
  "me",
  "verify",
  "claim",
  "auth",
  "api",
  "new",
  "settings",
  "admin",
  "login",
  "logout",
  "og",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
