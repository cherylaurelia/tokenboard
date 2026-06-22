// @tokenboard/contracts — community create/join/leave wire contracts (ARCH §3 rows 391-394; §3.3
// is the authoritative superset of the terse §3 table row). Shared by the web routes (validate
// request + own response). POST /communities is type='community' ONLY — company boards are
// auto-materialized by verify (§5.2), never user-created here. URLs are ABSOLUTE per §3.3.
import { z } from "zod";

// The z.literal('community') gate makes a 'company' POST fail safeParse -> the route maps it to a
// disambiguated 400 'company_is_verify_only'. (ALSO defended by the communities_company_is_email_domain CHECK.)
export const createCommunityRequestSchema = z.object({
  type: z.literal("community"),
  name: z.string().trim().min(1).max(60),
  // optional vanity slug; server slugifies the name when absent and de-dups against the citext UNIQUE.
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "slug is 2-40 chars of a-z, 0-9, hyphen")
    .optional(),
  join_policy: z.enum(["open", "code"]),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
});
export type CreateCommunityRequest = z.infer<typeof createCommunityRequestSchema>;

export const createCommunityResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  join_code: z.string().length(6).nullable(),
  join_url: z.string().url(), // ABSOLUTE https://<origin>/community/<slug> (§3.3)
});
export type CreateCommunityResponse = z.infer<typeof createCommunityResponseSchema>;

// Canonical POST /communities/:id/join — code optional (open boards none; code boards require it).
export const joinByIdRequestSchema = z.object({
  code: z.string().trim().length(6).optional(),
});
export type JoinByIdRequest = z.infer<typeof joinByIdRequestSchema>;

// Friendly POST /communities/join — the invite form has a code, not a uuid. Code IS the lookup key.
export const joinByCodeRequestSchema = z.object({
  code: z.string().trim().length(6),
});
export type JoinByCodeRequest = z.infer<typeof joinByCodeRequestSchema>;

// §3.3 authoritative shape (superset of the §3-table {joined,role,board_url}).
export const joinResponseSchema = z.object({
  joined: z.boolean(),
  already_member: z.boolean().optional(),
  role: z.enum(["member", "admin", "owner"]),
  community: z.object({ slug: z.string(), name: z.string() }),
  board_url: z.string().url(), // ABSOLUTE https://<origin>/community/<slug> (§3.3)
});
export type JoinResponse = z.infer<typeof joinResponseSchema>;

export const leaveResponseSchema = z.object({ ok: z.literal(true) });
export type LeaveResponse = z.infer<typeof leaveResponseSchema>;
