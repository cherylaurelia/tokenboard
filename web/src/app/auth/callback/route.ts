// GET /auth/callback — exchanges the OAuth ?code for a session (sets sb-<ref>-auth-token).
// The auth.users insert fires the handle_new_user trigger, which mirrors public.users.
// No service_role write here — the trigger is the profile mirror (linked_accounts is a
// later phase). Uses the SAME server-client cookie config as /api/auth/login so the PKCE
// code-verifier cookie is found.
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Open-redirect guard (trust boundary): only a same-origin path. Reject
  // protocol-relative (//evil), absolute URLs, and backslash variants (/\evil) that some
  // parsers normalize off-origin; then assert the resolved origin matches ours.
  const requestedNext = searchParams.get("next") ?? "/me";
  let next = "/me";
  if (
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\")
  ) {
    const candidate = new URL(requestedNext, origin);
    if (candidate.origin === origin) {
      next = candidate.pathname + candidate.search;
    }
  }

  if (!code) {
    // Distinguish a denied/expired consent from a malformed callback in logs.
    const oauthError = searchParams.get("error");
    if (oauthError) {
      console.warn(
        `auth/callback: OAuth error "${oauthError}": ${searchParams.get("error_description") ?? "(no description)"}`,
      );
    }
    return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
  }

  const supabase = await createSupabaseServerClient();
  // exchangeCodeForSession returns {error} for auth failures (incl. a missing/expired
  // PKCE verifier), but RE-THROWS non-AuthError exceptions (network failure on the /token
  // request, a storage throw). Wrap so any of those still redirect gracefully instead of
  // crashing the route with an unhandled 500.
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn(`auth/callback: exchangeCodeForSession failed: ${error.message}`);
      return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
    }
  } catch (err) {
    console.warn(
      `auth/callback: exchangeCodeForSession threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
