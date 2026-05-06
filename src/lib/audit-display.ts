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

interface AuditLike {
  solicitation_number?: string | null;
  notice_id?: string | null;
  title?: string | null;
}

export function displaySolicitationId(a: AuditLike): string {
  const sn = a.solicitation_number?.trim();
  if (sn) return sn;
  const nid = a.notice_id?.trim() ?? "";
  if (nid && !PDF_UPLOAD_RE.test(nid) && !HEX_32_RE.test(nid)) return nid;
  // For PDF-upload audits the route's synthesizer (api/audit/route.ts:131-153)
  // sets title from the cleaned filename — usually the canonical solicitation
  // number ("FA301626Q0068"). Use it when it doesn't itself look synthetic.
  const t = a.title?.trim();
  if (t && !PDF_UPLOAD_RE.test(t) && !HEX_32_RE.test(t) && !/^Untitled/i.test(t)) return t;
  return nid || "—";
}
