import { readAuthFile } from "../config/auth-store.js";

const out = (line: string) => process.stdout.write(`${line}\n`);

export async function runWhoami(): Promise<void> {
  const auth = await readAuthFile();
  if (!auth) throw new Error("not signed in — run `tokenboard claim` first.");
  out(`  tokenboard whoami — @${auth.handle}`);
  out(`  user id:  ${auth.userId}`);
  out(`  claimed:  ${auth.createdAt}`);
}
