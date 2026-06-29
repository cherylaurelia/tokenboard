export const INVITE_JOIN_PATH = "/communities";

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export function inviteLink(origin: string, code: string): string {
  return `${origin}${INVITE_JOIN_PATH}?code=${encodeURIComponent(code)}`;
}

export function parseInviteCode(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const fromQuery = readCodeParam(raw);
  if (fromQuery && CODE_RE.test(fromQuery)) return fromQuery;

  const bare = raw.replace(/\s/g, "").toUpperCase();
  if (CODE_RE.test(bare)) return bare;

  return null;
}

function readCodeParam(raw: string): string | null {
  try {
    const url = new URL(raw);
    const v = url.searchParams.get("code");
    return v ? v.toUpperCase() : null;
  } catch {
    const m = raw.match(/[?&]?code=([^&\s]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]).toUpperCase() : null;
  }
}
