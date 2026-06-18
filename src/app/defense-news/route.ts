/* GET /defense-news — serves the static Defense News HTML
   (public/defense-news-design.html) behind the Supabase auth gate.

   Server-side, after auth passes, this route fetches live articles from the
   /api/news-feed proxy and injects them into the HTML at the
   LIVE_ARTICLES_PLACEHOLDER marker. The page JS reads LIVE_ARTICLES and
   falls back to MOCK_ARTICLES when fewer than 4 live articles arrive.       */

import { redirect } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase-server";
import { injectRail } from "@/lib/nav/rail";
import { injectDefenseTabs } from "@/lib/nav/defense-intel";

export const dynamic = "force-dynamic";

interface NewsFeedArticle {
  title?: string;
  description?: string;
  url?: string;
  urlToImage?: string | null;
  source?: { name?: string } | null;
  publishedAt?: string;
  aiInsight?: string;
}

interface PageArticle {
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  sourceName: string;
  publishedAt: string;
  aiInsight: string;
}

const DEFAULT_INSIGHT =
  "Monitor SAM.gov for related solicitation activity affecting NAICS 336413/332710/332721.";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateInsight(
  title: string,
  description: string
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return DEFAULT_INSIGHT;
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [
        {
          role: "user",
          content: `You are a defense contracting intelligence analyst. In one sentence (max 20 words), summarize what this article means specifically for small defense subcontractors in NAICS 336413 (aircraft parts), 332710 (machine shops), or 332721 (precision turned parts).

Article title: ${title}
Article excerpt: ${(description || "").substring(0, 300)}

Respond with only the one-sentence insight. No preamble. No "AI INSIGHT:" prefix.`
        }
      ]
    });
    const block = response.content[0];
    const text = block && block.type === "text" ? block.text.trim() : "";
    return text || DEFAULT_INSIGHT;
  } catch (e) {
    console.error("[defense-news] generateInsight failed:", e);
    return DEFAULT_INSIGHT;
  }
}

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/defense-news");

  const filePath = path.join(
    process.cwd(),
    "public",
    "defense-news.html"
  );
  let html = await readFile(filePath, "utf8");

  // Fetch live articles from the same-origin /api/news-feed proxy.
  // Build base URL from current request headers (works in dev + Vercel).
  let liveArticles: PageArticle[] = [];
  try {
    const h = await headers();
    const host = h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const baseUrl = `${proto}://${host}`;

    const resp = await fetch(`${baseUrl}/api/news-feed`, {
      next: { revalidate: 1800 }
    });
    if (resp.ok) {
      const data = (await resp.json()) as { articles?: NewsFeedArticle[] };
      const raw = Array.isArray(data.articles) ? data.articles : [];
      const filtered = raw
        .filter(
          (a) =>
            !!a.urlToImage &&
            !!a.title &&
            a.title !== "[Removed]" &&
            !!a.url
        )
        .slice(0, 9);

      // Generate per-article AI insights in parallel via Claude Haiku 4.5.
      liveArticles = await Promise.all(
        filtered.map(
          async (a): Promise<PageArticle> => ({
            title: a.title || "",
            description: a.description || "",
            url: a.url || "#",
            urlToImage: a.urlToImage || "",
            sourceName: a.source?.name || "Defense News",
            publishedAt: a.publishedAt || "",
            aiInsight: await generateInsight(a.title || "", a.description || "")
          })
        )
      );
    }
  } catch (e) {
    console.error("[defense-news] news-feed fetch failed:", e);
  }

  html = html.replace(
    "const LIVE_ARTICLES = /*LIVE_ARTICLES_PLACEHOLDER*/[];",
    `const LIVE_ARTICLES = ${JSON.stringify(liveArticles)};`
  );

  // Phase 5 — swap the page's stale copy-pasted rail for the single shared rail.
  // (Defense News lives under the new "Defense Intel" group, so it highlights
  // that item.) Proof page for Design's 1:1 before propagating to all routes.
  html = injectRail(html, "defense-intel");
  html = injectDefenseTabs(html, "news"); // Phase 5 item 2 — News/Spending tab strip

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
}
  });
}
