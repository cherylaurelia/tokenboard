// Phase-2 inert stubs for commands that arrive in later phases. They print a one-line
// notice and perform ZERO filesystem/network side effects — no auth.json/state.json read
// or write, no spawn. Registering the NAMES keeps the DESIGN §14.1 surface visible in
// --help so the shape is locked, without surfacing capability that doesn't exist yet.
//
// Flip points: claim = Phase 4 (device-flow + auth.json); sync = Phase 5 (POST /sync);
// top/board/me/join = Phase 6/7 (need server board JSON).
export function notAvailableYet(name: string, phase: string): void {
  process.stdout.write(`  tokenboard ${name} — coming in a later release (${phase}).\n`);
}
