// @tokenboard/contracts — work-email verification wire contracts (ARCH §3 rows 395-396, §5.3).
// The SAME 6-digit code is the OTP and is embedded in the magic link. Server normalizes/strips the
// email; the schema only does the cheap shape gate (authoritative normalization is server-side, §5.3).
import { z } from "zod";

export const verifyEmailStartRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type VerifyEmailStartRequest = z.infer<typeof verifyEmailStartRequestSchema>;

export const verifyEmailStartResponseSchema = z.object({
  sent: z.literal(true),
  domain: z.string(),
  expires_in: z.number().int().positive(), // 900 (15m)
});
export type VerifyEmailStartResponse = z.infer<typeof verifyEmailStartResponseSchema>;

export const verifyEmailConfirmRequestSchema = z.object({
  domain: z.string().trim().toLowerCase(),
  code: z.string().trim().regex(/^[0-9]{6}$/, "code is 6 digits"),
});
export type VerifyEmailConfirmRequest = z.infer<typeof verifyEmailConfirmRequestSchema>;

export const verifyEmailConfirmResponseSchema = z.object({
  verified: z.literal(true),
  community: z.object({ id: z.string().uuid(), slug: z.string() }),
  joined: z.literal(true),
  badge: z.literal("company"),
});
export type VerifyEmailConfirmResponse = z.infer<typeof verifyEmailConfirmResponseSchema>;
