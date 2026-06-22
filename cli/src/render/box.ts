import stringWidth from "string-width";
import cliTruncate from "cli-truncate";

// Hand-rolled box-drawing — chosen over cli-table3 so we control right-aligned numerics,
// per-cell color, and ASCII fallback (DESIGN §14.2). Display width is measured with
// string-width (correct for emoji/CJK handles) and overflow truncated with an ellipsis.

export type Align = "left" | "right";

interface Glyphs {
  tl: string; tr: string; bl: string; br: string;
  h: string; v: string;
  ltee: string; rtee: string; ttee: string; btee: string; cross: string;
}

const UNICODE: Glyphs = {
  tl: "┌", tr: "┐", bl: "└", br: "┘",
  h: "─", v: "│",
  ltee: "├", rtee: "┤", ttee: "┬", btee: "┴", cross: "┼",
};

const ASCII: Glyphs = {
  tl: "+", tr: "+", bl: "+", br: "+",
  h: "-", v: "|",
  ltee: "+", rtee: "+", ttee: "+", btee: "+", cross: "+",
};

export function glyphs(ascii: boolean): Glyphs {
  return ascii ? ASCII : UNICODE;
}

// Pad/truncate a cell to an exact display width, honoring alignment.
export function padCell(text: string, width: number, align: Align): string {
  const truncated = cliTruncate(text, width, { position: "end" });
  const pad = width - stringWidth(truncated);
  if (pad <= 0) return truncated;
  const spaces = " ".repeat(pad);
  return align === "right" ? spaces + truncated : truncated + spaces;
}

// A horizontal rule: "├───┼───┤" style. `position` selects the corner/tee set.
export function rule(colWidths: number[], position: "top" | "mid" | "bottom", g: Glyphs): string {
  const [left, junction, right] =
    position === "top"
      ? [g.tl, g.ttee, g.tr]
      : position === "bottom"
        ? [g.bl, g.btee, g.br]
        : [g.ltee, g.cross, g.rtee];
  return left + colWidths.map((w) => g.h.repeat(w + 2)).join(junction) + right;
}

// A content row: "│ a │ b │". Cells are pre-padded strings (already width-correct).
export function row(cells: string[], g: Glyphs): string {
  return g.v + cells.map((c) => ` ${c} `).join(g.v) + g.v;
}
