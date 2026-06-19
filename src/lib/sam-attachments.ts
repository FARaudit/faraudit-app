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
//      Anthropic request ceiling (~600 PDF pages / 32MB) makes full-set
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

// Budget rationale: 5 docs × inline base64 keeps the request under the API's
// 600-page / 32MB PDF ceiling for real solicitation sets (forms are
// 100KB-600KB; specs/amendments similar); 15MB total leaves headroom for
// prompt + metadata. Members above the single-file Files-API threshold are
// never inlined in a multi-set.
export const MAX_DOCS = 5;
export const MAX_TOTAL_INLINE_BYTES = 15 * 1024 * 1024;
// FA-119 Phase 2B: the API enforced a 600-PAGE ceiling in production on
// 2026-06-15 (trace req_011Cc5c19aV7pZng2C1J99ok) — a payload-400 that HARD-
// FAILS the run (unlike an empty-JSON call-3 collapse). Bytes (15MB) do NOT
// bound pages: a page-dense spec is small in MB. Promoting the work statement
// + specs (FA-119 Phase 2) raised the page-overflow risk. 550 = safety margin
// under 600. Enforced post-download (page count needs the bytes), in tier
// order, with the form exempt — so generic attachments drop first.
export const MAX_TOTAL_PAGES = 550;

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
  // FA-182 — detected solicitation section role(s) ∈ C|H|L|M, from the file
  // NAME (deterministic, conservative). Empty [] = unknown → stays a plain
  // ATTACHMENT in the ingestion banner. Drives the .isec section tags + true
  // §C/§L/§M coverage chip (upgrades the banner from form-grain).
  section_roles?: string[];
}

// FA-182 — classify a file's solicitation section role(s) from its NAME only.
// Conservative by design: a wrong §-tag is a fabrication, so we tag only what
// the name clearly signals (a leading section letter, an explicit "Section X",
// or a reliable section keyword) and leave everything else unknown ([]). This
// under-claims (generic names → plain ATTACHMENT) rather than guessing.
export function classifySectionRoles(name: string): string[] {
  const n = name.toLowerCase();
  const nspace = n.replace(/[_.\-+]+/g, " "); // separator-normalized (incl. "+"), for keywords
  const roles = new Set<string>();
  const add = (s: string): void => { roles.add(s.toUpperCase()); };
  const grab = (cluster: string): void => (cluster.match(/[chlm]/gi) ?? []).forEach(add);
  // A section-letter CLUSTER = single isolated letters (NOT the start of a
  // word — `(?![a-z])` keeps "combined" from reading as "C") joined by real
  // separators ("L & M", "L_M", "L and M", "L, M").
  const C = "[chlm](?![a-z])(?:(?:[\\s_.\\-+,&\\/]|and)+[chlm](?![a-z]))*";
  let m: RegExpExecArray | null;
  // explicit "Section(s) <cluster>"
  const secRe = new RegExp(`sections?\\s*[_.\\- ]?\\s*(${C})`, "gi");
  while ((m = secRe.exec(n)) !== null) grab(m[1]);
  // leading cluster at the filename start: "C_…", "L_M_…", "L and M …"
  const lead = new RegExp(`^(${C})[ _.\\-]`, "i").exec(n);
  if (lead) grab(lead[1]);
  // delimited "X." section designator ANYWHERE — the common SAM filename shape
  // "AOCSSB… - C. - Statement of Work.pdf". Sep-prefixed so it never fires inside
  // a word ("model.pdf" is not read as L).
  const desigRe = /(?:^|[\s+_(§-])([chlm])\./gi;
  while ((m = desigRe.exec(n)) !== null) add(m[1]);
  // reliable section keywords (matched on the separator-normalized name)
  if (/statement of work|\bsow\b|\bpws\b|performance work statement|\bsoo\b|scope of work|statement of objectives|project description|bid description/.test(nspace)) add("c");
  if (/instructions?\b[\s\w]{0,40}\bofferors?\b|notices to offerors/.test(nspace)) add("l");
  if (/evaluation factors?\b|basis of award\b/.test(nspace)) add("m");
  if (/special contract requirements?\b/.test(nspace)) add("h");
  return ["C", "H", "L", "M"].filter((x) => roles.has(x));
}

// FA-E2E Fix 4 — derive a sol-number token from a set of raw upload filenames
// so the solNorm branch of isForm can fire on uploads. Without it, an
// amendment-named primary solicitation (e.g. "Sol_HM047626R0039_Amd_0001.pdf")
// never resolves to a FORM and the "no primary solicitation" banner sticks. Sol
// numbers are letter+digit dense tokens (e.g. HM047626R0039, FA460026Q0047,
// W912DY-26-R-0001); take the longest such token across all filenames. Pure —
// shared by both the sync route and the async worker so they behave identically.
export function deriveSolTokenFromFilenames(names: string[]): string | null {
  const SOLNUM_RE = /\b[0-9A-Z]{2,}[-_ ]?[0-9A-Z]{0,}(?:[-_ ]?[0-9A-Z]+){1,}\b/gi;
  // RC5 Fix 2 — strip a trailing amendment/modification suffix so the derived
  // token is the TRUE sol number, not the amendment-stamped filename token.
  // "Sol_1232SA26R0020_Amd_0001" → "Sol_1232SA26R0020" (then SOLNUM_RE yields
  // 1232SA26R0020). Case-insensitive; no-op for non-amendment names.
  // Tolerates an optional file extension after the suffix ("…_Amd_0001.pdf").
  const AMD_SUFFIX_RE = /[-_ ]?(?:amd|amendment|mod|modification)[-_ ]?\d*(\.[a-z0-9]+)?$/i;
  return names
    .map((name) => name.replace(AMD_SUFFIX_RE, "$1"))
    .flatMap((name) => (name.match(SOLNUM_RE) ?? []))
    .map((t) => t.trim())
    .filter((t) => /[0-9]/.test(t) && /[A-Z]/i.test(t) && t.replace(/[^0-9A-Z]/gi, "").length >= 8)
    .sort((a, b) => b.replace(/[^0-9A-Z]/gi, "").length - a.replace(/[^0-9A-Z]/gi, "").length)[0] ?? null;
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
    // The attachment/exhibit/wage/drawing/spec veto wins FIRST — never the form
    // even if its name contains "solicitation" (e.g. "Attachment 12 Solicitation
    // RFIs.pdf").
    if (/attach|attch|exhibit|wage|drawing|\bspec\b/i.test(n)) return false;
    const nn = norm(n);
    // FA-E2E re-verify Fix C (2026-06-18): strong FORM signals win over the
    // amendment veto. A primary solicitation is frequently delivered with an
    // amendment-shaped name (SF-30 "Amendment of Solicitation") or carries an
    // amendment token alongside the sol number. Previously `if (isAmendment(n))
    // return false` short-circuited BEFORE these signals, so the whole set had
    // no FORM → the "no primary solicitation" banner stuck. A file is FORM when
    // it clears the exclusion veto above AND matches a strong form signal, EVEN
    // IF it also carries an amendment marker.
    const strongForm =
      (solNorm && nn.includes(solNorm)) ||
      // \bsolicitation\b (unanchored) catches "1. HM047626R0039 - Solicitation.pdf"
      // and "Solicitation - FA460026Q0047.pdf".
      /\bsolicitation\b/i.test(n) ||
      // SF-30 amendment-of-solicitation marker — the SF-30 IS the governing form
      // for an amended buy.
      /sf[\s-]?30|amendment of solicitation|amendment\/modification of contract/i.test(n);
    if (strongForm) return true;
    // No strong signal → the amendment veto applies (a bare "Amendment 2.pdf" is
    // not the primary form).
    if (isAmendment(n)) return false;
    // SF cover-form numbers cover the rest, incl. SF-1442 (construction).
    return /sf[\s-]?1449|sf[\s-]?1442|sf[\s-]?0?18\b|sf[\s-]?33\b/i.test(n.trim());
  };
  const planned: DocumentPlanEntry[] = entries.map((e) => ({
    ...e,
    role: isForm(e.name) ? "form" : isAmendment(e.name) ? "amendment" : "attachment"
  }));
  // FA-119: tier primary (work statement promoted above generic attachments),
  // size-ascending tie-break within tier, name last for determinism.
  // FA-E2E re-verify Fix C: within the form tier, prefer the file whose name
  // contains the sol number or "Solicitation" as THE form, so a strong primary
  // wins over an incidental SF-30 amendment that also cleared isForm.
  const formStrength = (e: DocumentPlanEntry): number => {
    if (e.role !== "form") return 0;
    const nn = norm(e.name);
    if (solNorm && nn.includes(solNorm)) return 2;
    if (/\bsolicitation\b/i.test(e.name)) return 1;
    return 0;
  };
  return planned.sort((a, b) =>
    documentTier(a) - documentTier(b) ||
    formStrength(b) - formStrength(a) ||
    (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity) ||
    a.name.localeCompare(b.name)
  );
}

// RC5 Fix 1 — content-aware form substantiveness, by NAME (deterministic).
//
// Root cause (audit #4, 1232SA26R0020): the user uploaded ONLY an SF-30
// amendment cover ("Sol_1232SA26R0020_Amd_0001.pdf") + an image-heavy scope
// deck — the base solicitation was NOT uploaded. isForm() correctly classifies
// the amendment-named primary as FORM (so the set has SOMETHING to anchor on),
// but emitting form_identified=true on a content-empty SF-30 cover MASKS the
// honest "upload the solicitation" banner.
//
// formIsSubstantive(formName) answers: does the identified form look like a real
// solicitation body, or only an amendment/SF-30 cover that resolved via the sol
// number? It returns FALSE only for the narrow, conservative case:
//   - the file carries an amendment marker (_Amd_ / SF-30 / "amendment of
//     solicitation"), AND
//   - it has NO real solicitation-cover signal (no SF-1442/1449/33/18, no bare
//     \bsolicitation\b token).
// In that case its ONLY claim to FORM-hood is the solNorm substring match — i.e.
// an amendment cover that happens to carry the sol number. Everything else
// (a real SF-1442/1449/33 cover, even when amendment-named; a file literally
// named "…Solicitation…") returns TRUE so a genuine amended solicitation still
// counts as the form. null/empty → false (no form at all).
//
// Consumed by form_identified in both assembly arms. The view-model
// (_view-model.ts ~2755) reads `ingestion.form_identified !== true` as
// `formless` and fires the no-primary banner — so flipping this to false makes
// the honest "upload the solicitation" banner fire with NO view-model change.
export function formIsSubstantive(formName: string | null | undefined): boolean {
  if (!formName) return false;
  const n = formName;
  // A genuine SF cover form is substantive even if amendment-named.
  if (/sf[\s-]?1449|sf[\s-]?1442|sf[\s-]?0?18\b|sf[\s-]?33\b/i.test(n)) return true;
  // A file literally named "…Solicitation…" is the solicitation body, not an
  // amendment cover — substantive. (SF-30's full title is "Amendment of
  // Solicitation", which we exclude below before this could false-positive.)
  const isAmendmentCover = /sf[\s-]?30|amendment of solicitation|amendment\/modification of contract|\bamd\b|amendment|_amd_|-amd-/i.test(n);
  if (/\bsolicitation\b/i.test(n) && !isAmendmentCover) return true;
  // Otherwise: if it's an amendment/SF-30 cover, its only FORM claim is the
  // solNorm match → NOT substantive. The honest no-primary banner must fire.
  if (isAmendmentCover) return false;
  // No amendment marker and it still got classified as form (e.g. an SF cover
  // matched above would have returned true already) → treat as substantive.
  return true;
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

// FA-119 Phase 2B — light page counter. pdf-parse v2's getInfo() returns the
// page count (`total`) WITHOUT full text extraction (getText) — cheap. Mirrors
// pdf-text-extractor's defensive require + v1 fallback. A counter failure
// returns 0 so a bad parse never blocks ingestion (pages-unknown == not-counted).
async function countPdfPages(buf: Buffer): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("pdf-parse");
    const Ctor = mod?.PDFParse ?? mod?.default ?? mod;
    if (typeof Ctor !== "function") return 0;
    const inst = new Ctor({ data: buf });
    if (typeof inst.getInfo === "function") {
      const info = await inst.getInfo();
      const n = Number(info?.total ?? 0);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    // pdf-parse v1 callable fallback → { numpages }
    const out = await Ctor(buf);
    const n = Number(out?.numpages ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// FA-119 Phase 2B — page budget. Pure + exported for the gate suite. Runs AFTER
// download (page count needs the bytes) over the byte/doc-budgeted set, in tier
// order (planDocumentOrder output). The form is EXEMPT — it is the solicitation
// and must never be dropped. Tier order means the work statement is evaluated
// before generic attachments, so generics drop first when the ceiling is hit.
export function applyPageBudget<T extends { role: DocumentPlanEntry["role"]; pages: number; name?: string }>(
  docs: T[],
  maxPages = MAX_TOTAL_PAGES
): { ingest: T[]; skipped: Array<{ entry: T; reason: string }> } {
  const ingest: T[] = [];
  const skipped: Array<{ entry: T; reason: string }> = [];
  let total = 0;
  for (const d of docs) {
    if (d.role !== "form" && total + d.pages > maxPages) {
      skipped.push({ entry: d, reason: `page budget (${maxPages}pp) exceeded` });
      continue;
    }
    total += d.pages;
    ingest.push(d);
  }
  return { ingest, skipped };
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

  // FA-119 Phase 2B — page budget runs AFTER download (page count needs bytes).
  // Pass 1: download + page-count every byte/doc-budgeted member, in tier order.
  const files: IngestionFileMeta[] = [];
  const fetched: Array<{ entry: DocumentPlanEntry; base64: string; buffer: Buffer; pages: number }> = [];
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
    fetched.push({ entry: e, base64: buf.toString("base64"), buffer: buf, pages: await countPdfPages(buf) });
  }
  // Pass 2: trim by the page ceiling (pure, tier order, form exempt → generics
  // drop first; the work statement, evaluated first, is never the one dropped).
  const { ingest: pageKept } = applyPageBudget(
    fetched.map((f) => ({ resourceId: f.entry.resourceId, role: f.entry.role, name: f.entry.name, pages: f.pages })),
    MAX_TOTAL_PAGES
  );
  const keptIds = new Set(pageKept.map((k) => k.resourceId));
  // Pass 3: build the ingested set + the loud per-file record.
  const downloaded: Array<{ name: string; base64: string; buffer: Buffer; role: DocumentPlanEntry["role"] }> = [];
  for (const f of fetched) {
    if (keptIds.has(f.entry.resourceId)) {
      downloaded.push({ name: f.entry.name, base64: f.base64, buffer: f.buffer, role: f.entry.role });
      files.push({ name: f.entry.name, role: f.entry.role, bytes: f.buffer.length, ingested: true });
    } else {
      files.push({ name: f.entry.name, role: f.entry.role, bytes: f.entry.sizeBytes, ingested: false, reason: `page budget (${MAX_TOTAL_PAGES}pp) exceeded` });
    }
  }

  const primary = downloaded.find((d) => d.role === "form") ?? downloaded[0] ?? null;
  const attachments = downloaded.filter((d) => d !== primary);
  const ingestedCount = downloaded.length;
  const skippedCount = files.filter((f) => !f.ingested).length;
  const ingestion: IngestionMeta = {
    files_total: plan.length,
    files_ingested: ingestedCount,
    // RC5 Fix 1 — only honest if a SUBSTANTIVE form was identified. An
    // amendment-only / SF-30-cover primary (form claim is just the sol-number
    // match) → false, so the no-primary "upload the solicitation" banner fires.
    form_identified: !!formEntry && downloaded.some((d) => d.role === "form") && formIsSubstantive(formEntry.name),
    form_name: formEntry?.name ?? null,
    ...(primary && isPdfPortfolio(primary.buffer) ? { portfolio_detected: true } : {}),
    ...(skippedCount > 0 ? { overflow: `${skippedCount} of ${plan.length} files not ingested (budget: ${MAX_DOCS} docs / ${Math.round(MAX_TOTAL_INLINE_BYTES / 1048576)}MB inline / ${MAX_TOTAL_PAGES}pp; non-PDF members never inlined)` } : {}),
    files: files.map((f) => ({ ...f, section_roles: f.role === "attachment" ? classifySectionRoles(f.name) : [] })),
  };
  return {
    primary: primary ? { name: primary.name, base64: primary.base64, buffer: primary.buffer } : null,
    attachments: attachments.map((a) => ({ name: a.name, base64: a.base64, buffer: a.buffer })),
    ingestion
  };
}

// FA-170 — multi-FILE UPLOAD assembly (local bytes, no network).
//
// Bug: the manual-upload arm (POST /api/audit, multipart) only ever read ONE
// file (formData.get("pdf")) and never populated compliance_json.ingestion —
// so a user who uploaded a Solicitation + SOW + Section L/M got an audit of a
// single file (often the attachment, never the form) with NO partial-ingestion
// banner. Observed across HM047626R0039, AOCSSB26R0039, FA487726B0001,
// 1232SA26R0020, FA460026Q0047 (2026-06-16): each audit was titled after the
// attachment and silently dropped the binding solicitation.
//
// This is the upload twin of assembleSamDocumentSet: same deterministic
// form-first plan + budget + page ceiling + ingestion meta, but the bytes are
// already in hand (no manifest fetch, no download). Reuses the exact pure
// planners (planDocumentOrder / applyBudget / applyPageBudget) so upload and
// SAM ingestion order identically and the gate suite covers both.
export interface LocalUploadFile {
  name: string;
  buffer: Buffer;
}

// Uploaded filenames frequently arrive URL-encoded ("Statement+of+Work.pdf",
// "Solicitation+-+FA460026Q0047.pdf") because they were downloaded from SAM.gov
// and re-uploaded verbatim. The role/work-statement heuristics match on
// human-readable tokens (\bsolicitation\b, "statement of work"), so the literal
// "+" must be decoded to spaces first — otherwise the form is never identified
// and a SOW/PWS wins the size tie-break as primary (observed across all five
// 2026-06-16 group uploads). No-op for names that already use real spaces.
export function prettifyUploadName(name: string): string {
  let s = name;
  try {
    s = decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    s = s.replace(/\+/g, " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

export async function assembleUploadedDocumentSet(
  localFiles: LocalUploadFile[],
  solicitationNumber: string | null
): Promise<AssembledDocumentSet> {
  // Synthesize manifest entries from the local bytes — sizes are known exactly.
  // Names are decoded so the form-first heuristics see readable tokens.
  const manifest: AttachmentManifestEntry[] = localFiles.map((f, i) => ({
    name: prettifyUploadName(f.name),
    sizeBytes: f.buffer.length,
    resourceId: `local-${i}`,
    url: ""
  }));
  const bufById = new Map(manifest.map((m, i) => [m.resourceId, localFiles[i].buffer]));

  const plan = planDocumentOrder(manifest, solicitationNumber);
  const formEntry = plan.find((e) => e.role === "form") ?? null;
  const { ingest, skipped } = applyBudget(plan);

  // Pass 1: page-count every byte/doc-budgeted member (bytes already local).
  const files: IngestionFileMeta[] = [];
  const counted: Array<{ entry: DocumentPlanEntry; base64: string; buffer: Buffer; pages: number }> = [];
  for (const e of plan) {
    const planned = ingest.find((i) => i.resourceId === e.resourceId);
    if (!planned) {
      const skip = skipped.find((s) => s.entry.resourceId === e.resourceId);
      files.push({ name: e.name, role: e.role, bytes: e.sizeBytes, ingested: false, reason: skip?.reason ?? "not planned" });
      continue;
    }
    const buf = bufById.get(e.resourceId);
    if (!buf || buf.subarray(0, 4).toString("latin1") !== "%PDF") {
      files.push({ name: e.name, role: e.role, bytes: e.sizeBytes, ingested: false, reason: "not a valid PDF (magic-byte check)" });
      continue;
    }
    counted.push({ entry: e, base64: buf.toString("base64"), buffer: buf, pages: await countPdfPages(buf) });
  }
  // Pass 2: trim by the page ceiling (form exempt → generics drop first).
  const { ingest: pageKept } = applyPageBudget(
    counted.map((c) => ({ resourceId: c.entry.resourceId, role: c.entry.role, name: c.entry.name, pages: c.pages })),
    MAX_TOTAL_PAGES
  );
  const keptIds = new Set(pageKept.map((k) => k.resourceId));
  // Pass 3: build the ingested set + the loud per-file record.
  const ingested: Array<{ name: string; base64: string; buffer: Buffer; role: DocumentPlanEntry["role"] }> = [];
  for (const c of counted) {
    if (keptIds.has(c.entry.resourceId)) {
      ingested.push({ name: c.entry.name, base64: c.base64, buffer: c.buffer, role: c.entry.role });
      files.push({ name: c.entry.name, role: c.entry.role, bytes: c.buffer.length, ingested: true });
    } else {
      files.push({ name: c.entry.name, role: c.entry.role, bytes: c.entry.sizeBytes, ingested: false, reason: `page budget (${MAX_TOTAL_PAGES}pp) exceeded` });
    }
  }

  const primary = ingested.find((d) => d.role === "form") ?? ingested[0] ?? null;
  const attachments = ingested.filter((d) => d !== primary);
  const skippedCount = files.filter((f) => !f.ingested).length;
  const ingestion: IngestionMeta = {
    files_total: plan.length,
    files_ingested: ingested.length,
    // RC5 Fix 1 — see assembleSamDocumentSet: substantive-form gate so an
    // amendment-only upload (audit #4) honestly fires the no-primary banner.
    form_identified: !!formEntry && ingested.some((d) => d.role === "form") && formIsSubstantive(formEntry.name),
    form_name: formEntry?.name ?? null,
    ...(primary && isPdfPortfolio(primary.buffer) ? { portfolio_detected: true } : {}),
    ...(skippedCount > 0 ? { overflow: `${skippedCount} of ${plan.length} files not ingested (budget: ${MAX_DOCS} docs / ${Math.round(MAX_TOTAL_INLINE_BYTES / 1048576)}MB inline / ${MAX_TOTAL_PAGES}pp; non-PDF members never inlined)` } : {}),
    files: files.map((f) => ({ ...f, section_roles: f.role === "attachment" ? classifySectionRoles(f.name) : [] })),
  };
  return {
    primary: primary ? { name: primary.name, base64: primary.base64, buffer: primary.buffer } : null,
    attachments: attachments.map((a) => ({ name: a.name, base64: a.base64, buffer: a.buffer })),
    ingestion
  };
}
