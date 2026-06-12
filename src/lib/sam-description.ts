// FA-148 — resolve the REAL SAM notice description at audit time.
//
// SAM's v2 search returns `description` as a ~94-char noticedesc URL
// (https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=…), not the
// text — so the engine, and especially the metadata-only arm, never saw the
// notice text the government actually published. FA460026Q0047 proved that
// text is substantive: the full scope language ("Replace (13) windows with
// bullet resistant level UL752 level 8 …") lives there.
//
// Endpoint: the proven hal+json detail arm from FA-153's version-history work
// — GET sam.gov/api/prod/opps/v2/opportunities/{noticeId} with
// Accept: application/hal+json (plain application/json returns 406; the
// api.sam.gov host on the noticedesc URL itself 404s — same host convention
// as src/lib/sam.ts). The body lives at description[0].body as HTML.
//
// Failure contract (Rule 64): any fetch/parse failure returns the original
// URL-description untouched with fetched=false + reason — the run proceeds
// exactly as it did pre-FA-148, loudly noted in the row. Never blocks a run,
// never fabricates.

const SAM_API_KEY = process.env.SAM_API_KEY;
const FETCH_TIMEOUT_MS = 15000;
// 4000-char cap matches mapOpportunity's description convention in sam.ts.
const MAX_DESCRIPTION_CHARS = 4000;

const NOTICEDESC_URL_RE = /^https?:\/\/(?:api\.)?sam\.gov\/(?:prod\/)?opportunities\/v\d+\/noticedesc\?noticeid=([a-f0-9]{32})/i;

export interface ResolvedDescription {
  /** Clean text when fetched; the ORIGINAL url-description when not. */
  text: string;
  /** 'sam_description' = fetched notice text · 'noticedesc_url_unfetched' = fetch failed, field still the URL. */
  provenance: "sam_description" | "noticedesc_url_unfetched";
  fetched: boolean;
  chars: number;
  reason?: string;
}

export function isNoticedescUrl(description: string | null | undefined): boolean {
  return typeof description === "string" && NOTICEDESC_URL_RE.test(description.trim());
}

// HTML → clean text: tags out, common entities decoded, whitespace collapsed.
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveSamDescription(
  noticeId: string | null | undefined,
  description: string | null | undefined
): Promise<ResolvedDescription> {
  const original = typeof description === "string" ? description : "";
  const unfetched = (reason: string): ResolvedDescription => ({
    text: original,
    provenance: "noticedesc_url_unfetched",
    fetched: false,
    chars: original.length,
    reason
  });

  if (!SAM_API_KEY) return unfetched("SAM_API_KEY not set");
  // Prefer the URL's own embedded notice id (authoritative for the field);
  // fall back to the caller's noticeId.
  const fromUrl = original.match(NOTICEDESC_URL_RE)?.[1];
  const id = fromUrl || (typeof noticeId === "string" && /^[a-f0-9]{32}$/i.test(noticeId) ? noticeId : null);
  if (!id) return unfetched("no resolvable notice id (description is not a noticedesc URL and noticeId is not a SAM UUID)");

  try {
    const res = await fetch(
      `https://sam.gov/api/prod/opps/v2/opportunities/${id}?api_key=${SAM_API_KEY}`,
      { headers: { accept: "application/hal+json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return unfetched(`detail fetch HTTP ${res.status}`);
    const j = (await res.json()) as { description?: Array<{ body?: string }> };
    const body = j?.description?.[0]?.body;
    if (typeof body !== "string" || body.trim().length === 0) return unfetched("detail response has no description body");
    const text = stripHtmlToText(body).slice(0, MAX_DESCRIPTION_CHARS);
    if (text.length === 0) return unfetched("description body stripped to empty");
    return { text, provenance: "sam_description", fetched: true, chars: text.length };
  } catch (err) {
    return unfetched(err instanceof Error ? err.message.slice(0, 160) : "unknown fetch error");
  }
}
