// tzOffsetMinutes per the ARCH convention (-420 for UTC-7). JS Date.getTimezoneOffset() returns the
// INVERSE sign (+420 for UTC-7), so NEGATE it. This is the documented trap normalize/local-day.ts
// deliberately avoided.
export function tzOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset();
}
