// next/og share card. runtime=nodejs (edge can't run the Drizzle/Redis assembler). RETRACTION-SAFE:
// only a PUBLIC, non-company board's name + window + rank-1 leader is baked into the immutable PNG.
// Company / private / unlisted boards get a generic branded fallback (short cache), so per-member or
// unlisted identities are NEVER permanently CDN-cached. The fallback also covers 404 + render errors,
// so an og:image URL never returns a plain-text 500 or a card mislabeled "GLOBAL".
//
// This is the ONE sanctioned exception to the tokens-only / no-inline-styles rule: Satori requires
// inline styles + raw hex (palette.ts) + raw font buffers, and cannot read globals.css CSS vars.
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { boardQuerySchema } from "@tokenboard/contracts";
import { resolveBoardScope } from "@/lib/leaderboard/resolve-scope";
import { assembleBoard } from "@/lib/leaderboard/assemble-board";
import { loadTtf, FONT_URLS } from "@/lib/og/load-font";
import { palette } from "@/lib/og/palette";
import { ogContentHash, type OgHeadline } from "@/lib/og/og-hash";
import { WEB_DEFAULT_METRIC } from "@/lib/board/web-defaults";
import { formatUsd2dp, humanizeTokens } from "@/lib/format/money";

export const runtime = "nodejs";

const SIZE = { width: 1200, height: 630 } as const;

async function brandFonts() {
  const [pressStart, spaceMono] = await Promise.all([
    loadTtf(FONT_URLS.pressStart2P),
    loadTtf(FONT_URLS.spaceMonoBold),
  ]);
  return [
    { name: "Press Start 2P", data: pressStart, weight: 400 as const, style: "normal" as const },
    { name: "Space Mono", data: spaceMono, weight: 700 as const, style: "normal" as const },
  ];
}

function frame(children: React.ReactNode) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: palette.bg,
        color: palette.ink,
        padding: "64px 72px",
        fontFamily: "Space Mono",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontFamily: "Press Start 2P", fontSize: 28 }}>
        <span style={{ color: palette.coral, marginRight: 12 }}>{">_"}</span>TOKENBOARD
      </div>
      {children}
      <div style={{ display: "flex", marginTop: "auto", color: palette.ink3, fontSize: 22, letterSpacing: 2 }}>
        tokenboard.sh
      </div>
    </div>
  );
}

async function fallback(reason: string) {
  // Font loading can fail (Google fetch hiccup); the fallback must NEVER throw — so render without
  // custom fonts if needed. Satori falls back to a built-in font, which is fine for the brand card.
  let fonts: Awaited<ReturnType<typeof brandFonts>> | undefined;
  try {
    fonts = await brandFonts();
  } catch {
    fonts = undefined;
  }
  return new ImageResponse(
    frame(
      <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 64, fontWeight: 700 }}>
        tokenboard.sh
      </div>,
    ),
    {
      ...SIZE,
      ...(fonts ? { fonts } : {}),
      headers: { "Cache-Control": "public, max-age=300", "x-og-fallback": reason },
    },
  );
}

function splitDash(name: string): React.ReactNode {
  const upper = name.toUpperCase();
  const i = upper.indexOf("-");
  if (i < 0) return upper;
  return [upper.slice(0, i), <span key="d" style={{ color: palette.coral }}>-</span>, upper.slice(i + 1)];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const sp = req.nextUrl.searchParams;
    const query = boardQuerySchema.parse({
      community: slug,
      window: sp.get("window") ?? "7d",
      metric: sp.get("metric") ?? WEB_DEFAULT_METRIC,
      limit: 1,
    });

    // Crawlers have no cookies -> callerUserId:null. A private board resolves to 403/404 -> fallback
    // (don't cache an error or mislabel it). resolveBoardScope special-cases "global" -> public g.
    const resolved = await resolveBoardScope(slug, null);
    if (!resolved.ok) return fallback("private_or_missing");

    // RETRACTION-SAFE: company OR non-public boards never bake per-member identity into an immutable PNG.
    const isCompany = resolved.community?.type === "company";
    const isPublic = !resolved.community || resolved.community.visibility === "public";
    if (isCompany || !isPublic) return fallback("non_public");

    const board = await assembleBoard({
      query,
      scope: resolved.scope,
      community: resolved.community,
      meUserId: null,
      callerUserId: null,
    });

    const name = board.community?.name ?? "Global";
    const top1 = board.entries[0] ?? null;
    const windowLabel = query.window === "7d" ? "7 DAYS" : query.window === "30d" ? "30 DAYS" : "ALL-TIME";
    const value = top1
      ? query.metric === "cost"
        ? formatUsd2dp(top1.cost)
        : `${humanizeTokens(top1.tokens).value}${humanizeTokens(top1.tokens).unit}`
      : null;

    const headline: OgHeadline = {
      name,
      window: query.window,
      metric: query.metric,
      leaderHandle: top1?.handle ?? null,
      leaderValue: value,
    };
    const v = ogContentHash(slug, headline);

    return new ImageResponse(
      frame(
        // Single column container (Satori does not lay out a React fragment as a flex child reliably,
        // so we wrap the body in an explicit column div with flex:1).
        <div style={{ display: "flex", flexDirection: "column", flex: 1, width: "100%" }}>
          <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 84, fontWeight: 700 }}>
            {splitDash(name)}
          </div>
          {top1 && (
            <div
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                fontSize: 34,
                marginBottom: 18,
              }}
            >
              <span style={{ color: palette.coralHi, marginRight: 16 }}>#1</span>
              <span style={{ display: "flex", flex: 1 }}>@{top1.handle}</span>
              <span style={{ color: palette.coralHi }}>{value}</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "flex-end",
              color: palette.ink3,
              fontSize: 22,
              letterSpacing: 2,
            }}
          >
            {windowLabel} · {board.totalEntries} RACING
          </div>
        </div>,
      ),
      {
        ...SIZE,
        fonts: await brandFonts(),
        headers: { "Cache-Control": "public, immutable, max-age=31536000", "x-og-version": v },
      },
    );
  } catch {
    return fallback("error");
  }
}
