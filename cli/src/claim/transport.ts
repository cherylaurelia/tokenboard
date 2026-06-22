// start/poll fetch calls. Global fetch + AbortSignal.timeout (Node >=18). Parses responses
// against @tokenboard/contracts (single source of truth shared with the server).
import {
  cliLoginStartResponseSchema,
  cliLoginPollResponseSchema,
  type CliLoginStartResponse,
  type CliLoginPollResponse,
} from "@tokenboard/contracts";

const REQUEST_TIMEOUT_MS = 15_000;

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`); // fail loud at the boundary
  return res.json();
}

export async function startDeviceGrant(
  base: string,
  clientName: string,
  machineHash: string,
): Promise<CliLoginStartResponse> {
  const raw = await postJson(`${base}/api/v1/cli/login/start`, {
    client_name: clientName,
    machine_hash: machineHash,
  });
  return cliLoginStartResponseSchema.parse(raw);
}

export async function pollDeviceGrant(base: string, deviceCode: string): Promise<CliLoginPollResponse> {
  const raw = await postJson(`${base}/api/v1/cli/login/poll`, { device_code: deviceCode });
  return cliLoginPollResponseSchema.parse(raw);
}
