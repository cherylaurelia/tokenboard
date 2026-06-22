// Canonicalize a tool/source name to a single lowercase form so one tool can never
// split across two spellings in the (date, tool, model) aggregation key.
export function canonicalTool(raw: string): string {
  return raw.trim().toLowerCase();
}
