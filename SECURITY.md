# Security Policy

tokenboard handles usage data and credentials, so we take security reports
seriously and appreciate responsible disclosure.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.** Public
issues disclose the vulnerability before it can be fixed.

Instead, email **angela_felicia@yahoo.com** with:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if you have one),
- the affected component (CLI, web/API, etc.) and version/commit if known.

You can expect an acknowledgement within a few days. We'll work with you on a
fix and a coordinated disclosure timeline, and we're happy to credit you once
the issue is resolved (let us know how you'd like to be named).

## Scope

In scope: the tokenboard CLI, the web app / API, and this repository's code.

Out of scope: vulnerabilities in third-party dependencies themselves (report
those upstream — e.g. [`ccusage`](https://github.com/ryoppippi/ccusage)), and
findings that require physical access to a user's already-compromised machine.

## What tokenboard does and doesn't handle

By design, the CLI uploads **aggregate token counts only** — never your
prompts, code, file paths, or repo names. Reports that demonstrate any of that
data leaving the client are treated as high severity.
