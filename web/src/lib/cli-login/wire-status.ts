// Canonical DB<->wire status reconciliation in ONE place; exports the wire type.
// WIRE (CLI-facing, ARCH §3 routes table): pending | slow_down | complete | denied | expired
// DB device_grants.status (plain text col):  pending | approved | denied | expired | complete
// RFC 8628 long-form lineage: authorization_pending | slow_down | access_denied | expired_token
//   pending   <- DB pending            (keep polling)
//   slow_down <- per-grant too-fast    (keep polling; CLI backs off)
//   complete  <- DB approved, 1st poll (atomic flip to 'complete'; token handed off)
//   denied    <- DB denied             (terminal)
//   expired   <- past expires_at / unknown / consumed (terminal)
// NOTES: the §3 routes table is ILLUSTRATIVE (shows pending/slow_down/complete); denied/
// expired are the §4.3-prose terminals it elides. The 'complete' envelope is a documented
// SUPERSET — it adds top-level `userId` because §4.3 step 5 requires the CLI to persist
// {"userId":"<uuid>"} into auth.json. 'approved' is a DB-only intermediate never seen on the wire.
export type WireStatus = "pending" | "slow_down" | "complete" | "denied" | "expired";
