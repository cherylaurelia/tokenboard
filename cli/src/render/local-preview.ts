import type { LocalSummary } from "../aggregate/summary.js";
import type { TerminalStyle } from "./terminal-style.js";
import { styler } from "./terminal-style.js";
import { glyphs, padCell, rule, row } from "./box.js";
import { humanizeTokens, formatApproxUsd } from "./humanize.js";
import { displayModel } from "./model-display.js";

// PURE: render the local preview to a string (render-once-and-exit, screenshot-clean).
// COLOR DISCIPLINE (cargo/gh restraint): ONE accent = coral, reserved for the headline number + the
// 🪙 wordmark + the TOTAL + the dominant model + the busy days in the tokens column. Everything
// secondary (labels, units, ~$ prefix, footnotes, box chrome) is dim; normal days stay plain
// full-weight text (never dimmed — readability first). A color:false run emits ZERO ANSI.
//
// The "~$" is ALWAYS a labeled estimate with the dim "server is authoritative" footnote; it is NEVER
// transmitted. The board shows THIS machine's own usage. The claim-CTA footer is cosmetic.
export function renderLocalPreview(summary: LocalSummary, style: TerminalStyle): string {
  const c = styler(style);
  const g = glyphs(style.ascii);
  const lines: string[] = [];

  // Hero — the token count is the brightest thing (bold + coral); the $ estimate steps down one
  // notch (coral, not bold) since it's the less-authoritative number. Explicitly ALL-TIME so it
  // matches the website board's all-time default.
  lines.push(
    c.dim("you've burned ") +
      c.bold(c.coral(humanizeTokens(summary.totalTokens))) +
      c.dim(" tokens all-time · ") +
      c.coral(formatApproxUsd(summary.totalCostUsd)) +
      c.dim(" est"),
  );
  lines.push("");
  lines.push(c.coral("🪙 tokenboard") + c.dim(" · your usage by day"));

  // Daily breakdown table (newest last), with a TOTAL row — like ccusage's daily report. The `model`
  // column names that day's dominant model (most tokens); the TOTAL shows the overall dominant.
  const headers = ["date", "model", "tokens", "~$ est"];
  const aligns = ["left", "left", "right", "right"] as const;
  const bodyRows = summary.perDay.map((d) => [
    d.date,
    displayModel(d.model),
    humanizeTokens(d.tokens),
    formatApproxUsd(d.costUsd),
  ]);
  const totalModel = summary.perModel[0] ? displayModel(summary.perModel[0].model) : "";
  const totalRow = ["TOTAL", totalModel, humanizeTokens(summary.totalTokens), formatApproxUsd(summary.totalCostUsd)];

  // Width each column on RAW (uncolored) cells across headers + body + total.
  const allRows = [headers, ...bodyRows, totalRow];
  const colWidths = headers.map((_, col) =>
    Math.max(...allRows.map((r) => [...r[col]!].length), 1),
  );

  const cellAlign = (i: number): "left" | "right" => aligns[i] ?? "left";
  const width = (i: number): number => colWidths[i] ?? 1;

  // PAD-THEN-COLOR: padCell always gets RAW text (width math stays on plain text); the optional
  // colorizer wraps the already-padded cell, so ANSI escapes (zero display width) never break
  // alignment and coral never touches a box border.
  type Colorize = (padded: string, col: number) => string;
  const renderRow = (cells: string[], colorize?: Colorize) =>
    row(
      cells.map((cell, i) => {
        const padded = padCell(cell, width(i), cellAlign(i));
        return colorize ? colorize(padded, i) : padded;
      }),
      g,
    );

  // Per-day token intensity, normalized over the series — drives the tokens-column accent.
  // Accent-peaks-only: normal days plain, busy coral, peak bold hi-coral.
  const dayTokens = summary.perDay.map((d) => d.tokens);
  const min = dayTokens.length ? Math.min(...dayTokens) : 0;
  const max = dayTokens.length ? Math.max(...dayTokens) : 0;
  const range = max - min;
  const norm = (v: number) => (range === 0 ? 0 : (v - min) / range);

  // Chrome recedes: dim the box rules so the DATA pops over the grid.
  const dimRule = (pos: "top" | "mid" | "bottom") => c.dim(rule(colWidths, pos, g));

  // Columns: 0 date · 1 model · 2 tokens · 3 ~$ est.
  lines.push(dimRule("top"));
  lines.push(renderRow(headers, (p) => c.dim(p))); // header labels dim
  lines.push(dimRule("mid"));
  summary.perDay.forEach((d, idx) => {
    lines.push(
      renderRow(bodyRows[idx]!, (p, col) => {
        if (col === 1) return c.dim(p); // model: dim secondary info
        if (col === 2) return c.accentByLevel(p, norm(d.tokens)); // tokens: accent the busy days
        if (col === 3) return c.dim(p); // ~$ est recedes (it's an estimate)
        return p; // date: plain default
      }),
    );
  });
  lines.push(dimRule("mid")); // separate TOTAL from the daily rows
  lines.push(
    renderRow(totalRow, (p, col) => {
      if (col === 0) return c.dim(c.bold(p)); // dim-bold label
      if (col === 1) return c.coral(p); // overall dominant model: coral accent
      if (col === 2) return c.bold(c.coral(p)); // total tokens: the hero accent
      return c.coral(p); // total $: coral, one notch down (estimate)
    }),
  );
  lines.push(dimRule("bottom"));

  // Honest labels (dim — never coral, never removed).
  lines.push(
    c.dim("approx $ is a local estimate from a bundled LiteLLM snapshot — the server is authoritative"),
  );
  if (summary.anyUnpriced) {
    lines.push(c.dim(`(some usage couldn't be priced: ${summary.unpricedModels.join(", ")})`));
  }

  return lines.join("\n");
}

// The claim CTA. On an interactive TTY the command turns CLAIM_PROMPT into a [y/N] prompt that
// runs `claim` on yes; CLAIM_HINT is the passive fallback printed when the user declines or when
// the run isn't interactive (so the next step is always discoverable).
export const CLAIM_PROMPT = "Sign in with GitHub to claim your spot?";
export const CLAIM_HINT = "→ Claim your spot anytime → tokenboard claim";
