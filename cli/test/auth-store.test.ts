import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir, platform, homedir } from "node:os";
import { join } from "node:path";
import { mkdtemp, stat, readFile, rm } from "node:fs/promises";
import { resolveConfigDir, resolveAuthPath, writeAuthFile, readAuthFile } from "../src/config/auth-store.js";

test("resolveConfigDir honors absolute XDG_CONFIG_HOME (POSIX)", { skip: platform() === "win32" }, () => {
  const dir = resolveConfigDir({ XDG_CONFIG_HOME: "/custom/xdg" } as NodeJS.ProcessEnv);
  assert.equal(dir, "/custom/xdg/tokenboard");
});

test("resolveConfigDir ignores a RELATIVE XDG_CONFIG_HOME, falls back to ~/.config", { skip: platform() === "win32" }, () => {
  // A relative XDG_CONFIG_HOME is invalid per the spec, so it's ignored and we fall back to
  // the real home dir (os.homedir(), not a passed-in HOME) + /.config/tokenboard.
  const dir = resolveConfigDir({ XDG_CONFIG_HOME: "relative/path" } as NodeJS.ProcessEnv);
  assert.equal(dir, join(homedir(), ".config", "tokenboard"));
});

test("resolveAuthPath ends with tokenboard/auth.json", () => {
  assert.ok(resolveAuthPath().endsWith(join("tokenboard", "auth.json")));
});

test("writeAuthFile writes 0600 and round-trips via readAuthFile", { skip: platform() === "win32" }, async () => {
  const base = await mkdtemp(join(tmpdir(), "tb-authstore-"));
  try {
    const env = { XDG_CONFIG_HOME: base } as NodeJS.ProcessEnv;
    const auth = { token: "tbd_test", userId: "u-1", handle: "devon", createdAt: "2026-06-22T00:00:00.000Z" };
    const path = await writeAuthFile(auth, env);

    // mode is exactly 0600 (no group/other bits) — secret file, not world-readable.
    const st = await stat(path);
    assert.equal(st.mode & 0o777, 0o600);

    // exact JSON contents round-trip.
    const onDisk = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(onDisk, auth);
    assert.deepEqual(await readAuthFile(env), auth);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("readAuthFile returns null when absent (ENOENT), not a throw", async () => {
  const base = await mkdtemp(join(tmpdir(), "tb-authstore-empty-"));
  try {
    assert.equal(await readAuthFile({ XDG_CONFIG_HOME: base } as NodeJS.ProcessEnv), null);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
