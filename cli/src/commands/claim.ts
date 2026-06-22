// `tokenboard claim` — RFC 8628 device-authorization flow (client half). Start -> open the
// browser best-effort + ALWAYS print url+code -> poll-once-immediately then honor
// interval/slow_down/deadline -> on complete write auth.json (0600). Fail-loud (throws) so
// runMain exits non-zero. NEVER logs the device_code or the ingest token (secrets); only
// user_code + verification_url + handle + the saved path.
import { resolveApiBase } from "../claim/api-base.js";
import { startDeviceGrant, pollDeviceGrant } from "../claim/transport.js";
import { openInBrowser } from "../claim/browser.js";
import { machineHash, clientLabel } from "../claim/machine.js";
import { writeAuthFile } from "../config/auth-store.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const out = (line: string) => process.stdout.write(`${line}\n`);

export async function runClaim(): Promise<void> {
  const base = resolveApiBase();
  const grant = await startDeviceGrant(base, clientLabel(), machineHash());

  // Best-effort auto-open (interactive only) + ALWAYS print the fallback (SSH/headless/CI).
  if (process.stdout.isTTY) openInBrowser(grant.verification_url);
  out("");
  out("  Open this URL to approve this machine:");
  out(`    ${grant.verification_url}`);
  out(`  Code: ${grant.user_code}`);
  out("  Waiting for approval...");
  out("");

  // Poll loop bounded by a client-side deadline (= expires_in) so the CLI stops even if the
  // server never returns 'expired'. Poll ONCE immediately (no dead ~5s on instant approval),
  // then sleep between subsequent polls. slow_down adds +5s and keeps it bumped.
  const deadline = Date.now() + grant.expires_in * 1000;
  let intervalMs = grant.interval * 1000;
  let first = true;

  while (Date.now() < deadline) {
    if (!first) await sleep(intervalMs);
    first = false;

    const result = await pollDeviceGrant(base, grant.device_code);

    if (result.status === "complete") {
      const path = await writeAuthFile({
        token: result.ingest_token,
        userId: result.userId,
        handle: result.user.handle,
        createdAt: new Date().toISOString(),
      });
      out(`  Claimed as @${result.user.handle}. Saved credentials to ${path}`);
      return;
    }
    if (result.status === "denied") {
      throw new Error("Approval was denied in the browser.");
    }
    if (result.status === "expired") {
      throw new Error("This claim request expired. Run `tokenboard claim` again.");
    }
    if (result.status === "slow_down") {
      intervalMs += 5000;
      await sleep(intervalMs); // back off before the next poll
      continue;
    }
    // "pending" / any unknown -> keep polling (bounded by deadline).
  }
  throw new Error("This claim request expired. Run `tokenboard claim` again.");
}
