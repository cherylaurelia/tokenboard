# Frontend Rules

Applies to the `web` project (leaderboard, profiles, OG images). The `cli` is not a frontend — these rules don't apply there.

## Design tokens — never hardcode
- NEVER write raw hex colors or `px` font sizes in components. Reference design tokens (CSS variables or Tailwind classes) only.
- One source of truth: a color/size change should edit a token, not N components.
- Colors come from a defined scale (e.g. `background, surface, surfaceAlt, border, text, textMuted, textInverse, accent, accentHover, accentText` + semantic `error/warning/success` and hover states). Don't invent new shades.
- Typography comes from a defined type scale (`xs → hero`). No arbitrary sizes.
- Avoid generic "AI default" fonts (Inter, Roboto, Arial, system-ui) unless the design spec explicitly calls for one.

## Universal rules
- 4px spacing grid — all margins/padding/gaps are multiples of 4.
- WCAG AA contrast minimum.
- 44px minimum touch targets.
- Always provide visible focus states.
- Respect `prefers-reduced-motion`.
- No inline styles — use utility/Tailwind classes.
- No `localStorage`/`sessionStorage` unless explicitly required.

## Accessibility & semantics
- Use semantic HTML (`button`, `nav`, `main`, `ul`/`li`) before reaching for `div`. A clickable thing is a `<button>`, not a `<div onClick>`.
- Every image has meaningful `alt` (or `alt=""` if decorative).
- Forms have associated `<label>`s; interactive elements are keyboard-operable.

## Components & state
- Keep components small and single-purpose. If a component does data-fetching AND layout AND business logic, split it.
- Prefer server components / server data fetching where the framework supports it; push client interactivity to the leaves.
- Co-locate state with where it's used. Lift only when genuinely shared. Don't reach for global state for local concerns.
- Lists need stable, meaningful `key`s — never the array index when items can reorder.

## Read before write
- NEVER modify a file you haven't read. Never assume contents from the filename or a previous turn — re-check.
- Before creating a component, search for it first — it may already exist.
- Smallest change possible. Targeted edits over full rewrites. Every line touched is a line that can introduce a bug.

## Verify before claiming
- Don't say "this should work" — confirm it. Run the build; check for errors.
- For visual changes, verify the actual rendered result (run the app / screenshot), not just that the code looks right.
- If you claim a component or token exists, cite the file path / variable name.
- Console errors and warnings are bugs. Zero tolerance.

## Diminishing returns — ship, don't polish
- 80% done and moving on beats 95% after burning 10 iterations on polish.
- If you're tweaking margins, nudging padding, or reordering imports — stop, you're over-optimizing. Complete the task.
- When marginal progress per pass gets tiny, you're plateauing. Move on and note what's unfinished for later.

## Scope discipline
- Only change what the current task requires. Don't refactor adjacent code, add features, or "improve" things you notice — flag them instead.
- Before finishing, verify every changed file is relevant to the task. Revert incidental changes.

## When stuck
- Read the error fully — understand WHAT failed and WHERE. Fix the root cause, not the symptom.
- After 3 failed attempts at the same fix, STOP. You likely misunderstand the root cause. Explain: what you tried, why it failed, what you recommend.
