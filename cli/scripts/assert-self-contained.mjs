#!/usr/bin/env node
// Hard gate: prove the BUILT artifact is self-contained, not just configured to be.
// Fails nonzero (blocking publish) if:
//   1. dist/cli.js does not exist (build did not run), or
//   2. dist/cli.js still carries a bare import/require of @tokenboard/contracts
//      (i.e. tsup did NOT inline it — it would resolve to an unpublished workspace pkg), or
//   3. package.json carries @tokenboard/contracts (or any workspace: protocol) in
//      `dependencies` (which pnpm publish would rewrite to a non-existent registry version).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distPath = join(root, "dist", "cli.js");
const pkgPath = join(root, "package.json");

const fail = (msg) => {
  console.error(`assert-self-contained: ${msg}`);
  process.exit(1);
};

if (!existsSync(distPath)) fail("dist/cli.js missing — run `pnpm build` first.");

const dist = readFileSync(distPath, "utf8");
// A bare import/require of the workspace pkg means it was NOT inlined.
if (/(?:from|require\()\s*["']@tokenboard\/contracts["']/.test(dist)) {
  fail("dist/cli.js still imports @tokenboard/contracts — tsup noExternal did NOT inline it.");
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const deps = JSON.stringify(pkg.dependencies ?? {});
if (deps.includes("@tokenboard/contracts") || deps.includes("workspace:")) {
  fail("package.json `dependencies` carries a workspace/contracts dep — keep contracts a devDependency.");
}

console.log("assert-self-contained: OK — contracts inlined, no workspace dep in published deps.");
