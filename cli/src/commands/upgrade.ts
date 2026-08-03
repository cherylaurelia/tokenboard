import { runCommand } from "../service/exec.js";
import { currentVersion } from "../version.js";
import { selectBackend, serviceSupported } from "../service/backend.js";
import { buildServiceSpec } from "../service/spec.js";

const out = (line: string) => process.stdout.write(`${line}\n`);
const PACKAGE = "@tokenboard/cli";

async function fetchLatestVersion(): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${PACKAGE}/latest`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`couldn't reach the npm registry (HTTP ${res.status}). Try again later.`);
  const body = (await res.json()) as { version?: unknown };
  if (typeof body.version !== "string") throw new Error("npm registry returned no version for @tokenboard/cli.");
  return body.version;
}

async function refreshServiceIfInstalled(): Promise<void> {
  if (!serviceSupported()) return;
  const backend = selectBackend();
  const spec = buildServiceSpec();
  const status = await backend.status(spec);
  if (!status.installed) return;
  await backend.install(spec);
  out(`  Refreshed the background sync service (${backend.name}).`);
}

export async function runUpgrade(): Promise<void> {
  const current = currentVersion();
  const latest = await fetchLatestVersion();

  if (current === latest) {
    out(`  tokenboard upgrade — already up to date (${current}).`);
    return;
  }

  out(`  tokenboard upgrade — updating ${current} → ${latest}…`);
  const install = await runCommand("npm", ["install", "-g", `${PACKAGE}@${latest}`]);
  if (install.code !== 0) {
    throw new Error(`npm install -g ${PACKAGE}@${latest} failed: ${install.stderr.trim() || install.stdout.trim() || `exit ${install.code}`}`);
  }
  out(`  Updated to ${latest}.`);
  await refreshServiceIfInstalled();
}
