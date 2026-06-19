<div align="center">

# 🪙 tokenboard

### See who's burning the most tokens.

**Race your friends, not strangers.**

A public leaderboard for agentic-coding usage. tokenboard reads how many tokens
you burn across Claude Code, Codex, Gemini CLI, and the rest, and ranks you on a
private leaderboard against the people you invite.

[tokenboard.sh](https://tokenboard.sh) · [Design](./DESIGN.md) · [Architecture](./ARCHITECTURE.md)

</div>

---

## What it is

Most usage tools show you *your* numbers. tokenboard shows you **where you rank** —
and the unit isn't a global board of strangers, it's a **community you and your
friends create**. You vs your friends, this week, on tokens burned.

- 🪙 **Multi-tool** — aggregates Claude Code + Codex + Gemini CLI + the long tail
- 🏆 **Ranked** — usage tools show your number; tokenboard shows where you *rank*
- 👥 **Communities** — make a room, drop the link in your group chat, race
- 🔒 **Aggregate-only** — counts leave your machine; prompts, code, and file paths never do

## How it works

```bash
npx tokenboard          # see your number locally (no login)
                        # then claim your spot with GitHub
```

- A small CLI reads the usage logs your agentic tools already write **on your machine**
- It uploads **aggregate token counts only** — run `tokenboard show-data` to see the exact
  payload before anything is sent
- The web dashboard ranks you within your communities, over rolling time windows
- Sync hourly in the background (or any time you run the CLI)

## Status

🚧 **Pre-build.** The product and engineering design are complete and under active
implementation. Start here:

- **[DESIGN.md](./DESIGN.md)** — product design: positioning, user flows, the design language
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — engineering design: data model, API, sync protocol, leaderboards
- **[prototypes/](./prototypes/)** — visual design prototypes (open the `.html` files)

## Stack

TypeScript end to end — **Next.js** (web + API) on **Vercel**, **Postgres** (Neon) as
the system of record, **Upstash Redis** sorted sets for leaderboards, **next/og** for
share cards. The CLI is a thin Node client that wraps
[`ccusage`](https://github.com/ccusage/ccusage) for parsing the long tail.

## Privacy

tokenboard uploads **only aggregate token counts** per (day, tool, model) — never
prompts, code, file paths, or repo names. The CLI is open source, installs via `npx`
(not `curl | bash`), and ships a `show-data` dry-run so you can verify exactly what
leaves your machine.

## License

[MIT](./LICENSE). Built on the shoulders of [ccusage](https://github.com/ccusage/ccusage)
and [LiteLLM](https://github.com/BerriAI/litellm) — see [NOTICES.md](./NOTICES.md).
