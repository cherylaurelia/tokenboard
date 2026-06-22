// PLACEHOLDER for Phase 3 (web auth). Will host the @supabase/ssr middleware that
// refreshes the access-token JWT + rotating refresh token on each request and writes
// the updated sb-<ref>-auth-token cookie. ARCH §4.1–4.2.
//
// Until Phase 3 wires it, this is a pass-through so `next dev`/`next build` succeed.
import { NextResponse, type NextRequest } from "next/server";

export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

// Scope will be narrowed in Phase 3; matcher excludes static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
