// PURE admin gate decision — no I/O, no `server-only` (mirrors identifiers.ts/cache-decision.ts so
// `node --import tsx --test` can load it; an `import type` from a server-only module is erased at
// runtime, so importing the Viewer/ViewerResult TYPES here is safe). The gate is AUTHORITATIVE on the
// DB column, NEVER the handle string. A null (anon) OR "outage" viewer is never admin; a present
// viewer is admin iff is_admin === true.
import type { Viewer, ViewerResult } from "@/lib/auth/get-viewer";

// isAdminRow: the DB's is_admin for the viewer's userId (null when no row / not selected).
export function decideAdmin(viewer: ViewerResult, isAdminRow: boolean | null): Viewer | null {
  if (viewer === null || viewer === "outage") return null; // anon OR auth outage -> not admin (fail-closed)
  return isAdminRow === true ? viewer : null;
}
