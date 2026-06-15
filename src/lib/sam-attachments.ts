// FA-136 — multi-attachment ingestion: deterministic, form-first, budgeted.
//
// Every arm used to ingest exactly resourceLinks[0] — positionally, with no
// awareness the other files existed. Live exhibits: 1232SA26R0020 has 18
// files (~168MB) with the actual form at manifest position 13 (the audited
// runs read "Tornado Repairs - Project Description.pdf" — hence the
// placeholder TO); even FA460026Q0047's audits read "Attachment 1 - PWS"
// instead of "Solicitation - FA460026Q0047.pdf".
//
// Design:
//   1. Fetch the v3 resources manifest (names + sizes + resourceIds) — the
//      proven hal+json host conventions (sam.gov/api/prod, NOT api.sam.gov).
//   2. Deterministic plan: FORM first (name heuristics below), then
//      amendments, then attachments name-sorted. Never download-order.
//   3. Budget BEFORE download (sizes are known up front): ≤ MAX_DOCS
//      documents, ≤ MAX_TOTAL_INLINE_BYTES total, PDF members only. The
//      Anthropic request ceiling (~100 PDF pages / 32MB) makes full-set
//      ingestion of a 1232-class notice impossible — overflow is FLAGGED
//      loudly (compliance_json.ingestion), never silent.
//   4. PDF-portfolio wrappers are DETECTED and flagged, not unpacked —
//      unpacking embedded files is disproportionate for the current corpus
//      (zero observed portfolio notices); the flag keeps the run honest.
//
// Failure contract: manifest fetch failure returns null and the caller falls
// back to the legacy single-URL path exactly as pre-FA-136 (no flag — we
// know nothing about the set), logged loudly.

const SAM_API_KEY = process.env.SAM_API_KEY;
const FETCH_TIMEOUT_MS = 30000;

// Budget rationale: 5 docs × inline base64 keeps the request far under the
// API's 100-page/32MB PDF ceiling for real solicitation sets (forms are
// 100KB-600KB; specs/amendments similar); 15MB total leaves headroom for
// prompt + metadata. Members above the single-file Files-API threshold are
// never inlined in a multi-set.
export const MAX_DOCS = 5;
export const MAX_TOTAL_INLINE_BYTES = 15 * 1024 * 1024;

export interface AttachmentManifestEntry {
  name: string;
  sizeBytes: number | null;
  resourceId: string;
  url: string;
}

export interface DocumentPlanEntry extends AttachmentManifestEntry {
  role: "form" | "amendment" | "attachment";
}

export interface IngestionFileMeta {
  name: string;
  role: "form" | "amendment" | "attachment";
  bytes: number | null;
  ingested: boolean;
  reason?: string;
}

export interface IngestionMeta {
  files_total: number;
  files_ingested: number;
  form_identified: boolean;
  form_name: string | null;
  portfolio_detected?: boolean;
  overflow?: string;
  files: IngestionFileMeta[];
}

export interface AssembledDocumentSet {
  /** The form (or first plan entry when no form identified), inline-ready. */
  primary: { name: string; base64: string; buffer: Buffer } | null;
  /** Further ingested documents in plan order. */
  attachments: Array<{ name: string; base64: string; buffer: Buffer }>;
  ingestion: IngestionMeta;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function fetchAttachmentManifest(noticeId: string): Promise<AttachmentManifestEntry[] | null> {
  if (!SAM_API_KEY || !/^[a-f0-9]{32}$/i.test(noticeId)) return null;
  try {
    const res = await fetch(
      `https://sam.gov/api/prod/opps/v3/opportunities/${noticeId}/resources?api_key=${SAM_API_KEY}`,
      { headers: { accept: "application/hal+json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { _embedded?: { opportunityAttachmentList?: Array<{ attachments?: Array<Record<string, unknown>> }> } };
    const atts = j?._embedded?.opportunityAttachmentList?.[0]?.attachments;
    if (!Array.isArray(atts) || atts.length === 0) return null;
    return atts
      .filter((a) => typeof a?.resourceId === "string" && typeof a?.name === "string")
      .map((a) => ({
        name: a.name as string,
        sizeBytes: typeof a.size === "number" ? a.size : null,
        resourceId: a.resourceId as string,
        url: `https://sam.gov/api/prod/opps/v3/opportunities/resources/files/${a.resourceId}/download`
      }));
  } catch {
    return null;
  }
}

// FA-119 Phase 2 — work-statement-aware tiering. The governing work statement
// (PWS / SOW / SOO / Project Description) is the single highest-value document
// in a solicitation set; without it call-3 (risks) collapses and §03 renders
// UNKNOWN. The prior size-ascending fill dropped a mid-sized PWS in favour of
// trivial small files (sign-in sheets, tiny DID forms). These detectors lift a
// real work statement above generic attachments so it survives the budget.
const WS_STRONG = /\b(pws|sow|soo)\b|performance\s*work\s*statement|statement\s*of\s*(work|need|objectives?)|project\s*description|section\s*c\b/i;
const WS_WEAK = /specification|\bspec\b|\brequirements?\b|\bscope\b/i;
function workStatementSignal(name: string): 0 | 1 | 2 {
  if (WS_STRONG.test(name)) return 2; // strong: a real work statement
  if (WS_WEAK.test(name)) return 1; // weak: spec / requirements / scope doc
  return 0;
}
// Single ordering key shared by planDocumentOrder + applyBudget so the budget is
// consumed in the same priority both compute: form → amendment → strong work
// statement → weak spec → generic attachment. Size is only the tie-break.
function documentTier(e: DocumentPlanEntry): number {
  if (e.role === "form") return 0;
  if (e.role === "amendment") return 1;
  const sig = workStatementSignal(e.name);
  return sig === 2 ? 2 : sig === 1 ? 3 : 4;
}

// Deterministic role assignment + ordering. Pure — exported for the gate
// suite (tested against the recorded 1232SA26R0020 + FA460026Q0047 manifests).
export function planDocumentOrder(entries: AttachmentManifestEntry[], solicitationNumber: string | null): DocumentPlanEntry[] {
  const solNorm = solicitationNumber ? norm(solicitationNumber) : "";
  const isAmendment = (n: string) => /\bamd\b|amendment|_amd_|-amd-/i.test(n);
  const isForm = (n: string) => {
    if (isAmendment(n)) return false;
    const nn = norm(n);
    if (solNorm && nn.includes(solNorm) && !/attach|attch|exhibit|wage|drawing|spec/i.test(n)) return true;
    return /^sol[\s_-]|^solicitation\b|solicitation[\s_-]*-|sf[\s-]?1449|sf[\s-]?0?18\b|sf[\s-]?33\b/i.test(n.trim());
  };
  const planned: DocumentPlanEntry[] = entries.map((e) => ({
    ...e,
    role: isForm(e.name) ? "form" : isAmendment(e.name) ? "amendment" : "attachment"
  }));
  // FA-119: tier primary (work statement promoted above generic attachments),
  // size-ascending tie-break within tier, name last for determinism.
  return planned.sort((a, b) =>
    documentTier(a) - documentTier(b) ||
    (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity) ||
    a.name.localeCompare(b.name)
  );
}

// Budget application — pure, exported for the gate suite. Decides which plan
// entries get downloaded BEFORE any bytes move. Only .pdf members are
// ingestible in the multi-set; unknown sizes are skipped (never gamble the
// budget on an unsized file beyond the form).
export function applyBudget(plan: DocumentPlanEntry[], maxDocs = MAX_DOCS, maxTotal = MAX_TOTAL_INLINE_BYTES): {
  ingest: DocumentPlanEntry[];
  skipped: Array<{ entry: DocumentPlanEntry; reason: string }>;
} {
  const ingest: DocumentPlanEntry[] = [];
  const skipped: Array<{ entry: DocumentPlanEntry; reason: string }> = [];
  let total = 0;
  // Fill order (FA-119): documentTier primary — form → amendment → strong work
  // statement → weak spec → generic attachment — with size-ASCENDING as the
  // tie-break WITHIN each tier (a compact 540KB PWS beats a 40MB drawing dump,
  // and a real work statement is never re-bumped by a large spec set). This
  // replaces the prior pure size-ascending fill, which starved the budget by
  // ingesting trivial small files (sign-in sheets, tiny DID forms) and dropping
  // the governing work statement. Everything skipped is named in the overflow
  // flag.
  const fillOrder = [...plan].sort((a, b) =>
    documentTier(a) - documentTier(b) ||
    (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity) ||
    a.name.localeCompare(b.name)
  );
  for (const e of fillOrder) {
    if (!/\.pdf$/i.test(e.name)) { skipped.push({ entry: e, reason: "non-PDF attachment (not inlineable)" }); continue; }
    if (e.sizeBytes == null) { skipped.push({ entry: e, reason: "size unknown — excluded from budget" }); continue; }
    if (ingest.length >= maxDocs) { skipped.push({ entry: e, reason: `document cap (${maxDocs}) reached` }); continue; }
    if (total + e.sizeBytes > maxTotal) { skipped.push({ entry: e, reason: `inline budget (${Math.round(maxTotal / 1048576)}MB) exceeded` }); continue; }
    ingest.push(e);
    total += e.sizeBytes;
  }
  return { ingest, skipped };
}

// PDF-portfolio wrapper detection (a single PDF embedding other files).
// Catalog tokens are plain ASCII in the body; a byte scan is sufficient and
// cheap. Flag-only by design — see module header.
export function isPdfPortfolio(buffer: Buffer): boolean {
  return buffer.includes("/EmbeddedFiles") || buffer.includes("/Collection");
}

async function downloadPdf(url: string): Promise<Buffer | null> {
  try {
    const u = url.includes("api_key=") ? url : `${url}${url.includes("?") ? "&" : "?"}api_key=${SAM_API_KEY}`;
    const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // magic-byte check — manifest said .pdf, verify before inlining
    return buf.subarray(0, 4).toString("latin1") === "%PDF" ? buf : null;
  } catch {
    return null;
  }
}

export async function assembleSamDocumentSet(
  noticeId: string,
  solicitationNumber: string | null
): Promise<AssembledDocumentSet | null> {
  const manifest = await fetchAttachmentManifest(noticeId);
  if (!manifest) return null;

  const plan = planDocumentOrder(manifest, solicitationNumber);
  const formEntry = plan.find((e) => e.role === "form") ?? null;
  const { ingest, skipped } = applyBudget(plan);

  const files: IngestionFileMeta[] = [];
  const downloaded: Array<{ name: string; base64: string; buffer: Buffer; role: DocumentPlanEntry["role"] }> = [];
  for (const e of plan) {
    const planned = ingest.find((i) => i.resourceId === e.resourceId);
    if (!planned) {
      const skip = skipped.find((s) => s.entry.resourceId === e.resourceId);
      files.push({ name: e.name, role: e.role, bytes: e.sizeBytes, ingested: false, reason: skip?.reason ?? "not planned" });
      continue;
    }
    const buf = await downloadPdf(e.url);
    if (!buf) {
      files.push({ name: e.name, role: e.role, bytes: e.sizeBytes, ingested: false, reason: "download failed or not a PDF" });
      continue;
    }
    downloaded.push({ name: e.name, base64: buf.toString("base64"), buffer: buf, role: e.role });
    files.push({ name: e.name, role: e.role, bytes: buf.length, ingested: true });
  }

  const primary = downloaded.find((d) => d.role === "form") ?? downloaded[0] ?? null;
  const attachments = downloaded.filter((d) => d !== primary);
  const ingestedCount = downloaded.length;
  const skippedCount = files.filter((f) => !f.ingested).length;
  const ingestion: IngestionMeta = {
    files_total: plan.length,
    files_ingested: ingestedCount,
    form_identified: !!formEntry && downloaded.some((d) => d.role === "form"),
    form_name: formEntry?.name ?? null,
    ...(primary && isPdfPortfolio(primary.buffer) ? { portfolio_detected: true } : {}),
    ...(skippedCount > 0 ? { overflow: `${skippedCount} of ${plan.length} files not ingested (budget: ${MAX_DOCS} docs / ${Math.round(MAX_TOTAL_INLINE_BYTES / 1048576)}MB inline; non-PDF members never inlined)` } : {}),
    files
  };
  return {
    primary: primary ? { name: primary.name, base64: primary.base64, buffer: primary.buffer } : null,
    attachments: attachments.map((a) => ({ name: a.name, base64: a.base64, buffer: a.buffer })),
    ingestion
  };
}
