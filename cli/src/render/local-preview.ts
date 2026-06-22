import type { LocalSummary } from "../aggregate/summary.js";
import type { TerminalStyle } from "./terminal-style.js";
import { styler } from "./terminal-style.js";
import { glyphs, padCell, rule, row } from "./box.js";
import { humanizeTokens, formatApproxUsd } from "./humanize.js";
import { sparkline } from "./sparkline.js";

// PURE: render the local preview to a string (render-once-and-exit, screenshot-clean).
// The "~$" is ALWAYS a labeled estimate with the dim "server is authoritative" footnote;
// it is NEVER transmitted. The board shows THIS machine's own per-tool usage — not ranks
// vs other people (that needs server data; deferred to Phase 6/7). The claim-CTA footer
// is cosmetic text only (TTY-only) — it persists nothing and calls no stub.
export function renderLocalPreview(summary: LocalSummary, style: TerminalStyle): string {
  const c = styler(style);
  const g = glyphs(style.ascii);
  const lines: string[] = [];

  // Headline.
  lines.push(
    c.bold(`you burned ${humanizeTokens(summary.totalTokens)} tokens`) +
      ` · ${formatApproxUsd(summary.totalCostUsd)} est`,
  );
  lines.push("");
  lines.push(c.dim("🪙 tokenboard · your local usage"));

  // Per-tool board. Columns: tool | tokens | ~$ est | daily burn.
  const dayTokens = summary.perDay.map((d) => d.tokens);
  const spark = sparkline(dayTokens, style.ascii);

  const headers = ["tool", "tokens", "~$ est", "daily burn"];
  const aligns = ["left", "right", "right", "left"] as const;
  const bodyRows = summary.perTool.map((t) => [
    t.tool,
    humanizeTokens(t.tokens),
    formatApproxUsd(t.costUsd),
    spark, // same per-day series across the board in Phase 2 (per-tool series is Phase 6+)
  ]);

  const allRows = [headers, ...bodyRows];
  const colWidths = headers.map((_, col) =>
    Math.max(...allRows.map((r) => [...r[col]!].length), 1),
  );

  const cellAlign = (i: number): "left" | "right" => aligns[i] ?? "left";
  const width = (i: number): number => colWidths[i] ?? 1;

  lines.push(rule(colWidths, "top", g));
  lines.push(row(headers.map((h, i) => padCell(h, width(i), cellAlign(i))), g));
  lines.push(rule(colWidths, "mid", g));
  for (const r of bodyRows) {
    lines.push(row(r.map((cell, i) => padCell(cell, width(i), cellAlign(i))), g));
  }
  lines.push(rule(colWidths, "bottom", g));

  // Honest labels.
  lines.push(
    c.dim("approx $ is a local estimate from a bundled LiteLLM snapshot — the server is authoritative"),
  );
  if (summary.anyUnpriced) {
    lines.push(c.dim(`(some usage couldn't be priced: ${summary.unpricedModels.join(", ")})`));
  }

  return lines.join("\n");
}

// The cosmetic claim CTA — printed by the command on a TTY only. A literal string; it
// creates no identity and calls no claim flow (that is Phase 4).
export const CLAIM_CTA = "→ Sign in with GitHub to claim your spot → tokenboard claim";
