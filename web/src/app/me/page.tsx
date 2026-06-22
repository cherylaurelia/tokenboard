// /me — done-gate surface: proves getUser() resolves server-side (and the callback's
// landing target). Server component (no "use client"). Uses getUser() (revalidates vs
// the Auth server), never getSession() (spoofable). Null-safe when signed out.
// Semantic HTML; no design tokens yet (Phase 7 restyles).
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main>
        <h1>Not signed in</h1>
        <p>
          <a href="/api/auth/login">Sign in with GitHub</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Signed in</h1>
      <dl>
        <dt>User ID</dt>
        <dd>{user.id}</dd>
        <dt>Email</dt>
        <dd>{user.email ?? "—"}</dd>
        <dt>GitHub login</dt>
        <dd>{String(user.user_metadata?.["user_name"] ?? "—")}</dd>
      </dl>
    </main>
  );
}
