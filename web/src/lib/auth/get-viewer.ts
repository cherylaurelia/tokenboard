// Server helper resolving the signed-in viewer for pages + nav. Wraps getUser() (never getSession()
// — §2.5) and replicates the board route's no-session discrimination (route.ts L32-43): a missing
// session is the normal anonymous read (AuthSessionMissingError / 401 / 403) and returns null; a
// genuine transport/5xx Auth error returns "outage" so a PRIVATE page can surface a 503-ish state
// rather than a spurious 403, while public pages + nav treat "outage" as signed-out (graceful).
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Viewer {
  userId: string;
  handle: string;
  avatar: string | null;
}

// "outage" is distinct from null (anon) — see the note above.
export type ViewerResult = Viewer | null | "outage";

export async function getViewer(): Promise<ViewerResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    const name = (error as { name?: string }).name ?? "";
    const status = (error as { status?: number }).status;
    const isNoSession = name === "AuthSessionMissingError" || status === 401 || status === 403;
    if (!isNoSession) return "outage";
  }

  const user = data.user;
  if (!user) return null;

  const handle = String(user.user_metadata?.["user_name"] ?? "");
  if (!handle) return null; // a GitHub session always has user_name; no handle => treat as anon.

  const avatar =
    (user.user_metadata?.["avatar_url"] as string | undefined) ?? null;
  return { userId: user.id, handle, avatar };
}
