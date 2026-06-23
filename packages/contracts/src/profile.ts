// @tokenboard/contracts — POST /api/v1/profile wire contract. SHAPE + CAPS ONLY. The real allowlist /
// scheme / handle validation is the pure normalizer in web (lib/profile/social-links.ts) — this loose
// schema is the boundary, not the security gate. Re-exported from index.ts (the deliberate public entry).
import { z } from "zod";

export const profileUpdateRequestSchema = z.object({
  bio: z.string().max(280).nullable().optional(),
  // Loose: keys/values fully re-validated server-side by normalizeSocialLinks. Cap value length here
  // (defense in depth) but DO NOT allowlist keys here — that lives in the normalizer.
  social_links: z.record(z.string(), z.string().max(200)).optional(),
});
export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequestSchema>;

export const profileUpdateResponseSchema = z.object({
  bio: z.string().nullable(),
  social_links: z.record(z.string(), z.string()),
});
export type ProfileUpdateResponse = z.infer<typeof profileUpdateResponseSchema>;
