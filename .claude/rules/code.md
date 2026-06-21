# Code Rules

Language-agnostic conventions for all code in this repo (`cli`, `web`, `api`, etc.). Stack-specific UI rules live in [frontend.md](frontend.md).

## No barrel files
- Do NOT create barrel files — `index.ts`/`index.js` that exist only to re-export from sibling modules (`export * from "./foo"`).
- Import directly from the module that defines the thing: `import { sync } from "./commands/sync"`, not `import { sync } from "./commands"`.

A package's *public* entry point (the one named in `package.json` `exports`/`main`) is not a barrel — that's a deliberate API surface. The rule is about *internal* re-export hubs.

## Naming & structure
- Names say what a thing is/does. No `data`, `info`, `tmp`, `util2`. A reader should understand a function from its signature.
- One logical responsibility per file/module. If a file needs "and" to describe it, consider splitting.
- Co-locate related code (a component with its styles/tests) over grouping by type.

## Functions
- Small and single-purpose. Early-return over deep nesting.
- No surprise side effects — a function named `getX` doesn't mutate or write.
- Prefer pure functions for logic; isolate I/O at the edges.

## Comments
- Comment the **why**, not the **what**. The code already says what it does.
- Match the surrounding comment density and style. Don't narrate obvious lines.
- Delete commented-out code — that's what git is for.

## Errors
- Fail loud, fail early. Don't swallow errors with empty `catch`.
- Validate inputs at trust boundaries (CLI args, API requests, parsed files).
- Error messages should tell the reader what to do next, not just what broke.

## Dependencies
- Pin versions for anything that affects reproducibility (no floating `latest` in committed manifests).
- Prefer the standard library / existing deps over adding a new package for something small.
- Before adding a dependency, check it isn't already solved by something in the tree.

## Don't
- No dead code, no unused exports, no "just in case" abstractions for a single caller.
- Don't trust the client — validate/compute authoritative values server-side.
- Don't commit secrets, `.env`, or build artifacts.
