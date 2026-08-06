// Real filenames for a notice's attachments.
//
// The DETAILS panel on Opportunities listed attachments as "Document 1, 2, 3"
// because `resourceLinks` are opaque download URLs with no name in the path:
//   https://sam.gov/api/prod/opps/v3/opportunities/resources/files/<32hex>/download
//
// Measured 2026-08-06 against the live feed, because none of this was knowable
// from the URL alone:
//   - HEAD on that URL returns 403. The name is NOT available cheaply that way.
//   - There is no resources-by-noticeId endpoint: the four plausible paths
//     answered 404/404/406/406.
//   - GET returns 303 to a presigned S3 URL, and sam.gov's own 303 already
//     carries `content-disposition` — properly quoted, real spaces. So the name
//     is readable on the FIRST hop.
//   - 1853/1853 links across 384 notices / 5 NAICS matched the canonical shape.
//   - 35/35 attachments sampled yielded a name.
//
// Two consequences shape this module:
//
// WE STOP AT THE REDIRECT. Reading the 303's header means S3 is never contacted,
// no body is transferred, and the api_key never leaves sam.gov. Following the
// redirect would move ~11 MB for one 23-attachment notice to learn nothing more.
// This is why it does not reuse samFetchWithKey(), which exists to follow the
// redirect through to the payload — here, arriving at the payload is the bug.
//
// THE BROWSER CANNOT DO THIS. S3 sends no Access-Control-Expose-Headers, and the
// sam.gov hop needs the server-side key regardless, so a client-side fetch could
// never read the header. Hence a route, not a change in dso-app.js alone.
//
// Failure contract (Rule 64): a name that could not be read comes back `null`
// with a reason, never "" and never a guess. The panel keeps "Document N" for
// exactly those, so "SAM named this file" and "we could not read the name" stay
// distinguishable on screen.

import { assertAllowedSamUrl } from "./sam-url-guard";

const FETCH_TIMEOUT_MS = 12000;
// One notice really can carry this many: the 23-attachment N0042126R1024 in the
// probe is a live example, so the cap is not theoretical headroom.
export const MAX_ATTACHMENT_IDS = 40;
// Resolved in parallel, but bounded — 40 simultaneous sockets to sam.gov for one
// card open is not a neighbourly read.
const CONCURRENCY = 8;

export const SAM_FILE_ID_RE = /^[a-f0-9]{32}$/i;

/** The one URL shape this module will ever fetch, rebuilt from a bare id. */
export function downloadUrlForFileId(fileId: string): string {
  return `https://sam.gov/api/prod/opps/v3/opportunities/resources/files/${fileId}/download`;
}

/**
 * Pull a filename out of a Content-Disposition value.
 * Handles the RFC-5987 `filename*=UTF-8''…` form, the quoted form sam.gov sends
 * on its 303, and the `+`-for-space form that appears in the S3 query param.
 */
export function filenameFromContentDisposition(cd: string | null | undefined): string | null {
  if (typeof cd !== "string" || !cd) return null;

  const star = cd.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i);
  if (star) {
    try {
      const v = decodeURIComponent(star[1].trim()).trim();
      if (v) return v;
    } catch {
      /* fall through to the plain form */
    }
  }

  const plain = cd.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
  if (!plain) return null;
  let raw = (plain[1] ?? plain[2] ?? "").trim();
  // `filename=""` misses the quoted branch (it needs one or more chars) and the
  // unquoted branch then captures the two quote characters themselves — which
  // would render a file literally named `""`. Strip a surviving quote pair and
  // let the emptiness check below turn it into the honest null.
  if (!plain[1] && raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    raw = raw.slice(1, -1).trim();
  }
  if (!raw) return null;

  // Only the unquoted form uses + for space; a quoted name may legitimately
  // contain a +, and rewriting it would rename the file on screen.
  const spaced = plain[1] ? raw : raw.replace(/\+/g, " ");
  let out = spaced;
  try {
    out = decodeURIComponent(spaced);
  } catch {
    /* keep the undecoded form rather than dropping the name */
  }

  // A path separator in a name from an upstream response is not something to
  // render; keep the leaf only.
  const leaf = out.split(/[/\\]/).pop();
  return leaf && leaf.trim() ? leaf.trim() : null;
}

export interface AttachmentName {
  id: string;
  /** The name SAM published, or null when it could not be read. Never "". */
  name: string | null;
  /** Present only when name is null. */
  reason?: string;
}

async function resolveOne(fileId: string, apiKey: string): Promise<AttachmentName> {
  const miss = (reason: string): AttachmentName => ({ id: fileId, name: null, reason });
  if (!SAM_FILE_ID_RE.test(fileId)) return miss("bad-file-id");

  try {
    // Built here from a validated id — no caller-supplied URL ever reaches
    // fetch(). assertAllowedSamUrl is belt-and-braces on that.
    const url = assertAllowedSamUrl(downloadUrlForFileId(fileId), "initial");
    url.searchParams.set("api_key", apiKey);

    const res = await fetch(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    // Header first: sam.gov puts it on the 303 itself.
    let name = filenameFromContentDisposition(res.headers.get("content-disposition"));

    // Fallback: the presigned Location carries response-content-disposition.
    // Read it as a STRING — the target is never fetched, so S3 is still never
    // contacted and no redirect allowlist hop is involved.
    if (!name) {
      const loc = res.headers.get("location");
      if (loc) {
        try {
          const q = new URL(loc, url).searchParams.get("response-content-disposition");
          name = filenameFromContentDisposition(q);
        } catch {
          /* unparseable Location — falls through to the miss below */
        }
      }
    }

    // Release the socket without pulling any payload.
    await res.body?.cancel().catch(() => {});

    if (!name) {
      return miss(res.status >= 400 ? `http-${res.status}` : "no-filename-header");
    }
    return { id: fileId, name };
  } catch (err) {
    return miss(err instanceof Error ? err.message.slice(0, 120) : "error");
  }
}

/**
 * Resolve names for up to MAX_ATTACHMENT_IDS file ids, in input order.
 * Never throws for a single failure — one unreadable attachment must not cost
 * the caller the other twenty-two names.
 */
export async function resolveAttachmentNames(fileIds: string[]): Promise<AttachmentName[]> {
  const apiKey = process.env.SAM_API_KEY;
  const ids = fileIds.slice(0, MAX_ATTACHMENT_IDS);
  if (!apiKey) return ids.map((id) => ({ id, name: null, reason: "no-api-key" }));

  const out: AttachmentName[] = new Array(ids.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= ids.length) return;
      out[i] = await resolveOne(ids[i], apiKey);
    }
  });
  await Promise.all(workers);
  return out;
}
