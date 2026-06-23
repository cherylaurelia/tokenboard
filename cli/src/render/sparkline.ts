// PURE, dependency-free sparkline over the 8 block glyphs. Normalizes per-series
// (min -> lowest glyph, max -> highest). Empty or all-equal series renders flat. An optional
// `colorize(glyph, index)` lets the renderer accent each block to rhyme with the table — when
// omitted (the byte-clean path) output is identical to before (zero ANSI).
const GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const ASCII_GLYPHS = ["_", ".", ".", "-", "-", "=", "=", "#"];

export function sparkline(
  values: number[],
  ascii = false,
  colorize?: (glyph: string, index: number) => string,
): string {
  const glyphs = ascii ? ASCII_GLYPHS : GLYPHS;
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pick = (v: number) =>
    range === 0 ? glyphs[0]! : glyphs[Math.round(((v - min) / range) * (glyphs.length - 1))]!;
  return values.map((v, i) => (colorize ? colorize(pick(v), i) : pick(v))).join("");
}
