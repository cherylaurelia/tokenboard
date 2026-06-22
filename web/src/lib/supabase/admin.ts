// service_role (sb_secret_) client. BYPASSRLS. SERVER-ONLY.
// `import "server-only"` is a build-time fence: Next errors if this module is imported
// from a Client Component, so the secret key can never reach the browser bundle. The key
// is also read from a NON-NEXT_PUBLIC_ env var, so it is undefined client-side regardless.
// No cookies, no session, no token refresh — it never represents a user. Resolve and
// authorize the user_id IN CODE (via the server client's getUser/getClaims) BEFORE use.
//
// Phase 3 ships this with no caller by design: the handle_new_user trigger does the
// profile mirror, so the OAuth callback performs zero service_role writes. Shipping the
// guarded client now removes the secret-key footgun from the next phase's PR.
import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // sb_secret_… — NEVER NEXT_PUBLIC_

if (!url || !secretKey) {
  throw new Error(
    "admin.ts: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (sb_secret_…) must be set",
  );
}

export const supabaseAdmin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
