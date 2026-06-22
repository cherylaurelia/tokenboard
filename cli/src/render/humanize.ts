// PURE display formatters. The "~"/"approx" prefix on USD is mandatory — the local
// figure is always a labeled estimate, never authoritative (ARCH §4.3).

export function humanizeTokens(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number, suffix: string) => {
    const s = v.toFixed(1);
    return (s.endsWith(".0") ? s.slice(0, -2) : s) + suffix;
  };
  if (abs >= 1e9) return fmt(n / 1e9, "B");
  if (abs >= 1e6) return fmt(n / 1e6, "M");
  if (abs >= 1e3) return fmt(n / 1e3, "K");
  return String(Math.round(n));
}

// Rounded to the nearest dollar, thousands-separated, with the mandatory "~".
export function formatApproxUsd(n: number): string {
  return "~$" + Math.round(n).toLocaleString("en-US");
}
