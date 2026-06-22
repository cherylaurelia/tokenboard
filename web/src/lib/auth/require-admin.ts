// The /tuna admin gate. getViewer() -> if null/"outage" not admin; else SELECT is_admin via the
// SERVICE-ROLE `db` (DATABASE_URL connects as the table owner = BYPASSRLS — the SAME client
// assemble-board.ts uses) for the viewer's userId. Returns the Viewer iff is_admin, else null. The
// CALLER turns null into the 404: the page calls notFound(); routes return a 404 NextResponse. NEVER
// 403/redirect/503 — the route MUST be indistinguishable from a non-existent path for non-admins (a
// 503 on outage would weakly hint the route exists; we fail-closed to 404). Decision logic is the
// pure, unit-tested decideAdmin(); this file is only I/O. We LOG the rare "outage"->deny so an owner
// seeing a phantom 404 can diagnose it. NO secrets.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getViewer, type Viewer } from "@/lib/auth/get-viewer";
import { decideAdmin } from "@/lib/auth/admin-decision";

export async function requireAdmin(): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (viewer === null || viewer === "outage") {
    if (viewer === "outage") {
      console.warn("requireAdmin: auth outage -> denied (fail-closed 404)");
    }
    return decideAdmin(viewer, null);
  }
  // Fail-CLOSED on a DB error: a throw here must NOT propagate (a 500 both breaks the page for the
  // owner AND reveals the route exists, defeating the 404-indistinguishability). Deny -> notFound().
  try {
    const rows = (await db.execute(sql`
      select is_admin as "isAdmin" from users where id = ${viewer.userId} limit 1
    `)) as unknown as Array<{ isAdmin: boolean }>;
    return decideAdmin(viewer, rows[0]?.isAdmin ?? null);
  } catch (err) {
    console.error("requireAdmin: is_admin lookup failed -> denied (fail-closed 404)", err instanceof Error ? err.message : err);
    return decideAdmin(viewer, null);
  }
}
