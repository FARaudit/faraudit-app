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

import { samFetchWithKey } from "./sam-url-guard";

const SAM_API_KEY = process.env.SAM_API_KEY;
const FETCH_TIMEOUT_MS = 15000;
// L1 (Brain card 264 Ruling 1) — the OLD 4000-char cap silently truncated the notice
// body, which for combined-synopsis buys carries the §L/§M/clauses/set-aside the engine
// must read (the notice-body-blind false-COMPLETE root). Raised to a generous ceiling that
// preserves ALL real notice content while still bounding a pathological megabyte body from
// bloating the classifier / facts digest that also consume this field. The engine's own
// fullSource is separately budgeted (MAX_FULLSOURCE_CHARS in agentic-executor.ts).
const DEFAULT_MAX_DESCRIPTION_CHARS = 100_000;
// Guard the override: only a finite POSITIVE number is honored — a 0 / NaN / negative env value
// falls back to the default (never slice(0, -n), which would truncate from the END of the body).
const envMaxChars = Number(process.env.SAM_DESCRIPTION_MAX_CHARS);
const MAX_DESCRIPTION_CHARS = Number.isFinite(envMaxChars) && envMaxChars > 0 ? envMaxChars : DEFAULT_MAX_DESCRIPTION_CHARS;

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

// The named entities SAM actually emits. Anything not listed is left ALONE
// rather than guessed at: an unrecognised entity printed verbatim is obviously
// wrong and gets reported, where a wrong substitution reads as real text.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ndash: "–", mdash: "—", minus: "−",
  lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", bdquo: "„",
  hellip: "…", bull: "•", middot: "·",
  deg: "°", plusmn: "±", times: "×", divide: "÷",
  frac12: "½", frac14: "¼", frac34: "¾",
  copy: "©", reg: "®", trade: "™",
  sect: "§", para: "¶", dagger: "†",
  laquo: "«", raquo: "»", euro: "€", pound: "£", cent: "¢",
  larr: "←", rarr: "→", harr: "↔", ne: "≠", le: "≤", ge: "≥"
};

/**
 * Decode HTML entities in ONE pass.
 *
 * Chained .replace() calls cannot do this correctly: decoding `&amp;` before
 * `&lt;` turns the escaped literal `&amp;lt;` into a real `<`, so text the
 * government deliberately escaped comes out as markup. Matching every entity in
 * a single sweep makes that impossible — nothing a replacement produces is ever
 * looked at again.
 */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      // Surrogates and out-of-range values would throw or produce mojibake;
      // leaving the entity visible is the honest failure.
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return whole;
      try {
        return String.fromCodePoint(cp);
      } catch {
        return whole;
      }
    }
    const hit = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()];
    return hit === undefined ? whole : hit;
  });
}

// HTML → clean text: tags out, entities decoded, whitespace collapsed.
export function stripHtmlToText(html: string): string {
  const withoutTags = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
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
    // SSRF + key-leak guard (shared with the audit pipeline's document fetches): host-allowlist
    // the URL, append the key only on the first sam.gov hop, and follow any redirect MANUALLY so
    // the api_key is never replayed to an S3 presigned target. Accept header rides the first hop.
    const res = await samFetchWithKey(
      `https://sam.gov/api/prod/opps/v2/opportunities/${id}`,
      SAM_API_KEY,
      FETCH_TIMEOUT_MS,
      { accept: "application/hal+json" }
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
