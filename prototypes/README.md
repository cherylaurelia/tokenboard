# tokenboard — design prototype

The chosen visual direction for the dashboard. Open `v3-rich/index.html` directly
in a browser; a screenshot is in `shots/v3-rich.png`.

**v3-rich — the design direction.** Elevated/rich: Linear/Vercel-meets-monkeytype.
Near-black surfaces, amber `#e2b714` accent used only on meaningful bits (the YOU
row, your rank, key numbers), mono data + sans labels, colored initial-circle
avatars, smooth inline-SVG sparklines, a top-3 podium, a stat strip, and the YOU
row with an amber left-rail. The page also includes the OG share card (1200×630)
that gets posted to X.

(Two alternative directions — pure-monkeytype and terminal-native — were explored
and dropped in favor of v3. The terminal-native ideas inform the CLI renderer in
`DESIGN.md` §14, not the web app.)

This is a static prototype to lock the vibe before building the real thing in
Next.js + shadcn with a custom monkeytype theme.
