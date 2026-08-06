// A notice's attachments, from the source SAM.gov's own UI reads.
//
// WHY THIS REPLACED THE PER-FILE REDIRECT READS.
//
// The first version resolved each filename from the `content-disposition` header
// on that file's download redirect — one request per attachment. It worked, and
// the names were right (measured: 19/19 byte-identical to SAM's own list). But it
// was built on a wrong claim of mine: that no resources endpoint existed. That
// came from a 406, which was CONTENT NEGOTIATION, not absence — the same trap
// sam-description.ts documents in a comment. With `Accept: application/hal+json`
// it returns 200.
//
// Correcting that fixed a defect the old approach could not even see. The feed's
// `resourceLinks` is NOT always complete: notice 98d55b83… carries 4 links while
// SAM lists 5 attachments, so `Dunnage Kit for POL Airlift.pdf` never reached the
// panel. A customer deciding whether to bid was silently missing a document the
// government posted. Reading names off links we already had could never surface a
// link we never had — so the panel now renders SAM's list, not the feed's.
//
// It is also cheaper: ONE call per notice instead of N, and it carries size,
// mimeType, posted date, order and the access-control flags.
//
// No api_key. Measured: the endpoint answers 200 with and without one, and the
// download redirects do too — so this path consumes no SAM quota and carries no
// credential it does not need.
//
// Failure contract (Rule 64): a read that does not complete returns `null`, never
// `[]`. "SAM published no attachments" and "we could not reach SAM" are different
// facts, and the panel must not render them alike — on a nulled read it keeps the
// links the feed gave it rather than claiming the notice has none.

const FETCH_TIMEOUT_MS = 15000;
const NOTICE_ID_RE = /^[a-f0-9]{32}$/i;
export const SAM_FILE_ID_RE = /^[a-f0-9]{32}$/i;

// A sanity bound on rendering, not a budget: one call returns every attachment
// whatever the count, so there is no per-file cost to cap. It exists only so a
// pathological response cannot build an unbounded DOM.
export const MAX_ATTACHMENTS = 200;

/** The one URL shape we ever build for a file. */
export function downloadUrlForFileId(fileId: string): string {
  return `https://sam.gov/api/prod/opps/v3/opportunities/resources/files/${fileId}/download`;
}

export interface SamAttachment {
  /** SAM's resourceId — the 32-hex segment in the download URL. */
  id: string;
  /** The name SAM publishes. Null when SAM listed the file without one. */
  name: string | null;
  url: string;
  size: number | null;
  mimeType: string | null;
  postedDate: string | null;
  /** SAM's own display order. */
  order: number | null;
  /** Export-controlled or explicit-access: the customer must request it. */
  restricted: boolean;
}

export interface NoticeAttachments {
  /** Null means the read failed — NOT "this notice has none". */
  attachments: SamAttachment[] | null;
  reason?: string;
}

// The attachment SET changes when a notice is amended, so this is a short TTL
// rather than the indefinite per-file cache the old version used. Names are
// immutable; the list is not, and caching the list forever would hide an
// amendment's new documents for the life of the process.
const TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const CACHE = new Map<string, { at: number; value: SamAttachment[] }>();

function cacheGet(noticeId: string): SamAttachment[] | null {
  const hit = CACHE.get(noticeId);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { CACHE.delete(noticeId); return null; }
  return hit.value;
}

function cacheSet(noticeId: string, value: SamAttachment[]): void {
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next();
    if (!oldest.done) CACHE.delete(oldest.value);
  }
  CACHE.set(noticeId, { at: Date.now(), value });
}

/** Test seam: lets a gate prove the cache actually prevents a second fetch. */
export function __resetAttachmentCache(): void {
  CACHE.clear();
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Deliberately fails OPEN: a file is dropped only when SAM says so explicitly.
// An unrecognised or missing flag keeps the attachment, because the cost of
// hiding a real document is far higher than showing a stale one.
function isDropped(a: Record<string, unknown>): boolean {
  return String(a.deletedFlag ?? "") === "1" || String(a.fileExists ?? "1") === "0";
}

export function parseAttachments(body: unknown): SamAttachment[] {
  const groups = (body as any)?._embedded?.opportunityAttachmentList;
  if (!Array.isArray(groups)) return [];
  const raw: Record<string, unknown>[] = groups.flatMap((g: any) =>
    Array.isArray(g?.attachments) ? g.attachments : []
  );
  const out: SamAttachment[] = [];
  for (const a of raw) {
    const id = str(a.resourceId);
    // Without a resourceId there is no URL to link to, so the row would be text
    // pretending to be a document.
    if (!id || !SAM_FILE_ID_RE.test(id)) continue;
    if (isDropped(a)) continue;
    out.push({
      id,
      name: str(a.name),
      url: downloadUrlForFileId(id),
      size: num(a.size),
      mimeType: str(a.mimeType),
      postedDate: str(a.postedDate),
      order: num(a.attachmentOrder),
      restricted: String(a.exportControlled ?? "") === "1" || String(a.explicitAccess ?? "") === "1"
    });
  }
  // SAM's own display order, with a stable fallback so an absent order does not
  // reshuffle the list between reads.
  out.sort((x, y) => (x.order ?? 1e9) - (y.order ?? 1e9));
  return out.slice(0, MAX_ATTACHMENTS);
}

export async function fetchNoticeAttachments(noticeId: string): Promise<NoticeAttachments> {
  if (!NOTICE_ID_RE.test(noticeId)) return { attachments: null, reason: "bad-notice-id" };

  const cached = cacheGet(noticeId);
  if (cached) return { attachments: cached };

  try {
    // hal+json is required. `application/json` answers 406 on this host — the
    // reason this endpoint was once reported as not existing at all.
    const res = await fetch(
      `https://sam.gov/api/prod/opps/v3/opportunities/${noticeId}/resources`,
      { headers: { Accept: "application/hal+json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return { attachments: null, reason: `http-${res.status}` };
    const parsed = parseAttachments(await res.json());
    // An empty list here is a real answer — SAM returned 200 and listed none —
    // so it is cached and returned as [], distinct from the null above.
    cacheSet(noticeId, parsed);
    return { attachments: parsed };
  } catch (err) {
    return {
      attachments: null,
      reason: err instanceof Error ? err.message.slice(0, 120) : "error"
    };
  }
}
