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

import { extractNonPdfText, nonPdfKind, textToPdfBuffer } from "./nonpdf-extractor";
import { extractText, MIN_TEXT_CHARS_FOR_TEXT_BLOCK, meaningfulCharCount } from "./pdf-text-extractor";

const SAM_API_KEY = process.env.SAM_API_KEY;
const FETCH_TIMEOUT_MS = 30000;

// Budget rationale: docs × inline base64 must stay under the API's 600-page /
// 32MB PDF ceiling for real solicitation sets (forms are 100KB-600KB;
// specs/amendments similar); 15MB total leaves headroom for prompt + metadata.
// Members above the single-file Files-API threshold are never inlined in a
// multi-set.
// DTS W51H7226 fix (2026-06-20): the 5-doc cap EVICTED decision-critical docs
// (the clause/provisions list, QASP, wage determination) while KEEPING two
// near-duplicate "RFQ CLIN Structure" copies. Raised to 8 so distinct
// high-value docs survive; MAX_TOTAL_INLINE_BYTES + MAX_TOTAL_PAGES (550)
// remain the REAL ceilings, so we ingest more docs but stay under page/byte
// limits. Near-duplicate files are deduped before the budget (below).
// P0 fix (2026-06-20): large multi-section sets (N4008526R0065: 33 files;
// FA301626R0018: 40) carry MORE than 8 genuinely-distinct high-value docs —
// SOW + §C + §L + §M + price + wage + CBA + SLS + ELIN. With the ranking fixed
// (cover sheets last), 8 still starved the SOW / ELIN / SLS. Raised to 12: the
// 15MB byte budget + 550-page budget remain the REAL ceilings (the top-12 of
// both live sets stay well under both), so this admits the distinct content
// docs without risking the API payload limits.
// FA-INGEST2 (2026-06-21): raised 12 → 18. FA-INGEST1 made docs ride as cheap
// TEXT blocks (~chars/3.5) instead of base64-PDF vision (~1.5–3k tokens/page),
// and added a per-call count_tokens hard guard that trims to fit the model
// context — so the 12-doc cap is now over-conservative (N4008526R0065 read only
// 12 of 33, dropping the Inventory). 18 admits the long-tail content of large
// multi-section sets; the token budget below + the per-call guard remain the
// real ceilings, so this never risks the API payload limit.
// FA-INGEST3 (2026-06-21, ground-truth verified): raised 18 → 30. Ground-truth
// measurement of the N4008526R0065 set showed all 33 docs total only ~380k tokens
// as text — the full package fits ~4x under the 850k token budget. With the
// page-budget now vision-only (text docs no longer page-dropped), the doc-COUNT
// cap was the last artificial limit leaving valuable docs (ELINs, annexes) unread.
// The TOKEN budget (850k) + the per-call count_tokens guard (1M context) remain
// the real, safe ceilings: a genuinely huge package still trims lowest-tier docs
// in tier order rather than 400-ing. 30 lets a normal large solicitation ingest
// in full at no extra cost.
export const MAX_DOCS = 30;
export const MAX_TOTAL_INLINE_BYTES = 15 * 1024 * 1024;
// FA-INGEST4 (2026-06-22, root-class fix on the live N4008526R0065 run): the 15MB
// MAX_TOTAL_INLINE_BYTES gate was running PRE-DOWNLOAD inside applyBudget, summing
// each file's raw size and dropping the overflow BEFORE the engine ever learned a
// doc was text-readable. On N4008526R0065 (33 docs / 31.5MB) it killed 13 readable
// docs as "inline budget exceeded" — the engine deep-read only 15/33. This is the
// SAME class of bug FA-INGEST3 fixed for the PAGE budget (text-deliverable docs
// dropped for a vision-era ceiling); the BYTE budget was missed. Under FA-INGEST1
// text-first delivery a text doc costs TOKENS, not inline base64 bytes — so the
// inline-bytes ceiling is the wrong pre-download metric. Fix: the pre-download gate
// now enforces only a GENEROUS download-sanity guard (this constant); the real
// ceilings are the post-extraction, text-aware PAGE (vision-only) + TOKEN budgets
// below, plus the per-call count_tokens guard. Scanned docs (e.g. SF-30 amendment
// covers) are OCR'd to text by extractText (PR #88 + worker ocrmypdf, FA-INGEST4)
// so they ride cheap instead of consuming inline bytes. 80MB stops only pathological
// download dumps; a normal large package (≤MAX_DOCS, ~30MB) ingests in full.
export const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
// FA-119 Phase 2B: the API enforced a 600-PAGE ceiling in production on
// 2026-06-15 (trace req_011Cc5c19aV7pZng2C1J99ok) — a payload-400 that HARD-
// FAILS the run (unlike an empty-JSON call-3 collapse). Bytes (15MB) do NOT
// bound pages: a page-dense spec is small in MB. Promoting the work statement
// + specs (FA-119 Phase 2) raised the page-overflow risk. 550 = safety margin
// under 600. Enforced post-download (page count needs the bytes), in tier
// order, with the form exempt — so generic attachments drop first.
export const MAX_TOTAL_PAGES = 550;
// Token budget (regression fix 2026-06-21, N4008526R0065): the byte (15MB) and
// page (550pp) ceilings do NOT bound TOKENS. A dense Section C plus the ingested
// ELINS inventory .xlsx produced ~1.14M tokens of assembled prompt — over the
// 1,000,000 model context max — so the audit HARD-FAILED with
// `Claude API 400: prompt is too long`. Bytes don't bound tokens (page-dense
// text is small in MB) and pages don't either (a wrapped .xlsx is one "page" of
// huge text). MAX_TOTAL_TOKENS caps the assembled DOCUMENT text at ~700k,
// leaving headroom under the 1M model max for the system/prompt template, the
// multi-call structure, and the output. Enforced post-download in tier order
// (the primary solicitation + §C/§L/§M survive first); overflow is FLAGGED in
// the same honest ingestion banner, never silent.
// FA-INGEST2 (2026-06-21): raised 700k → 850k. With FA-INGEST1 text-first delivery
// the assembled document text is the dominant (and now far smaller) cost, and the
// per-call token guard trims deterministically to keep each request under the 1M
// context — so 850k of document text + system/template/output stays safely under
// the guard's budget while ingesting more of large packages. The guard, not this
// constant, is the hard ceiling.
export const MAX_TOTAL_TOKENS = 850_000;
// Per-doc cap: a single giant file (e.g. the ELINS inventory .xlsx) must not
// consume the whole budget and starve the primary solicitation. Any one doc is
// truncated to at most this many tokens (with an honest "(truncated)" note), so
// one huge member can never evict §C/§L/§M.
export const MAX_DOC_TOKENS = 250_000;
// FA-INGEST4 (2026-06-22) — INLINE VISION byte budget. The 32MB-per-request
// Anthropic hard limit is on the base64-ENCODED payload (base64 inflates raw
// bytes ~33%). Text docs ride as cheap text blocks (token-bounded above); only
// genuinely image-only / scanned docs are delivered as base64 vision blocks —
// and the per-call count_tokens guard trims TEXT, never vision blocks. So an
// image-heavy package (e.g. four 20MB scanned drawing sets) could otherwise
// assemble >32MB of base64 and hard-400 the run. This caps the cumulative
// base64 size of VISION-delivered docs so the assembled request can never breach
// 32MB; text docs are unaffected. ~24MB base64 leaves headroom for the text
// blocks + system/template/output under 32MB. The form is exempt (a single huge
// scanned solicitation is routed via the Files API, not inline). Measured on the
// base64 length, not raw bytes.
export const MAX_INLINE_VISION_BYTES = 24 * 1024 * 1024;
// Cheap token estimate — ~3.5 chars/token (no tokenizer dependency; deliberately
// conservative so we under-fill rather than overflow). Exported for the gate suite.
export const CHARS_PER_TOKEN = 3.5;
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

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
// DTS W51H7226 fix (2026-06-20): a clause / §I / provisions document is
// decision-critical — it lists the binding FAR/DFARS clauses + provisions — and
// must NEVER be evicted as a "generic attachment". The DTS run dropped "Clauses
// and Provisions DTS Recompete.pdf" while keeping duplicate CLIN-structure
// copies. Detect by NAME (deterministic, conservative) and tier it just above
// generic attachments (alongside the work-statement tier) so the budget keeps it
// over checklist/duplicate docs.
const CLAUSE_DOC = /\bclauses?\b|provisions?|\bsection\s*i\b|incorporated by reference/i;
function isClauseDoc(name: string): boolean {
  return CLAUSE_DOC.test(name);
}

// CORE_CONTENT: the highest-value substantive documents — the ones the audit
//   reasons over directly and must NEVER lose a budget slot to a small secondary
//   doc. Section C/L/M, SOW/PWS/SOO, §M Evaluation, §L Instructions, Price
//   Schedule, Wage Determination, CBA, Service-Level Standards, CONFORMED RFP,
//   Section C ANNEXES. (N4008526R0065: the CBA + SLS were being starved by tiny
//   GFP/inventory files; FA301626R0018: the SOW + §M Evaluation likewise.)
// FA-INGEST2 (2026-06-21): the INVENTORY / workload / basis-of-estimate master is
//   the pricing BASIS for a services/custodial bid (square footage, room counts,
//   frequencies) — it prices the whole contract. On N4008526R0065 it sat in
//   SECONDARY (tier 4) tied with the ELIN copies, so the size tie-break dropped it
//   while keeping smaller duplicate ELINs. Promoted to CORE so it never loses a
//   slot to a duplicate line-item sheet or a GFP form.
const CORE_CONTENT =
  /\bstatement of work\b|\bsow\b|\bpws\b|\bsoo\b|performance work statement|statement of (?:work|need|objectives?)|scope of work|project description|bid description|specsintact|\bsection\s*[clmf]\b|\b[clmf]-\d|management and administration|evaluation factors?|\bevaluation\b|basis of award|instructions? (?:to|conditions).{0,30}offerors?|instruction to offerors|notices? to offerors|special contract requirements?|price (?:schedule|list)|wage determination|\bcba\b|collective bargaining|service[\s-]?level|service level standards?|\bconformed\b|custodial|inventory|workload|basis of estimate|\bboe\b|square\s*foot/i;
// SECONDARY_CONTENT: real but supporting content — kept above generic
//   attachments but below the core docs (ELIN/CLIN pricing tables, GFP, specs,
//   annexes, appendix lists). NOTE: inventory/workload moved to CORE (FA-INGEST2).
const SECONDARY_CONTENT =
  /\bclin\b|\belins?\b|government furnished|\bspec(?:ification)?s?\b|\bannexe?s?\b|appendix|\bschedule\b/i;
const CONTENT_DOC = new RegExp(`${CORE_CONTENT.source}|${SECONDARY_CONTENT.source}`, "i");
function isContentDoc(name: string): boolean {
  return CONTENT_DOC.test(name);
}
function isCoreContent(name: string): boolean { return CORE_CONTENT.test(name); }
function isSecondaryContent(name: string): boolean { return SECONDARY_CONTENT.test(name); }

// P0 fix (2026-06-20, N4008526R0065 + FA301626R0018): the cap RANKED bare SF-30
// amendment COVER sheets above real content docs, so the budget ingested 8 of 33
// = ALL SF-30 covers and DROPPED Section C, the CBA wage table, service-level
// standards, §M Evaluation, the SOW, and the price schedule.
//
// isCoverSheet(name): a BARE amendment cover with NO real content signal. Two
//   shapes seen in the live set: the SF-30 "Amendment of Solicitation" title
//   ("…SF 30.pdf") AND the bare "Solicitation Amendment <solnum>NNNN.pdf" /
//   "Amendment 0004.pdf" form (no "SF 30" token). Both are the LOWEST-value
//   members — their substance is re-published in the CONFORMED solicitation /
//   the base solicitation — so they drop FIRST under the cap, not last. A file
//   that also names real core content (CONFORMED RFP, "Revised Section C") is
//   NOT a bare cover and keeps its content tier.
const SF30_MARK = /sf[\s-]?30|amendment of solicitation|amendment\/modification of contract/i;
// "Solicitation Amendment …", "Amendment 0004", "Amendment_0001", "Amd 2", etc.
const BARE_AMD_MARK = /(?:solicitation\s+amendment\b|^amendment\b|^\d+\.\s*amendment\b|\bamendment[\s_]*\d|\bamd[\s_]*\d|_amd_|-amd-)/i;
function isCoverSheet(name: string): boolean {
  if (!SF30_MARK.test(name) && !BARE_AMD_MARK.test(name)) return false;
  // A cover that ALSO names real content (CONFORMED RFP, Revised Section C, a
  // wage/price/CBA table delivered under an amendment) is NOT a bare cover.
  return !isContentDoc(name) && !isClauseDoc(name);
}

// Single ordering key shared by planDocumentOrder + applyBudget so the budget is
// consumed in the same priority both compute. P0 ranking (2026-06-20):
//   0 form (the chosen primary) → 1 clause/§I → 2 CORE content (§C/§L/§M / SOW /
//   price / wage / CBA / SLS / CONFORMED) → 3 secondary content (ELIN/CLIN /
//   inventory / GFP / specs / annexes / appendix) → 4 weak spec → 5 generic
//   attachment → 6 bare amendment/SF-30 cover sheet (FIRST to drop under the
//   cap). Size is only the within-tier tie-break. Core content sits ABOVE
//   secondary so a 3.5MB SOW / 674KB CBA never loses a slot to a tiny GFP or
//   appendix-list file (the exact starvation that dropped the CBA + SLS + SOW).
function documentTier(e: DocumentPlanEntry): number {
  if (e.role === "form") return 0;
  // Bare amendment / SF-30 cover with no real content → lowest value, drop first.
  if (isCoverSheet(e.name)) return 7;
  // The governing work statement (SOW/PWS/SOO/§C) is the single highest-value
  // attachment — it must outrank every other content doc so it NEVER loses a
  // budget slot (FA301626R0018: the 3.5MB SOW_SpecsIntact dropped under the
  // size tie-break against smaller core docs). Tier 1, ahead of clause lists.
  if (workStatementSignal(e.name) === 2) return 1;
  // Clause/§I/provisions doc — high priority, never a generic attachment.
  if (isClauseDoc(e.name)) return 2;
  if (isCoreContent(e.name)) return 3;        // §L/§M / price / wage / CBA / SLS / CONFORMED
  if (isSecondaryContent(e.name)) return 4;   // ELIN/CLIN / inventory / GFP / specs / annexes
  if (workStatementSignal(e.name) === 1) return 5; // weak: spec/requirements/scope keyword
  return 6;                                   // generic attachment
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
  // W15QKN roof RFQ fix (2026-06-20): a real solicitation/RFQ doc must OUTRANK an
  // SF-30 amendment for primary. An SF-30's only form-signal is "amendment of
  // solicitation"/SF-30; a doc that names itself a solicitation/RFQ or a real
  // cover form (SF-1449/1442/33/18) is the true primary and must win. The SF-30
  // becomes primary ONLY when no real solicitation/RFQ doc exists in the set.
  const REAL_SOL_FORM = /\bsolicitation\b|\brf[qp]\b|sf[\s-]?1449|sf[\s-]?1442|sf[\s-]?33\b|sf[\s-]?0?18\b/i;
  const isSf30Only = (n: string): boolean =>
    /sf[\s-]?30|amendment of solicitation|amendment\/modification of contract/i.test(n) &&
    !REAL_SOL_FORM.test(n);
  const formStrength = (e: DocumentPlanEntry): number => {
    if (e.role !== "form") return 0;
    const nn = norm(e.name);
    // P0 fix (2026-06-20): a bare SF-30 amendment cover is the WEAKEST form even
    // when it carries the sol number (it is "Solicitation Amendment …SF 30.pdf",
    // so it matches \bsolicitation\b AND nn.includes(solNorm)). Without this,
    // the N4008526R0065 SF-30 covers tied the real solicitation at strength 4
    // and the smallest cover won the size tie-break as primary. isCoverSheet
    // (no real content) demotes it below every genuine solicitation body.
    if (isCoverSheet(e.name)) return 0;
    // An SF-30-only amendment is the WEAKEST form (loses to any real sol/RFQ).
    if (isSf30Only(e.name)) return 0;
    if (solNorm && nn.includes(solNorm)) return 4;
    if (/\bsolicitation\b/i.test(e.name)) return 3;
    if (REAL_SOL_FORM.test(e.name)) return 2; // RFQ/RFP or SF cover form
    return 1; // some other form signal, still above SF-30-only (0)
  };
  // P0 fix (2026-06-20): keep ONLY the single strongest form-classified entry as
  // the FORM; demote every other form-tier candidate (the 8 SF-30 covers in the
  // N4008526R0065 set all clear isForm via the sol-number substring) back to its
  // natural role so documentTier ranks them as cover sheets — first to drop, not
  // hogging tier-0 above Section C / CBA / SLS / ELIN. The winner is the highest
  // formStrength, size-ascending then name as deterministic tie-breaks.
  const formCandidates = planned.filter((e) => e.role === "form");
  if (formCandidates.length > 1) {
    const winner = [...formCandidates].sort((a, b) =>
      formStrength(b) - formStrength(a) ||
      (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity) ||
      a.name.localeCompare(b.name)
    )[0];
    for (const e of planned) {
      if (e.role === "form" && e !== winner) {
        // Restore the natural role so cover/amendment tiering applies.
        e.role = isAmendment(e.name) ? "amendment" : "attachment";
      }
    }
  }
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

// DTS W51H7226 fix (2026-06-20): near-duplicate detection so two copies of the
// same doc don't both consume budget slots (the DTS set kept TWO "RFQ … CLIN
// Structure" copies, one base + one amendment, evicting distinct critical docs).
// Normalize a filename for similarity: drop extension, amendment/version tokens,
// punctuation, and collapse whitespace. Two entries collide ONLY when their
// normalized names are identical — conservative, so only CLEAR duplicates merge.
function dedupeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "") // strip extension
    // amendment / version / revision tokens (and any trailing number)
    .replace(/\b(?:amendment|amend|amd|modification|mod|revision|rev|version|ver|v|final|draft|copy|conformed|updated?)\b[\s_.\-]*\d*/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

// Drop near-identical files BEFORE the budget. Among entries sharing a dedupeKey
// keep ONE — prefer the larger (an amendment supersedes its base and is usually
// bigger); size-unknown sorts last; name as the final deterministic tie-break.
// Dropped duplicates are returned so the caller can record the loud overflow.
// Pure + exported for the gate suite.
export function dedupeNearDuplicates(plan: DocumentPlanEntry[]): {
  kept: DocumentPlanEntry[];
  dropped: Array<{ entry: DocumentPlanEntry; reason: string }>;
} {
  const groups = new Map<string, DocumentPlanEntry[]>();
  for (const e of plan) {
    const k = dedupeKey(e.name);
    // Empty key (name had no alphanumerics after normalization) → never group.
    if (!k) { groups.set(`__unique_${e.resourceId}`, [e]); continue; }
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }
  const kept: DocumentPlanEntry[] = [];
  const dropped: Array<{ entry: DocumentPlanEntry; reason: string }> = [];
  for (const g of groups.values()) {
    if (g.length === 1) { kept.push(g[0]); continue; }
    const ranked = [...g].sort((a, b) =>
      (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1) || a.name.localeCompare(b.name)
    );
    kept.push(ranked[0]);
    for (const d of ranked.slice(1)) {
      dropped.push({ entry: d, reason: `near-duplicate of "${ranked[0].name}" — kept the larger/most-recent copy` });
    }
  }
  // Preserve the incoming plan order for the kept set (tiering happens later).
  const keptIds = new Set(kept.map((k) => k.resourceId));
  return { kept: plan.filter((e) => keptIds.has(e.resourceId)), dropped };
}

// P0 fix (2026-06-20): .docx/.xlsx members are now INGESTIBLE — they are
// extracted to text and wrapped into a PDF buffer downstream (see
// extractNonPdfText + textToPdfBuffer), so §M evaluation addenda, price
// schedules, ELIN/CLIN pricing and wage tables (frequently delivered as
// .docx/.xlsx) reach the section/clause/fact extractors. Other non-PDF types
// (.zip drawing dumps, images) stay non-ingestible.
const INGESTIBLE_EXT = /\.(pdf|docx|xlsx)$/i;

// Budget application — pure, exported for the gate suite. Decides which plan
// entries get downloaded BEFORE any bytes move. PDF + .docx/.xlsx members are
// ingestible in the multi-set; unknown sizes are skipped (never gamble the
// budget on an unsized file beyond the form). Near-duplicate files are deduped
// first so duplicate copies never consume slots that distinct docs need.
export function applyBudget(plan: DocumentPlanEntry[], maxDocs = MAX_DOCS, maxTotal = MAX_DOWNLOAD_BYTES): {
  ingest: DocumentPlanEntry[];
  skipped: Array<{ entry: DocumentPlanEntry; reason: string }>;
} {
  const ingest: DocumentPlanEntry[] = [];
  const skipped: Array<{ entry: DocumentPlanEntry; reason: string }> = [];
  let total = 0;
  // DTS W51H7226 fix — collapse near-duplicates before filling; dropped copies
  // are carried into `skipped` so the overflow record stays loud.
  const { kept: dedupedPlan, dropped } = dedupeNearDuplicates(plan);
  skipped.push(...dropped);
  // Fill order (FA-119): documentTier primary — form → amendment → strong work
  // statement → weak spec → generic attachment — with size-ASCENDING as the
  // tie-break WITHIN each tier (a compact 540KB PWS beats a 40MB drawing dump,
  // and a real work statement is never re-bumped by a large spec set). This
  // replaces the prior pure size-ascending fill, which starved the budget by
  // ingesting trivial small files (sign-in sheets, tiny DID forms) and dropping
  // the governing work statement. Everything skipped is named in the overflow
  // flag.
  const fillOrder = [...dedupedPlan].sort((a, b) =>
    documentTier(a) - documentTier(b) ||
    (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity) ||
    a.name.localeCompare(b.name)
  );
  for (const e of fillOrder) {
    if (!INGESTIBLE_EXT.test(e.name)) { skipped.push({ entry: e, reason: "unsupported attachment type (not PDF/DOCX/XLSX)" }); continue; }
    if (e.sizeBytes == null) { skipped.push({ entry: e, reason: "size unknown — excluded from budget" }); continue; }
    if (ingest.length >= maxDocs) { skipped.push({ entry: e, reason: `document cap (${maxDocs}) reached` }); continue; }
    if (total + e.sizeBytes > maxTotal) { skipped.push({ entry: e, reason: `download budget (${Math.round(maxTotal / 1048576)}MB) exceeded` }); continue; }
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

// Convert a downloaded/local member to an inline-ready PDF Buffer. A native PDF
// passes the %PDF magic-byte check and is returned as-is. A .docx/.xlsx is
// extracted to text and wrapped into a PDF (P0 fix 2026-06-20) so it rides the
// same inline-PDF + pdf-parse ingestion path. Anything else → null (honest
// fallback; the caller flags it, never fabricates).
async function normalizeToPdf(name: string, raw: Buffer): Promise<Buffer | null> {
  if (raw.subarray(0, 4).toString("latin1") === "%PDF") return raw;
  if (nonPdfKind(name)) {
    const text = await extractNonPdfText(name, raw);
    if (text) return textToPdfBuffer(text, name);
  }
  return null;
}

async function downloadPdf(url: string, name = ""): Promise<Buffer | null> {
  try {
    const u = url.includes("api_key=") ? url : `${url}${url.includes("?") ? "&" : "?"}api_key=${SAM_API_KEY}`;
    const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // %PDF magic byte → native PDF; else route .docx/.xlsx through extraction.
    return await normalizeToPdf(name, buf);
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

// Token estimate for a (PDF) buffer: extract the text and estimate via
// CHARS_PER_TOKEN. This mirrors what Anthropic actually charges for an inline
// PDF (the text content dominates), and it's the same text the section/clause
// extractors already read — so the estimate tracks the real prompt cost. An
// extraction failure yields a conservative non-zero estimate from the raw byte
// length so an unreadable doc never silently counts as 0 tokens.
async function estimateDocTokens(buf: Buffer): Promise<{ tokens: number; text: string }> {
  try {
    const extracted = await extractText(buf);
    const text = extracted.rawText ?? "";
    if (text.length > 0) return { tokens: estimateTokensFromChars(text.length), text };
  } catch {
    /* fall through to the byte-length estimate */
  }
  // No usable text (scanned/image PDF, parse failure): a vision-rendered page is
  // far cheaper than its base64 byte length, but we still want a non-zero, safe
  // figure. Use raw bytes / CHARS_PER_TOKEN as a conservative ceiling.
  return { tokens: estimateTokensFromChars(buf.length), text: "" };
}

// Truncate a doc to a token budget. We have the extracted `text`; keep the
// leading portion that fits `maxDocTokens` (the head of a solicitation doc holds
// the binding terms — schedule, clauses, scope — far more than the tail of a
// long inventory table), append an honest truncation note, and re-wrap to a PDF
// buffer so it rides the same inline-PDF ingestion path. If we have no text
// (image PDF), we cannot safely truncate the bytes — return the original so the
// page budget remains the only bound on it.
function truncateDocToTokens(name: string, buf: Buffer, text: string, maxDocTokens: number): Buffer {
  if (!text) return buf;
  const maxChars = Math.floor(maxDocTokens * CHARS_PER_TOKEN);
  if (text.length <= maxChars) return buf;
  const note = `\n\n[… document truncated to fit the analysis token budget — full file on SAM.gov …]`;
  const head = text.slice(0, Math.max(0, maxChars - note.length));
  return textToPdfBuffer(head + note, `${name} (truncated)`);
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

// Token budget — pure + exported for the gate suite. Runs AFTER download/extract
// (token count needs the document text) over the byte/doc/page-budgeted set, in
// tier order (planDocumentOrder output, so the primary solicitation + §C/§L/§M
// are evaluated first and survive). Two guards:
//   1. Per-doc cap (maxDocTokens): a single oversized doc (e.g. the ELINS
//      inventory .xlsx) is TRUNCATED to its token cap so it can't consume the
//      whole budget and starve the core solicitation. The kept entry reports
//      `truncatedToTokens` (and `truncated: true`) so the caller can trim the
//      actual text + note "(truncated)" in the banner.
//   2. Cumulative cap (maxTotalTokens): once the running total (using each doc's
//      possibly-truncated contribution) would exceed the ceiling, later (lower-
//      tier) docs are SKIPPED — flagged loudly, never silent.
// The form/primary is EXEMPT from the cumulative cap (it is the solicitation and
// must never be dropped) but is STILL subject to the per-doc truncation guard so
// a pathologically huge primary can't by itself blow the model context.
export function applyTokenBudget<T extends { role: DocumentPlanEntry["role"]; tokens: number; name?: string }>(
  docs: T[],
  maxTotalTokens = MAX_TOTAL_TOKENS,
  maxDocTokens = MAX_DOC_TOKENS
): {
  ingest: Array<T & { truncated: boolean; truncatedToTokens?: number }>;
  skipped: Array<{ entry: T; reason: string }>;
} {
  const ingest: Array<T & { truncated: boolean; truncatedToTokens?: number }> = [];
  const skipped: Array<{ entry: T; reason: string }> = [];
  let total = 0;
  for (const d of docs) {
    const truncated = d.tokens > maxDocTokens;
    const contribution = truncated ? maxDocTokens : d.tokens;
    const isForm = d.role === "form";
    if (!isForm && total + contribution > maxTotalTokens) {
      skipped.push({ entry: d, reason: `token budget (${Math.round(maxTotalTokens / 1000)}k tokens) exceeded` });
      continue;
    }
    total += contribution;
    ingest.push(truncated ? { ...d, truncated: true, truncatedToTokens: maxDocTokens } : { ...d, truncated: false });
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
  // Pass 1: download + page-count + token-estimate every byte/doc-budgeted
  // member, in tier order.
  const files: IngestionFileMeta[] = [];
  const fetched: Array<{ entry: DocumentPlanEntry; base64: string; buffer: Buffer; pages: number; tokens: number; text: string }> = [];
  for (const e of plan) {
    const planned = ingest.find((i) => i.resourceId === e.resourceId);
    if (!planned) {
      const skip = skipped.find((s) => s.entry.resourceId === e.resourceId);
      files.push({ name: e.name, role: e.role, bytes: e.sizeBytes, ingested: false, reason: skip?.reason ?? "not planned" });
      continue;
    }
    const buf = await downloadPdf(e.url, e.name);
    if (!buf) {
      files.push({ name: e.name, role: e.role, bytes: e.sizeBytes, ingested: false, reason: nonPdfKind(e.name) ? "text extraction failed (.docx/.xlsx)" : "download failed or not a PDF" });
      continue;
    }
    const { tokens, text } = await estimateDocTokens(buf);
    fetched.push({ entry: e, base64: buf.toString("base64"), buffer: buf, pages: await countPdfPages(buf), tokens, text });
  }
  // Pass 2: trim by the page ceiling — but ONLY for VISION-delivered docs.
  // FA-INGEST3 (2026-06-21): the ~600-page API ceiling that MAX_TOTAL_PAGES guards
  // applies to base64-PDF VISION blocks (page-images). After FA-INGEST1, any doc
  // with substantial extractable text rides as a TEXT block instead — it has NO
  // page cost, only token cost (bounded by the token budget below + the per-call
  // guard). The page budget was running BEFORE the text/vision decision and
  // dropping text-deliverable docs for a limit that never applies to them
  // (N4008526R0065: 11 of 33 ingested while the ELINs/amendments rode as text).
  // Fix: text-deliverable docs contribute 0 pages → never page-dropped; only
  // genuinely image-only docs consume the page budget. No added cost — same single
  // call-set, the text just rides in the cache-controlled prefix.
  // Text-vs-vision decision shared with the engine (single source of truth in
  // pdf-text-extractor) so the page-exemption here can never drift from how the
  // engine actually delivers the doc.
  const isTextDeliverable = (f: { text: string }): boolean =>
    !!f.text && !f.text.startsWith("[PDF_EXTRACTION_FAILED") && meaningfulCharCount(f.text) >= MIN_TEXT_CHARS_FOR_TEXT_BLOCK;
  const { ingest: pageKept } = applyPageBudget(
    fetched.map((f) => ({ resourceId: f.entry.resourceId, role: f.entry.role, name: f.entry.name, pages: isTextDeliverable(f) ? 0 : f.pages })),
    MAX_TOTAL_PAGES
  );
  const pageKeptIds = new Set(pageKept.map((k) => k.resourceId));
  // Pass 2b — TOKEN ceiling (regression fix 2026-06-21): the byte + page budgets
  // do NOT bound tokens, so a dense set could still exceed the 1M model context
  // (N4008526R0065 hit 1.14M → hard 400). Over the page-kept set, in tier order
  // (primary first, form exempt), cap the assembled DOCUMENT text at ~850k and
  // truncate any single oversized doc to ~250k so one huge file can't starve the
  // core solicitation.
  const tokenInputs = fetched.filter((f) => pageKeptIds.has(f.entry.resourceId));
  const { ingest: tokenKept, skipped: tokenSkipped } = applyTokenBudget(
    tokenInputs.map((f) => ({ resourceId: f.entry.resourceId, role: f.entry.role, name: f.entry.name, tokens: f.tokens })),
    MAX_TOTAL_TOKENS,
    MAX_DOC_TOKENS
  );
  const tokenKeptById = new Map(tokenKept.map((k) => [k.resourceId, k]));
  const tokenSkippedIds = new Set(tokenSkipped.map((s) => s.entry.resourceId));
  // Pass 3: build the ingested set + the loud per-file record.
  const downloaded: Array<{ name: string; base64: string; buffer: Buffer; role: DocumentPlanEntry["role"] }> = [];
  // FA-INGEST4: cumulative base64 size of VISION-delivered (image-only) docs.
  // The count_tokens guard trims text, never vision blocks, so this is the only
  // bound on the 32MB-per-request inline payload. Text docs don't count.
  let visionBase64Bytes = 0;
  for (const f of fetched) {
    const kept = tokenKeptById.get(f.entry.resourceId);
    if (kept) {
      // Apply per-doc truncation when the token budget flagged this doc.
      const buf = kept.truncated ? truncateDocToTokens(f.entry.name, f.buffer, f.text, MAX_DOC_TOKENS) : f.buffer;
      const base64 = buf === f.buffer ? f.base64 : buf.toString("base64");
      // A doc with no meaningful extractable text rides as a base64 VISION block
      // (the engine's textForDocOrNull would return null). The form is exempt — a
      // single huge scanned solicitation is handled via the Files-API path, not here.
      const isVisionDoc = f.entry.role !== "form" && !isTextDeliverable(f);
      if (isVisionDoc && visionBase64Bytes + base64.length > MAX_INLINE_VISION_BYTES) {
        files.push({ name: f.entry.name, role: f.entry.role, bytes: f.entry.sizeBytes, ingested: false, reason: `inline image budget (${Math.round(MAX_INLINE_VISION_BYTES / 1048576)}MB) exceeded — scanned/image doc (keeps the request under the 32MB API limit)` });
        continue;
      }
      if (isVisionDoc) visionBase64Bytes += base64.length;
      const displayName = kept.truncated && buf !== f.buffer ? `${f.entry.name} (truncated)` : f.entry.name;
      downloaded.push({ name: displayName, base64, buffer: buf, role: f.entry.role });
      files.push({ name: displayName, role: f.entry.role, bytes: buf.length, ingested: true, ...(kept.truncated && buf !== f.buffer ? { reason: `truncated to ~${Math.round(MAX_DOC_TOKENS / 1000)}k tokens to fit the analysis budget` } : {}) });
    } else if (tokenSkippedIds.has(f.entry.resourceId)) {
      files.push({ name: f.entry.name, role: f.entry.role, bytes: f.entry.sizeBytes, ingested: false, reason: `token budget (${Math.round(MAX_TOTAL_TOKENS / 1000)}k tokens) exceeded` });
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
    ...(skippedCount > 0 ? { overflow: `${skippedCount} of ${plan.length} files not ingested (budget: ${MAX_DOCS} docs / ${Math.round(MAX_TOTAL_TOKENS / 1000)}k tokens / ${MAX_TOTAL_PAGES}pp vision / ${Math.round(MAX_DOWNLOAD_BYTES / 1048576)}MB download; PDF + .docx/.xlsx read as text, scanned PDFs OCR'd, other types not)` } : {}),
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

  // Pass 1: page-count + token-estimate every byte/doc-budgeted member (bytes
  // already local).
  const files: IngestionFileMeta[] = [];
  const counted: Array<{ entry: DocumentPlanEntry; base64: string; buffer: Buffer; pages: number; tokens: number; text: string }> = [];
  for (const e of plan) {
    const planned = ingest.find((i) => i.resourceId === e.resourceId);
    if (!planned) {
      const skip = skipped.find((s) => s.entry.resourceId === e.resourceId);
      files.push({ name: e.name, role: e.role, bytes: e.sizeBytes, ingested: false, reason: skip?.reason ?? "not planned" });
      continue;
    }
    const raw = bufById.get(e.resourceId);
    // P0 fix (2026-06-20): a native PDF passes the %PDF check; a .docx/.xlsx is
    // extracted to text + wrapped into a PDF so it ingests like the SAM arm.
    const buf = raw ? await normalizeToPdf(e.name, raw) : null;
    if (!buf) {
      files.push({ name: e.name, role: e.role, bytes: e.sizeBytes, ingested: false, reason: nonPdfKind(e.name) ? "text extraction failed (.docx/.xlsx)" : "not a valid PDF (magic-byte check)" });
      continue;
    }
    const { tokens, text } = await estimateDocTokens(buf);
    counted.push({ entry: e, base64: buf.toString("base64"), buffer: buf, pages: await countPdfPages(buf), tokens, text });
  }
  // Pass 2: trim by the page ceiling (form exempt → generics drop first).
  const { ingest: pageKept } = applyPageBudget(
    counted.map((c) => ({ resourceId: c.entry.resourceId, role: c.entry.role, name: c.entry.name, pages: c.pages })),
    MAX_TOTAL_PAGES
  );
  const pageKeptIds = new Set(pageKept.map((k) => k.resourceId));
  // Pass 2b — TOKEN ceiling (regression fix 2026-06-21): see assembleSamDocumentSet.
  const tokenInputs = counted.filter((c) => pageKeptIds.has(c.entry.resourceId));
  const { ingest: tokenKept, skipped: tokenSkipped } = applyTokenBudget(
    tokenInputs.map((c) => ({ resourceId: c.entry.resourceId, role: c.entry.role, name: c.entry.name, tokens: c.tokens })),
    MAX_TOTAL_TOKENS,
    MAX_DOC_TOKENS
  );
  const tokenKeptById = new Map(tokenKept.map((k) => [k.resourceId, k]));
  const tokenSkippedIds = new Set(tokenSkipped.map((s) => s.entry.resourceId));
  // Pass 3: build the ingested set + the loud per-file record.
  const ingested: Array<{ name: string; base64: string; buffer: Buffer; role: DocumentPlanEntry["role"] }> = [];
  // FA-INGEST4: same inline VISION byte cap as the SAM arm (keep the assembled
  // request under the 32MB API limit; the count_tokens guard trims text, never
  // vision blocks). Text docs don't count; the form is exempt.
  const isTextDeliverable = (t: string): boolean =>
    !!t && !t.startsWith("[PDF_EXTRACTION_FAILED") && meaningfulCharCount(t) >= MIN_TEXT_CHARS_FOR_TEXT_BLOCK;
  let visionBase64Bytes = 0;
  for (const c of counted) {
    const kept = tokenKeptById.get(c.entry.resourceId);
    if (kept) {
      const buf = kept.truncated ? truncateDocToTokens(c.entry.name, c.buffer, c.text, MAX_DOC_TOKENS) : c.buffer;
      const base64 = buf === c.buffer ? c.base64 : buf.toString("base64");
      const isVisionDoc = c.entry.role !== "form" && !isTextDeliverable(c.text);
      if (isVisionDoc && visionBase64Bytes + base64.length > MAX_INLINE_VISION_BYTES) {
        files.push({ name: c.entry.name, role: c.entry.role, bytes: c.entry.sizeBytes, ingested: false, reason: `inline image budget (${Math.round(MAX_INLINE_VISION_BYTES / 1048576)}MB) exceeded — scanned/image doc (keeps the request under the 32MB API limit)` });
        continue;
      }
      if (isVisionDoc) visionBase64Bytes += base64.length;
      const displayName = kept.truncated && buf !== c.buffer ? `${c.entry.name} (truncated)` : c.entry.name;
      ingested.push({ name: displayName, base64, buffer: buf, role: c.entry.role });
      files.push({ name: displayName, role: c.entry.role, bytes: buf.length, ingested: true, ...(kept.truncated && buf !== c.buffer ? { reason: `truncated to ~${Math.round(MAX_DOC_TOKENS / 1000)}k tokens to fit the analysis budget` } : {}) });
    } else if (tokenSkippedIds.has(c.entry.resourceId)) {
      files.push({ name: c.entry.name, role: c.entry.role, bytes: c.entry.sizeBytes, ingested: false, reason: `token budget (${Math.round(MAX_TOTAL_TOKENS / 1000)}k tokens) exceeded` });
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
    ...(skippedCount > 0 ? { overflow: `${skippedCount} of ${plan.length} files not ingested (budget: ${MAX_DOCS} docs / ${Math.round(MAX_TOTAL_TOKENS / 1000)}k tokens / ${MAX_TOTAL_PAGES}pp vision / ${Math.round(MAX_DOWNLOAD_BYTES / 1048576)}MB download; PDF + .docx/.xlsx read as text, scanned PDFs OCR'd, other types not)` } : {}),
    files: files.map((f) => ({ ...f, section_roles: f.role === "attachment" ? classifySectionRoles(f.name) : [] })),
  };
  return {
    primary: primary ? { name: primary.name, base64: primary.base64, buffer: primary.buffer } : null,
    attachments: attachments.map((a) => ({ name: a.name, base64: a.base64, buffer: a.buffer })),
    ingestion
  };
}
