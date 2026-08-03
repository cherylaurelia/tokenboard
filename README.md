<div align="center">

<img src="web/public/brand/caret.svg" alt="" width="72" />

# tokenboard

### See who's burning the most tokens.

A public leaderboard for agentic-coding usage. tokenboard reads how many tokens
you burn across Claude Code, Codex, etc.

[![npm](https://img.shields.io/npm/v/@tokenboard/cli?color=cc785c&label=%40tokenboard%2Fcli)](https://www.npmjs.com/package/@tokenboard/cli)
[![license](https://img.shields.io/badge/license-MIT-cc785c)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-cc785c)](https://nodejs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-cc785c)](CONTRIBUTING.md)

[**Live board → tokenboard.sh**](https://tokenboard.sh) &nbsp;·&nbsp; [Quickstart](#quickstart) &nbsp;·&nbsp; [How it works](#how-it-works) &nbsp;·&nbsp; [Privacy](#privacy)

</div>

---

## Quickstart

```bash
npx @tokenboard/cli        # see your number locally — no login required
```

That's it. Run it once to preview your usage, then claim your spot with GitHub to
land on the board. After a global install the command is just `tokenboard`:

```bash
tokenboard                 # preview + claim
tokenboard sync            # push usage now
tokenboard sync --since 2026-08-01           # only upload usage on/after a day
tokenboard sync --sources codex,claude-code  # only upload specific tools
tokenboard whoami          # show the account this machine is signed in as
tokenboard service install # sync hourly in the background (launchd/systemd/Task Scheduler)
tokenboard service status  # is the background sync running, and when did it last run?
tokenboard upgrade         # update to the latest CLI and refresh the background sync
tokenboard show-data       # dry-run: print the exact payload before anything is sent
```

## Works with

`Claude Code` · `Codex` · `Opencode` · `Grok` · `Droid` · **+ more via [ccusage](https://github.com/ryoppippi/ccusage)**

## How it works

- A small CLI reads the usage logs your agentic tools already write **on your machine**.
- It uploads **aggregate token counts only** — run `tokenboard show-data` to see the
  exact payload before anything leaves your machine.
- The web dashboard ranks you within your communities, over rolling time windows.
- Run `tokenboard service install` to sync hourly in the background, or sync any time you run the CLI.

## Privacy

tokenboard uploads **only aggregate token counts** per `(day, tool, model)` — never
prompts, code, file paths, or repo names. The CLI is open source, installs via `npx`
(not `curl | bash`), and ships a `show-data` dry-run so you can verify exactly what
leaves your machine.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). Good first steps: add a new tool source,
improve the CLI output, or polish the leaderboard UI.

## License

[MIT](LICENSE) · third-party notices in [NOTICES.md](NOTICES.md).
