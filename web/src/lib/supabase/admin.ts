// PLACEHOLDER for Phase 3+ (ingest, auth callback, email confirm, leaderboard writes).
// Will export supabaseAdmin — a service_role (BYPASSRLS) client built from the secret
// key (SUPABASE_SERVICE_ROLE_KEY = sb_secret_…). SERVER-ONLY, never sent to the browser;
// used only after the user_id is resolved/authorized in code. ARCH §2.2.
export {};
