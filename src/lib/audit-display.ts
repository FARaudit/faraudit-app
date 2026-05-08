// Customer-facing display helpers for audit rows.
//
// The customer-visible UUID leak (e.g. "pdf-1778020342046",
// "aefdb844d9b044c5aac29cbd28bbf038") comes from rendering audits.notice_id
// directly in headers, subtitles, KO email subjects, PDF footers, etc.
// The DB has the canonical solicitation number on audits.solicitation_number
// when SAM returned one; for PDF-only uploads the route synthesizer derives
// audits.title from the filename ("FA301626Q0068") which is also canonical.
// This helper picks the best display ID with a stable priority chain.

const PDF_UPLOAD_RE = /^pdf-\d+$/;
const HEX_32_RE = /^[a-f0-9]{32}$/i;
// SAM.gov occasionally leaks a PSC code + product description into the
// solicitationNumber field for sources-sought / RFI notices (e.g.
// "3990--COMPACT TRACK LOADER, FULLY ENCLOSED CAB, 12-15K LB CLASS").
// Sanitizers in src/lib/sam.ts + agents/sam-ingest/helpers.ts strip these at
// ingest time, but rows persisted before those sanitizers shipped still
// carry the leak. Treat any whitespace-containing or "--"-containing string
// as a synthetic-shaped leak so existing dirty data renders cleanly via
// fallback to notice_id / title.
const PSC_LEAK_RE = /^\d{4}--|^\s*\S+\s+\S/;
// Titles like "Stranded notice 7e13f96a69c04c10ba8a0fd004e9ac1b" were
// written by the disposable verify-p0a.ts harness during P0-A verification.
// They contain a hex hash inside an otherwise human-looking string so the
// HEX_32_RE whole-string guard misses them. Treat as synthetic.
const STRANDED_TITLE_RE = /^stranded notice [a-f0-9]{32}$/i;

interface AuditLike {
  solicitation_number?: string | null;
  notice_id?: string | null;
  title?: string | null;
}

export function displaySolicitationId(a: AuditLike): string {
  const sn = a.solicitation_number?.trim();
  if (sn && !PSC_LEAK_RE.test(sn) && sn.length <= 25) return sn;
  const nid = a.notice_id?.trim() ?? "";
  if (nid && !PDF_UPLOAD_RE.test(nid) && !HEX_32_RE.test(nid)) return nid;
  // For PDF-upload audits the route's synthesizer (api/audit/route.ts:131-153)
  // sets title from the cleaned filename — usually the canonical solicitation
  // number ("FA301626Q0068"). Use it when it doesn't itself look synthetic.
  const t = a.title?.trim();
  if (t && !PDF_UPLOAD_RE.test(t) && !HEX_32_RE.test(t) && !STRANDED_TITLE_RE.test(t) && !/^Untitled/i.test(t)) return t;
  // Last-line: never leak the synthetic ID. "—" is a clean visual fallback.
  return "—";
}

// Card-friendly display name for audit rows in lists (Pipeline kanban, Recent
// Audits, Past Audits, Capability past-perf, etc.). Different responsibility
// from displaySolicitationId — that returns an ID-shaped string for subtitles;
// this returns a sentence-friendly title.
//
// Priority: clean title > solicitation_number > clean notice_id > humanized
// "Untitled audit · {timestamp}" fallback. The timestamp uses the browser's
// local time zone via toLocaleString without an explicit timeZone option.
export function auditDisplayName(
  a: AuditLike & { created_at?: string | null }
): string {
  const t = a.title?.trim();
  if (t && !PDF_UPLOAD_RE.test(t) && !HEX_32_RE.test(t) && !STRANDED_TITLE_RE.test(t) && !/^Untitled/i.test(t)) {
    return t;
  }
  const sn = a.solicitation_number?.trim();
  if (sn && !PSC_LEAK_RE.test(sn) && sn.length <= 25) return sn;
  const nid = a.notice_id?.trim();
  if (nid && !PDF_UPLOAD_RE.test(nid) && !HEX_32_RE.test(nid)) return nid;
  if (a.created_at) {
    const d = new Date(a.created_at);
    if (!Number.isNaN(d.getTime())) {
      return `Untitled audit · ${d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })}`;
    }
  }
  return "Untitled audit";
}

// URL builder for audit detail links. Prefers solicitation_number (slug form)
// over the UUID id so external paste-shares look like /audit/fa301626q0068
// instead of /audit/{uuid}. Lowercases for URL hygiene; the /audit/[id] route
// matches case-insensitive so any cased paste still resolves.
//
// Leaky sol#s (PSC-prefix dumps, anything with whitespace, anything >25
// chars) fall back to UUID — a clean URL beats a slug we'd have to URL-encode.
export function auditHref(a: { id: string; solicitation_number?: string | null }): string {
  const sn = a.solicitation_number?.trim();
  if (sn && !PSC_LEAK_RE.test(sn) && sn.length <= 25) {
    return `/audit/${sn.toLowerCase()}`;
  }
  return `/audit/${a.id}`;
}
