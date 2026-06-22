// Pure display formatters for the board/profile money + token amounts. No I/O.

// $1,180.00 — 2dp with thousands separators (the cost is already 2dp at the assembler edge).
export function formatUsd2dp(cost: number): string {
  return cost.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// 6_900_000 -> { value: "6.9", unit: "M" } so the unit can render in a dimmer span (the prototype's
// .tok .m). Sub-1000 returns the bare integer with an empty unit.
export function humanizeTokens(tokens: number): { value: string; unit: string } {
  const abs = Math.abs(tokens);
  if (abs >= 1_000_000_000) return { value: trim(tokens / 1_000_000_000), unit: "B" };
  if (abs >= 1_000_000) return { value: trim(tokens / 1_000_000), unit: "M" };
  if (abs >= 1_000) return { value: trim(tokens / 1_000), unit: "K" };
  return { value: String(Math.round(tokens)), unit: "" };
}

// One decimal place, but drop a trailing ".0" (12.0 -> "12", 6.93 -> "6.9").
function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}
