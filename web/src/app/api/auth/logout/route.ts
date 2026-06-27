import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signOut();
  if (error) console.warn(`auth/logout: signOut failed: ${error.message}`);

  return NextResponse.redirect(new URL("/", origin), { status: 303 });
}
