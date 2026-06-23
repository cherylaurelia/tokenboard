// Presentational shortening of a canonical model id for the preview ONLY. NEVER mutates summary
// data, the wire id, or the unpriced-model footnote keys (those use the raw model string — it is
// tokens-of-truth for pricing). Do NOT import this from normalize/aggregate code.
//   "claude-opus-4-8"            -> "opus-4.8"
//   "claude-sonnet-4-6"          -> "sonnet-4.6"
//   "claude-opus-4-1-20250805"   -> "opus-4.1"   (trailing date segment ignored)
// Unknown shapes: drop a leading "claude-" if present, else pass through verbatim.
export function displayModel(model: string): string {
  const m = model.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-\d+)?$/i);
  if (m) return `${m[1]!.toLowerCase()}-${m[2]}.${m[3]}`;
  return model.startsWith("claude-") ? model.slice("claude-".length) : model;
}
