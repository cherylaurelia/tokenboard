// PURE, dependency-free sparkline over the 8 block glyphs. Normalizes per-series
// (min -> lowest glyph, max -> highest). Empty or all-equal series renders flat.
const GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const ASCII_GLYPHS = ["_", ".", ".", "-", "-", "=", "=", "#"];

export function sparkline(values: number[], ascii = false): string {
  const glyphs = ascii ? ASCII_GLYPHS : GLYPHS;
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return glyphs[0]!.repeat(values.length);
  return values
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (glyphs.length - 1));
      return glyphs[idx]!;
    })
    .join("");
}
