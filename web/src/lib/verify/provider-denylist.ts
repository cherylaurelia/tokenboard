// §5.3 single entry point: a domain is blocked if it is a free provider OR a known disposable.
// Enforced BEFORE send AND BEFORE board creation (start route order), so personal/disposable
// addresses can neither trigger a send nor form a company board.
import { isFreeProvider } from "./free-providers";
import { DISPOSABLE_DOMAINS } from "./disposable-domains.generated";

export type BlockReason = "free" | "disposable";

export function blockedProvider(domain: string): BlockReason | null {
  const d = domain.trim().toLowerCase();
  if (isFreeProvider(d)) return "free";
  if (DISPOSABLE_DOMAINS.has(d)) return "disposable";
  return null;
}

export function isBlockedProvider(domain: string): boolean {
  return blockedProvider(domain) !== null;
}
