# tokenboard — repo instructions

See `DESIGN.md` for the canonical product design and `ARCHITECTURE.md` for the technical design.

## No personal identifiers in docs/code (MANDATORY)

- **Never** put real personal names, personal emails, or the owner's employer in any doc, markdown, comment, mockup, or example (`DESIGN.md`, `ARCHITECTURE.md`, code, etc.).
- Use neutral fictional placeholders in all examples: handles like `devon`, `doomslug`; names like `Devon Lee`; companies/domains like `acme-corp.com`. Never a real person's or real employer's name/email.
- **Sole exception:** the commit-author identity line directly below — it must name the real owner to enforce sole-authorship, and lives only here, not in product docs.

## Rules (MANDATORY)

Detailed rules live in `.claude/rules/`. Follow them exactly:

- **Git** (commit authorship + Conventional Commits): @.claude/rules/git.md
- **Code** (language-agnostic conventions, no barrel files): @.claude/rules/code.md
- **Frontend** (`web` only — design tokens, a11y, components): @.claude/rules/frontend.md
