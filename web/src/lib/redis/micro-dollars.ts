// Integer micro-dollar (USD*1e6) helpers — the cost-board score encoding (§7.1). cost_usd is
// numeric(14,6) modeled as a STRING; we convert string -> micro-dollars WITHOUT a float (float drift
// is the exact thing the micro-dollar scheme exists to avoid). numeric(14,6) ceiling 1e14 micro-dollars
// < 2^53, so Number() of a score stays exact at tokenboard scale.

// "38.421000" / "640" / "-1.5" -> bigint micro-dollars. Throws on a non-decimal string (fail-loud at
// the trust boundary — a malformed cost_usd is a data bug, not a 0).
export function costUsdStringToMicros(value: string): bigint {
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throw new Error(`costUsdStringToMicros: not a decimal string: ${value}`);
  }
  const neg = value.startsWith("-");
  const parts = (neg ? value.slice(1) : value).split(".");
  const whole = parts[0] ?? "0";
  const frac = parts[1] ?? "";
  const fracPadded = (frac + "000000").slice(0, 6); // numeric(14,6) — 6 fractional digits
  const mag = BigInt(whole) * 1_000_000n + BigInt(fracPadded);
  return neg ? -mag : mag;
}

// micro-dollars -> USD rounded to EXACTLY 2dp (the §7.2 display edge ONLY). Accepts the JS number
// Upstash returns for a ZSET score (exact <2^53) or a bigint. Round-half-up on cents.
export function microsToUsd2dp(micros: number | bigint): number {
  const m = typeof micros === "bigint" ? Number(micros) : micros;
  return Math.round(m / 10_000) / 100; // micros/1e4 = hundredths; /100 -> dollars.2dp
}
