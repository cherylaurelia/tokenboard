# tokenboard — design prototype

The chosen visual direction for the dashboard. Open `v3-rich/index.html` directly
in a browser; a screenshot is in `shots/v3-rich.png`.

**v3-rich — the design direction.** Elevated/rich: Linear/Vercel-meets-monkeytype.
Near-black surfaces, **muted clay coral `#cc785c`** accent used only on meaningful
bits (the YOU row, your rank, key numbers), mono data + sans labels, neutral-grey
avatars, smooth inline-SVG sparklines (all grey except the coral YOU row), a top-3
podium, a stat strip, and the YOU row with a coral left-rail. Has a light/dark
toggle (◐ top-right; warm off-white light mode). The page also includes the OG
share card (1200×630) that gets posted to X.

Accent history: started on monkeytype amber `#e2b714` (too clone-y), explored ~10
alternatives; neon options (flame/lime/magenta/violet/cyan) read "vibecoded", so
landed on the muted/elegant `#cc785c` clay coral. See `DESIGN.md` §4.3.

(Two alternative directions — pure-monkeytype and terminal-native — were explored
and dropped in favor of v3. The terminal-native ideas inform the CLI renderer in
`DESIGN.md` §14, not the web app.)

This is a static prototype to lock the vibe before building the real thing in
Next.js + shadcn with a custom monkeytype theme.
