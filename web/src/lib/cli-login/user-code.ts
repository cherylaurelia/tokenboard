// The ONE source for the user_code alphabet, regex, and generator — shared by the start
// route (generate), the /claim page (validate), and the approve contract length check, so a
// future alphabet change can't drift generation from validation.
import { randomBytes } from "node:crypto";

// Crockford-ish, NO ambiguous 0 O 1 I L (and no U to dodge profanity). 8 chars over 30
// symbols ~= 39 bits; paired with the short TTL + auth-gated approve.
export const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

// Matches the alphabet exactly; char(9) shape "WXYZ-1234".
export const USER_CODE_RE = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{4}$/;

export function genUserCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += USER_CODE_ALPHABET[bytes[i]! % USER_CODE_ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
