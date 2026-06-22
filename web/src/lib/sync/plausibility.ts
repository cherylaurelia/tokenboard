// DESIGN §9 derived plausibility ceiling + compare. Pure.
// ~10^4 tok/s aggregate throughput (cache reads dominate) × 86,400 s/day × ~10 parallel agents.
// A day total above this is flagged (DAY_TOTAL_IMPLAUSIBLE) — advisory only (§4.6): counts are
// preserved, the day is NOT excluded from ranking. Only banned_at hides a user.
export const DAY_TOTAL_PLAUSIBILITY_CEILING = 10_000 * 86_400 * 10; // 8.64e12 tokens/day

export function isImplausibleDayTotal(dayTokens: bigint): boolean {
  return dayTokens > BigInt(DAY_TOTAL_PLAUSIBILITY_CEILING);
}
