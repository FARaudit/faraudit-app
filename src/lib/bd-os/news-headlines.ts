/* THE NEWEST DEFENCE HEADLINE — FOR THE DASHBOARD, AND FREE.
 *
 * The Signals grid on Today needs one headline to point at the Defense news desk.
 * It must cost nothing: Today reloads on every tab switch, and /api/defense-news
 * runs a Sonnet judge over every story on every request — a price worth paying for a
 * page you deliberately open, and not one to charge for a dashboard opening itself.
 *
 * So this reads the SAME wires the desk reads and stops before the judge. What it
 * cannot do is rank: relevance to this customer's codes is exactly what the judge is
 * for, and lexical matching was measured at zero on this corpus. The caller therefore
 * claims recency and never relevance.
 *
 * The feed list lives in news-feeds.ts so the card and the desk cannot drift onto
 * different wires — a card previewing a story its own desk does not carry is a
 * promise broken one click later.
 */
import { NEWS_FEEDS } from "./news-feeds";
import { decodeEntities } from "@/lib/feed-entities";

export interface Headline {
  title: string;
  publishedAt: string;
  source: string;
}

/** <title> and <pubDate> from the first N items of an RSS/Atom body. */
function parseFeed(xml: string, source: string, cap: number): Headline[] {
  const out: Headline[] = [];
  const items = xml.split(/<item[\s>]|<entry[\s>]/i).slice(1, cap + 1);
  for (const chunk of items) {
    const t = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const d =
      chunk.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      chunk.match(/<published[^>]*>([\s\S]*?)<\/published>/i) ||
      chunk.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);
    if (!t || !d) continue;
    const title = decodeEntities(
      t[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/i, "$1").replace(/<[^>]+>/g, "").trim()
    );
    const when = d[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/i, "$1").trim();
    // A headline with no readable date cannot answer "newest", which is the only
    // claim this row makes — so it is dropped rather than dated by assumption.
    if (!title || !Number.isFinite(Date.parse(when))) continue;
    out.push({ title, publishedAt: new Date(when).toISOString(), source });
  }
  return out;
}

/**
 * Headlines from the shared wires, newest first.
 *
 * Returns null ONLY when every feed failed — the caller renders "did not answer".
 * A partial read returns what answered: some wires being slow is not an outage, and
 * an empty array from a working fetch is a real "nothing published", which is a
 * different fact the caller also distinguishes.
 */
export async function fetchNewsHeadlines(
  opts: { perFeed?: number; timeoutMs?: number } = {}
): Promise<Headline[] | null> {
  const perFeed = opts.perFeed ?? 3;
  const timeoutMs = opts.timeoutMs ?? 4000;

  const reads = await Promise.all(
    NEWS_FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          // 15 minutes, matching the desk's own cache. A dashboard that reloads on
          // every tab switch must not re-fetch eight wires each time.
          next: { revalidate: 900 },
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            accept: "application/rss+xml,application/atom+xml,application/xml,text/xml",
            "user-agent": "FARaudit/1.0 (+https://faraudit.com)"
          }
        });
        if (!res.ok) return null;
        return parseFeed(await res.text(), f.source, perFeed);
      } catch {
        return null;
      }
    })
  );

  if (reads.every((r) => r === null)) return null;
  const all = reads.filter((r): r is Headline[] => r !== null).flat();
  all.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return all;
}
