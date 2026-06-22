// @supabase/ssr SERVER client (RLS / PostgREST path). Per-request — never cache the
// returned client. Authorize via supabase.auth.getUser() or getClaims() — NEVER
// getSession() (its cookie payload is spoofable).
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requireSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "server.ts: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
    );
  }
  return { url, publishableKey };
}

export async function createSupabaseServerClient() {
  const { url, publishableKey } = requireSupabaseEnv();
  const cookieStore = await cookies(); // async in Next 16

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies() is read-only and throws.
          // Safe to ignore: the middleware refreshes/writes the session cookie per request.
        }
      },
    },
  });
}
