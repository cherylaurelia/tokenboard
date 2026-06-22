// Stable-key-order, no-whitespace stringify over the chunk body, mirroring the server's
// canonical-json.ts. Kept CLI-local (no web import). This is what makes the content-derived
// Idempotency-Key match the SAME chunk on a re-run, so a retry replays instead of re-minting.
export function canonicalChunkJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalChunkJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalChunkJson(obj[k])}`);
  return `{${entries.join(",")}}`;
}
