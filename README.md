<div align="center">

# tokenboard

### See who's burning the most tokens.

A public leaderboard for agentic-coding usage. tokenboard reads how many tokens
you burn across Claude Code, Codex, Opencode, etc.

[![live](https://img.shields.io/badge/live-tokenboard.sh-cc785c?style=flat-square&labelColor=14151f)](https://tokenboard.sh)
[![npx](https://img.shields.io/badge/npx-%40tokenboard%2Fcli-cc785c?style=flat-square&labelColor=14151f&logo=npm&logoColor=cc785c)](https://www.npmjs.com/package/@tokenboard/cli)
[![license](https://img.shields.io/badge/license-MIT-cc785c?style=flat-square&labelColor=14151f)](#)
[![counts only](https://img.shields.io/badge/uploads-counts%20only-5f998a?style=flat-square&labelColor=14151f)](#privacy)

<br />

<a href="https://tokenboard.sh">
  <img src="prototypes/shots/dashboard-pixel.png" alt="The tokenboard leaderboard — a community ranked by token spend, in the dark coral arcade theme." width="720" />
</a>

</div>

---
## How it works

```bash
npx @tokenboard/cli     # see your number locally (no login)
                        # then claim your spot with GitHub
```

- A small CLI reads the usage logs your agentic tools already write **on your machine**
- It uploads **aggregate token counts only**, run `tokenboard show-data` to see the exact
  payload before anything is sent (after a global install the command is just `tokenboard`)
- The web dashboard ranks you within your communities, over rolling time windows
- Sync hourly in the background (or any time you run the CLI)

## Privacy

tokenboard uploads **only aggregate token counts** per (day, tool, model),  never
prompts, code, file paths, or repo names. The CLI is open source, installs via `npx`
(not `curl | bash`), and ships a `show-data` dry-run so you can verify exactly what
leaves your machine.
