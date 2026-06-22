// §6.4 step 7: reuse the shared @tokenboard/cost engine; own the token sum + the numeric(14,6)
// decimal formatting. Cost is AUTHORITATIVE here (the CLI's offline estimate is cosmetic).
import { estimateCost, type PriceTable } from "@tokenboard/cost";
import type { NormalizedRecord } from "@tokenboard/contracts";

export interface PricedRecord {
  record: NormalizedRecord;
  tokens: bigint; // input+output+cacheRead+cacheCreate5m+cacheCreate1h
  costUsd6dp: string; // numeric(14,6) column value — full precision, never rounded to 2dp
  priced: boolean;
}

// The engine returns ONLY costUsd; the server owns the token sum (ARCH §6.4 step 7).
export function priceRecord(record: NormalizedRecord, prices: PriceTable): PricedRecord {
  const { costUsd, priced } = estimateCost(record, prices);
  const tokens =
    BigInt(record.input) +
    BigInt(record.output) +
    BigInt(record.cacheRead) +
    BigInt(record.cacheCreate5m) +
    BigInt(record.cacheCreate1h);
  // Store at numeric(14,6): 6 decimals, never 2dp (IMPLEMENTATION §2.4). toFixed(6) is exact at these
  // magnitudes (cost/day << $1e8, well within float53 microdollars).
  return { record, tokens, costUsd6dp: costUsd.toFixed(6), priced };
}

// computed.totalCostUsdDelta is FULL precision (do NOT round to 2dp). DEFINITION (deliberate): the SUM
// of the numeric(14,6)-STORED row costs for this sync (= SUM(usage_day.cost_usd) over affected rows),
// summed with integer micro-dollar math to avoid float drift across many rows and stay consistent with
// the DB rows.
export function sumCostUsd(values: string[]): number {
  let micros = 0n;
  for (const v of values) {
    const neg = v.startsWith("-");
    const parts = (neg ? v.slice(1) : v).split(".");
    const whole = parts[0] ?? "0";
    const frac = parts[1] ?? "";
    const fracPadded = (frac + "000000").slice(0, 6);
    const mag = BigInt(whole) * 1_000_000n + BigInt(fracPadded);
    micros += neg ? -mag : mag;
  }
  return Number(micros) / 1_000_000;
}
