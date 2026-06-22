# Third-Party Notices

tokenboard is MIT-licensed (see `LICENSE`). It builds on the following
open-source projects, with gratitude:

## ccusage

tokenboard's CLI shells out to [`ccusage`](https://github.com/ryoppippi/ccusage)
to parse local usage logs for the long tail of agentic-coding tools (Codex,
opencode, grok, droid, and others). ccusage is MIT-licensed.

- Project: https://github.com/ryoppippi/ccusage
- Copyright (c) ryoppippi
- License: MIT

## LiteLLM model pricing data

tokenboard vendors a pinned snapshot of LiteLLM's model pricing data
(`model_prices_and_context_window.json`) — used server-side for authoritative
cost and bundled into the CLI for the offline local-preview estimate.

- Project: https://github.com/BerriAI/litellm
- License: MIT
- Pinned commit: `9f97111edd736cf81e532f345663885457b916a9`
  (sha256 `e860025a4ddf7eb576b46a43126a0a523e0a60bdc296516d3533ddc17be31d6e`)
- Provenance recorded in `cli/src/cost/provenance.json`

---

This file lists projects whose licenses request attribution or whose data we
vendor. It is informational and does not modify tokenboard's own MIT license.
