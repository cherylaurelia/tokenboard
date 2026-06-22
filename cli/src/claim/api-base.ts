// Single source for the API base URL. Default prod tokenboard.sh; dev override via
// TOKENBOARD_API_URL (e.g. http://localhost:3000). Validated http(s) at the trust boundary;
// trailing slash stripped so `${base}/api/v1/...` composes cleanly.
const DEFAULT_API_BASE = "https://tokenboard.sh";

export function resolveApiBase(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.TOKENBOARD_API_URL?.trim();
  const base = raw && raw !== "" ? raw : DEFAULT_API_BASE;
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`TOKENBOARD_API_URL is not a valid URL: ${base}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`TOKENBOARD_API_URL must be http(s): ${base}`);
  }
  return base.replace(/\/+$/, "");
}
