// Attribute an ISO8601 timestamp to a local calendar day "YYYY-MM-DD".
//
// Uses Intl.DateTimeFormat("en-CA") which yields ISO-shaped dates deterministically in
// the given time zone. We deliberately do NOT hand-roll getTimezoneOffset() arithmetic:
// its sign is the inverse of ARCH's tzOffsetMinutes convention — a known trap. Phase 2
// needs only the local-day STRING; the negated server offset is a Phase-5 concern.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function resolveTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function toLocalDay(iso: string, timeZone: string): string {
  return formatterFor(timeZone).format(new Date(iso));
}
