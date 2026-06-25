// POST /api/auth/logout — ends the session. supabase.auth.signOut() clears the auth cookies on this
// response (Route Handler cookies are writable). POST-only so a prefetch/link can't sign a user out;
// the nav submits a tiny <form>. Always 303 back to "/" afterwards, success or not.
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signOut();
  if (error) console.warn(`auth/logout: signOut failed: ${error.message}`);

  return NextResponse.redirect(new URL("/", origin), { status: 303 });
}
