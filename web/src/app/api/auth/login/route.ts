// GET /api/auth/login — starts GitHub OAuth (PKCE). signInWithOAuth on the SERVER
// returns the provider URL and writes the code-verifier cookie on this response; we 302
// the browser to GitHub via Supabase. Default profile+email scopes only (configured in
// the Supabase dashboard, not requested here).
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforce } from "@/lib/ratelimit/enforce";

export async function GET(request: NextRequest) {
  // §8.2 — 60/min per-IP on the OAuth handoff (DoS surface). Fail-open on an Upstash error.
  const gate = await enforce(request, "oauthStart");
  if (!gate.ok) return gate.response;

  const { origin, searchParams } = new URL(request.url);

  // Open-redirect guard (trust boundary) — identical to /auth/callback. Lets /claim send an
  // unauthenticated visitor through login and back to /claim?code=... safely.
  const requestedNext = searchParams.get("next") ?? "/me";
  let next = "/me";
  if (
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\")
  ) {
    const candidate = new URL(requestedNext, origin);
    if (candidate.origin === origin) next = candidate.pathname + candidate.search;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data.url) {
    if (error) console.warn(`auth/login: signInWithOAuth failed: ${error.message}`);
    return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
  }

  return NextResponse.redirect(data.url); // 302 to GitHub via Supabase
}
