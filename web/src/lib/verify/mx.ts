// §5.3 MX check — required ONLY to CREATE a new company board (skip if a board already exists for
// the domain). resolveMx has NO native timeout; wrap each attempt in a 3s race. Distinguish a
// DEFINITIVE 'no MX' (ENOTFOUND/ENODATA/empty) from a TRANSIENT failure (timeout/SERVFAIL/
// ECONNREFUSED): retry the transient case ONCE, then report 'unavailable' so the route returns a
// distinct retryable error rather than a terminal no_mx telling a legit user to check spelling.
// MX presence is a LIVENESS gate only — it does NOT prove company ownership (documented in risks).
import { resolveMx } from "node:dns/promises";

export type MxResult = "has_mx" | "no_mx" | "unavailable";

const DEFINITIVE_NO_MX = new Set(["ENOTFOUND", "ENODATA", "NOTFOUND", "NODATA"]);

async function resolveOnce(domain: string): Promise<MxResult> {
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("dns_timeout"), { code: "ETIMEOUT" })), 3000),
      ),
    ]);
    return Array.isArray(records) && records.length > 0 ? "has_mx" : "no_mx";
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    return DEFINITIVE_NO_MX.has(code) ? "no_mx" : "unavailable";
  }
}

export async function checkDomainMx(domain: string): Promise<MxResult> {
  const first = await resolveOnce(domain);
  if (first !== "unavailable") return first; // definitive answer — done
  return resolveOnce(domain); // transient -> one retry; still unavailable -> caller returns 503-ish
}
