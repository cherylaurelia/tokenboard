// @supabase/ssr token-refresh proxy.
// Next 16 deprecates `middleware` in favor of `proxy` (codemod: middleware-to-proxy),
// but 16.2.9 still honors this file + `export function middleware`. Refreshes the
// access-token JWT + rotating refresh token each request and rewrites sb-<ref>-auth-token.
//
// Inlines createServerClient: middleware.ts lives at the web/ ROOT, which the @/ alias
// (./src/*) does NOT cover.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function requireSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "middleware.ts: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
    );
  }
  return { url, publishableKey };
}

export async function middleware(request: NextRequest) {
  const { url, publishableKey } = requireSupabaseEnv();

  // The response we return. setAll re-creates it so refreshed cookies survive.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        // ssr 0.12.0 forwards anti-cache-poisoning headers on the refresh write path;
        // headers is {} on non-refresh writes, so guard with ?? {}.
        for (const [key, value] of Object.entries(headers ?? {})) {
          supabaseResponse.headers.set(key, value);
        }
      },
    },
  });

  // IMPORTANT: do NOT run any code between createServerClient() and getUser().
  // Doing so causes hard-to-debug random logouts (token-refresh ordering breaks).
  await supabase.auth.getUser();

  // Phase 3 has no protected routes — refresh only, never redirect.
  // IMPORTANT: return supabaseResponse AS-IS. Building a fresh NextResponse here would
  // silently drop the refreshed Set-Cookie headers -> users get randomly logged out.
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
