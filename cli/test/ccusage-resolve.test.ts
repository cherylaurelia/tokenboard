import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCachedCcusageV20 } from "../src/collectors/ccusage-source.js";

// Build a fake ~/.npm/_npx cache root with one hashed dir per (version, binField) and return the root.
function fakeCache(entries: Array<{ hash: string; pkg: unknown }>): string {
  const root = mkdtempSync(join(tmpdir(), "npx-cache-"));
  for (const e of entries) {
    const pkgDir = join(root, e.hash, "node_modules", "ccusage");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify(e.pkg));
  }
  return root;
}

test("cold/empty cache -> null (falls back to npx)", () => {
  const root = mkdtempSync(join(tmpdir(), "npx-empty-"));
  try {
    assert.equal(resolveCachedCcusageV20(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing cache dir entirely -> null (no throw)", () => {
  assert.equal(resolveCachedCcusageV20(join(tmpdir(), "does-not-exist-" + process.pid)), null);
});

test("only v15 cached -> null (NEVER exec the wrong-contract major)", () => {
  const root = fakeCache([{ hash: "aaa", pkg: { version: "15.10.0", bin: { ccusage: "dist/index.js" } } }]);
  try {
    assert.equal(resolveCachedCcusageV20(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("v20 present -> returns the resolved bin path (string bin)", () => {
  const root = fakeCache([{ hash: "bbb", pkg: { version: "20.0.14", bin: "dist/cli.js" } }]);
  try {
    const p = resolveCachedCcusageV20(root);
    assert.ok(p && p.endsWith(join("bbb", "node_modules", "ccusage", "dist", "cli.js")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("v20 with object bin {ccusage} -> resolves the ccusage entry", () => {
  const root = fakeCache([{ hash: "ccc", pkg: { version: "20.1.2", bin: { ccusage: "bin/run.js" } } }]);
  try {
    const p = resolveCachedCcusageV20(root);
    assert.ok(p && p.endsWith(join("ccc", "node_modules", "ccusage", "bin", "run.js")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mixed v15 + v20 -> picks the v20 (rejects v15)", () => {
  const root = fakeCache([
    { hash: "v15dir", pkg: { version: "15.10.0", bin: "dist/index.js" } },
    { hash: "v20dir", pkg: { version: "20.0.14", bin: "dist/cli.js" } },
  ]);
  try {
    const p = resolveCachedCcusageV20(root);
    assert.ok(p && p.includes("v20dir") && !p.includes("v15dir"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed package.json / missing version / missing bin -> null (never a half-resolved path)", () => {
  for (const pkg of [{}, { version: 20 }, { version: "20.0.0" /* no bin */ }, { version: "20.0.0", bin: 5 }]) {
    const root = fakeCache([{ hash: "x", pkg }]);
    try {
      assert.equal(resolveCachedCcusageV20(root), null, `expected null for ${JSON.stringify(pkg)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
