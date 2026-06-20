# tokenboard — design prototype

The chosen visual direction. Open `dashboard/index.html` in a browser (◐ toggles
light/dark). Screenshots in `shots/`.

**The direction:** elevated/refined dark-first dashboard (rounded surfaces, stat
strip, smooth sparklines, restrained podium, atmospheric coral glow) — Linear/
Vercel-meets-monkeytype in *restraint*, with our own brand color.

**Type system (the browserarena recipe — grotesk UI + mono numbers):**
- **Space Grotesk** for all UI — wordmark, nav, titles, labels, handles. Techy,
  distinctive, pairs tightly with the mono.
- **IBM Plex Mono** for *numbers only* — tokens, ranks, %, the big OG figure
  (`--data`). This is what makes data read "technical benchmark," not a vibecoded
  all-mono wall.

**Accent:** muted clay coral **`#cc785c`**, muted-until-meaningful (YOU row, rank,
key numbers, brand mark). Everything else is grayscale on near-black (or warm
off-white in light mode).

`refs/browserarena.png` is the design reference whose font recipe we adapted
(it uses DM Sans body + IBM Plex Mono numbers; we use Space Grotesk + IBM Plex Mono).

Earlier explorations (pure-monkeytype, terminal, brutalist, and several UI-font
candidates) were tried and dropped in favor of this. Build the real app in
Next.js + shadcn with this exact type + `#cc785c` theme.
