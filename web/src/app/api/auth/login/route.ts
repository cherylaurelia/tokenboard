// GET /api/auth/login — starts GitHub OAuth (PKCE). signInWithOAuth on the SERVER
// returns the provider URL and writes the code-verifier cookie on this response; we 302
// the browser to GitHub via Supabase. Default profile+email scopes only (configured in
// the Supabase dashboard, not requested here).
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    if (error) console.warn(`auth/login: signInWithOAuth failed: ${error.message}`);
    return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
  }

  return NextResponse.redirect(data.url); // 302 to GitHub via Supabase
}
