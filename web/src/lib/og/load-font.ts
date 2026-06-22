// Load raw TTF buffers for next/og's fonts:[]. Satori needs TrueType/OpenType — it CANNOT parse
// woff2, and Google's css2 &text= endpoint now serves woff2 to every UA, so the old legacy-UA trick
// is dead. Instead we fetch the actual .ttf from the OFL-licensed google/fonts repo by path. Both
// fonts are small (pixel + mono), so no subsetting is needed. Module-cached by URL.
import "server-only";

// The two brand faces the OG card uses, by their google/fonts repo path.
export const FONT_URLS = {
  pressStart2P:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/PressStart2P-Regular.ttf",
  spaceMonoBold:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/SpaceMono-Bold.ttf",
} as const;

const cache = new Map<string, ArrayBuffer>();

export async function loadTtf(url: string): Promise<ArrayBuffer> {
  const cached = cache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`load-font: ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  cache.set(url, buf);
  return buf;
}
