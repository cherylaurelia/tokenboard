# @tokenboard/cli

A leaderboard for your agentic-coding token usage — race your friends, not strangers.

> **Status:** early release — local preview only. Sign-in, public boards, and
> syncing land in upcoming releases. Follow along at
> [tokenboard.sh](https://tokenboard.sh).

```bash
npx @tokenboard/cli            # local preview: your token usage + a rough $ estimate
npx @tokenboard/cli show-data  # dry-run: exactly what a future sync would upload
```

## What it does today

- Parses your local **Claude Code** session logs (`~/.claude/projects`) and shells
  out to [`ccusage`](https://github.com/ryoppippi/ccusage) for the long tail (Codex,
  Gemini, Goose, …) — **counts only**, never prompts, code, or file paths.
- Prints your total tokens and a **labeled `~$` estimate** computed offline from a
  bundled [LiteLLM](https://github.com/BerriAI/litellm) price snapshot. The estimate
  is cosmetic — the server is authoritative once syncing exists.

## Privacy

Runs **fully offline** — nothing is uploaded and no account is created. The only
outbound traffic is `npx` fetching the pinned `ccusage` package (an npm install, not
your usage data); with no network it's skipped and Claude Code still renders.

MIT licensed. Credits [ccusage](https://github.com/ryoppippi/ccusage) and
[LiteLLM](https://github.com/BerriAI/litellm) — see `NOTICES.md`.
