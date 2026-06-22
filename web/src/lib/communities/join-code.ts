// 6-char invite join code. Ambiguity-safe uppercase alphabet (no 0/O/1/I/L) so a human can read it
// off a screen and type it back. crypto.randomInt for uniform selection (not Math.random). This is a
// low-value invite token, not a secret — uniqueness is enforced by the communities.join_code UNIQUE
// (the create route retries on the 23505 collision); brute-force lockout is Phase 9 §8.2.
import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars: no 0 O 1 I L
const LENGTH = 6;

export function mintJoinCode(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}
