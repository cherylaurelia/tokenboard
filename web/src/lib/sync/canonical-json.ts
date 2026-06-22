// RFC 8785 JCS-style stable stringify for the idempotency request_hash. Recursively sorts object
// keys lexicographically, emits no inter-token whitespace, preserves array order. Records are
// zod-validated integers + an int tzOffsetMinutes, so JS Number->string is exact — a hand-rolled
// stringify suffices. Canonicalization MUST be byte-identical on reserve and every replay compare.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys
    .filter((k) => obj[k] !== undefined) // JSON.stringify drops undefined; mirror that
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${entries.join(",")}}`;
}
