# tokenboard — repo instructions

See `DESIGN.md` for the canonical product design and `ARCHITECTURE.md` for the technical design.

## No personal identifiers in docs/code (MANDATORY)

- **Never** put real personal names, personal emails, or the owner's employer in any doc, markdown, comment, mockup, or example (`DESIGN.md`, `ARCHITECTURE.md`, code, etc.).
- Use neutral fictional placeholders in all examples: handles like `devon`, `doomslug`; names like `Devon Lee`; companies/domains like `acme-corp.com`. Never a real person's or real employer's name/email.
- **Sole exception:** the commit-author identity line directly below — it must name the real owner to enforce sole-authorship, and lives only here, not in product docs.

## Git commit authorship (MANDATORY)

- The repository owner is the **sole author** of all commits. Identity: `angelafeliciaa <angela_felicia@yahoo.com>` (set repo-locally).
- **Never** add a `Co-Authored-By: Claude` (or any AI) trailer to commit messages.
- **Never** add "Generated with Claude Code", AI signatures, robot emoji tags, or any AI attribution to commit messages, bodies, or PR descriptions.
- **Never** set the git `author` or `committer` to Claude/Anthropic — use the owner's configured git identity only.
- Applies to commits, amends, rebases, squashes, and PR/MR descriptions.

## Commit messages — Conventional Commits (MANDATORY)

Every commit message MUST follow the [Conventional Commits](https://www.conventionalcommits.org) spec:

```
<type>(<optional scope>): <subject>

<optional body — what & why, wrapped ~72 cols>

<optional footer — BREAKING CHANGE:, refs>
```

**Rules:**
- **`type`** is one of: `feat` (new feature), `fix` (bug fix), `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `style`, `revert`.
- **`scope`** is optional and lowercase, naming the area touched: `cli`, `api`, `web`, `db`, `auth`, `leaderboard`, `og`, `sync`, `parser`, `ccusage`, `docs`, `infra`.
- **subject**: imperative mood ("add", not "added"/"adds"), lowercase first letter, no trailing period, ≤ ~72 chars.
- **Breaking changes**: append `!` after type/scope (`feat(api)!: ...`) **and** add a `BREAKING CHANGE: <desc>` footer.
- One logical change per commit. Don't bundle unrelated changes.

**Examples:**
- `feat(cli): add tokenboard sync command wrapping ccusage`
- `feat(parser): global message.id dedup for Claude Code logs`
- `fix(api): compute cost server-side instead of trusting client`
- `docs: add sync cadence & client-update model`
- `refactor(leaderboard): use ZADD absolute score for idempotent sync`
- `chore(deps): pin ccusage@20`
