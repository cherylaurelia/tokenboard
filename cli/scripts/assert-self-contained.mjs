#!/usr/bin/env node
// Hard gate: prove the BUILT artifact is self-contained, not just configured to be.
// Fails nonzero (blocking publish) if:
//   1. dist/cli.js is missing (build did not run), or
//   2. dist/cli.js carries a bare import/require of ANYTHING other than `zod` or a Node
//      builtin — an ALLOWLIST, so an un-inlined transitive (strip-ansi, emoji-regex, …)
//      or a workspace dep (@tokenboard/contracts) or a render lib that tsup failed to
//      bundle is caught, not just the four top-level names, or
//   3. the LiteLLM snapshot wasn't inlined (no known model key present, or a surviving
//      bare import of the JSON file), or
//   4. package.json carries a workspace: protocol in `dependencies`.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { builtinModules } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distPath = join(root, "dist", "cli.js");
const pkgPath = join(root, "package.json");

const fail = (msg) => {
  console.error(`assert-self-contained: ${msg}`);
  process.exit(1);
};

if (!existsSync(distPath)) fail("dist/cli.js missing — run `pnpm build` first.");

const dist = readFileSync(distPath, "utf8");

// Only these bare specifiers are allowed to survive in the published bundle.
const ALLOWED = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`), "zod"]);

// Collect every bare import/require specifier (skip relative/absolute paths).
const specifiers = new Set();
const patterns = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\brequire\(\s*["']([^"']+)["']\)/g,
  /\bimport\(\s*["']([^"']+)["']\)/g,
];
for (const re of patterns) {
  let m;
  while ((m = re.exec(dist)) !== null) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("/")) continue; // relative/absolute = inlined path
    // node:foo and bare builtins are fine; everything else must be on the allowlist.
    const bare = spec.startsWith("node:") ? spec : spec.split("/")[0];
    specifiers.add(bare);
  }
}

const leaked = [...specifiers].filter((s) => !ALLOWED.has(s) && !ALLOWED.has(s.replace(/^node:/, "")));
if (leaked.length > 0) {
  fail(`dist/cli.js bare-imports non-inlined module(s): ${leaked.join(", ")} — tsup did NOT inline them.`);
}

// The price snapshot must be inlined (no bare import of the JSON; a known model present).
if (/from\s*["']\.\/litellm-snapshot\.json["']/.test(dist)) {
  fail("dist/cli.js still imports ./litellm-snapshot.json — snapshot was not inlined.");
}
if (!dist.includes("claude-opus-4-8")) {
  fail("dist/cli.js does not contain the sentinel model key — price snapshot not inlined.");
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const deps = JSON.stringify(pkg.dependencies ?? {});
if (deps.includes("workspace:")) {
  fail("package.json `dependencies` carries a workspace: protocol — keep workspace pkgs as devDependencies.");
}

console.log(
  `assert-self-contained: OK — only zod + node builtins survive (${[...specifiers].sort().join(", ")}); snapshot inlined; no workspace dep.`,
);
