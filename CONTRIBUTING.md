# Contributing to tokenboard

Thanks for your interest in tokenboard! This is an early-stage, open-source
project and contributions are welcome.

> **Status: pre-build.** The product and engineering design are complete and
> under active implementation. Right now the most useful contributions are
> feedback on the design docs and the prototypes — code scaffolding is just
> getting underway.

## Start here

- **[README.md](./README.md)** — what tokenboard is.
- **[DESIGN.md](./DESIGN.md)** — product design: positioning, flows, the design language.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — engineering design: data model, API, sync protocol, leaderboards.
- **[prototypes/](./prototypes/)** — open the `.html` files in a browser.

## Ways to contribute

- **Feedback / ideas** — open a GitHub issue describing the problem or proposal.
  For anything non-trivial, open an issue to discuss before sending a PR.
- **Bugs** — include steps to reproduce and what you expected. For *security*
  issues, do **not** open a public issue — see [SECURITY.md](./SECURITY.md).
- **Docs / prototypes** — fixes and improvements to the design docs and the
  HTML prototypes are easy, valuable first contributions.

## Development

The codebase is a TypeScript monorepo-in-progress: a Next.js web app + API on
Vercel, and the `@tokenboard/cli` Node client. Build and test instructions will
land here as the code does — until then, the prototypes are static HTML you can
open directly.

## Pull requests

1. Fork the repo and create a branch off `main`.
2. Keep each PR to **one logical change**; describe the what and the why.
3. Follow the commit-message convention below.
4. Make sure the project builds and any checks pass before requesting review.

### Commit messages — Conventional Commits

Every commit message follows the
[Conventional Commits](https://www.conventionalcommits.org) spec:

```
<type>(<optional scope>): <subject>
```

- **type**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
  `chore`, `style`, or `revert`.
- **scope** (optional, lowercase): the area touched — e.g. `cli`, `api`, `web`,
  `db`, `auth`, `leaderboard`, `sync`, `docs`.
- **subject**: imperative mood ("add", not "added"), lowercase first letter,
  no trailing period, ≤ ~72 chars.
- Breaking changes: append `!` after the type/scope and add a
  `BREAKING CHANGE:` footer.

Examples:

- `feat(cli): add sync command wrapping ccusage`
- `fix(api): compute cost server-side instead of trusting client`
- `docs: clarify the work-email verification flow`

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE). Don't add a `Co-Authored-By` trailer or any
AI-attribution line to commits — the contributor is the author.

## Code of conduct

This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md). By
participating you're expected to uphold it.
