// /global — the canonical global-board route. Thin wrapper that renders the board page component
// with slug="global" (one source of truth; resolveBoardScope special-cases "global" -> scope "g").
// Rendering directly avoids a redirect hop; the board JSX/data live only in community/[slug]/page.
import BoardPage, { generateMetadata as boardMetadata } from "@/app/community/[slug]/page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export function generateMetadata({ searchParams }: { searchParams: Promise<Search> }) {
  return boardMetadata({ params: Promise.resolve({ slug: "global" }), searchParams });
}

export default function GlobalBoardPage({ searchParams }: { searchParams: Promise<Search> }) {
  return BoardPage({ params: Promise.resolve({ slug: "global" }), searchParams });
}
