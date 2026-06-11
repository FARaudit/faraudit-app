// Cycle 2 v2 — Render the 5 new surfaces into the template
//
// Pure function: takes the static _template.html string + an AuditV2Result-
// shaped view-model, returns HTML with the 5 V2 surface markers populated:
//   1. §03-HEAD work-statement reveal (known vs unknown variant)
//   2. §04 clause-matrix rollup (tally + required cards + reference expander)
//   3. §09 6-bucket pre-flight (data-driven critical styling)
//   4. L02 band (post hero-dedup cards)
//   5. Verification notes (footnote rows, auto-hide when empty)
//
// Determinism property: renderV2Surfaces(template, vm) is a pure function.
// Same inputs → byte-identical output. Verified by test/verify-v2-render-determinism.ts.

import type {
  WorkStatementKnown,
  WorkStatementUnknown,
  MatrixRollupReshaped,
  ChecklistBucketGroup,
  ClauseMatrixRow,
  MatrixBadge,
} from "./_normalizers";
import type { AuditL02Catch, AuditConfidenceNote } from "../../../lib/audit-judgment";
import type {
  MetadataBrief,
  SubmissionChecklistItem,
  RecompeteSignal,
  PriceAnchor,
} from "../../../lib/audit-engine";

export interface V2RenderInput {
  work_statement: WorkStatementKnown | null;
  work_statement_unknown: WorkStatementUnknown | null;
  matrix_rollup: MatrixRollupReshaped;
  submission_checklist_filtered: ChecklistBucketGroup[];
  l02_catches: AuditL02Catch[];
  confidence_notes: AuditConfidenceNote[];
  has_incumbent: boolean;
  // Extended surfaces (Fix 8 / 12 / 13 / 14) — optional, absent on legacy
  // pre-Fork-2 v2_shadow rows or non-PDF paths. Renderers using these MUST
  // null-check before reading.
  metadata_brief?: MetadataBrief | null;
  submission_preflight?: SubmissionChecklistItem[] | null;
  recompete_signal?: RecompeteSignal | null;
  price_anchor?: PriceAnchor | null;
}

// FA-127b — single trap derivation. The trap-tally chip, the matrix TRAP
// badges (with their "See §04 trap" pointers), and the §04 flag cards must
// all count the same clauses. §04 renders dfars_flags that are detected,
// P0/P1 after severity normalization, AND carry real content (description or
// required_action) — mirror of mapComplianceFlags/pickSeverity in
// _view-model.ts. A TRAP badge whose clause is not in this set points at a
// §04 card that doesn't exist, so such rows render as plain "required".
function sec04TrapClauses(
  comp: Record<string, unknown>
): Map<string, { title: string; reason: string | null }> {
  const flags = Array.isArray(comp.dfars_flags)
    ? (comp.dfars_flags as Array<{
        clause?: string;
        title?: string;
        severity?: string;
        description?: string;
        required_action?: string;
        detected?: boolean;
      } | null>)
    : [];
  const map = new Map<string, { title: string; reason: string | null }>();
  for (const f of flags) {
    if (!f || f.detected !== true) continue;
    const sev = String(f.severity ?? "").toUpperCase();
    if (sev === "P2" || sev === "LOW" || sev === "ADVISORY") continue;
    const description = String(f.description ?? "").trim();
    const requiredAction = String(f.required_action ?? "").trim();
    if (description.length === 0 && requiredAction.length === 0) continue;
    const num = String(f.clause ?? "").trim();
    if (num) map.set(num, { title: String(f.title ?? "").trim(), reason: description || requiredAction || null });
  }
  return map;
}

// ─── V2 cutover adapter ────────────────────────────────────────────────────
// Reads compliance_json.v2_shadow.surfaces from an audit row and shapes it
// into V2RenderInput. Returns null when v2_shadow is absent (V1-only audit;
// caller should skip the V2 overlay and render V1 only).
//
// Null-safe per field: malformed/missing surfaces collapse to safe defaults
// rather than throwing inside the render path. The renderer's existing
// stripIfEmpty + null-checks handle the resulting empty objects gracefully.
//
// Pure function · deterministic · zero side effects.
export function buildV2ViewModelFromShadow(
  audit: Record<string, unknown> | null | undefined
): V2RenderInput | null {
  if (!audit || typeof audit !== "object") return null;
  const comp = audit.compliance_json as Record<string, unknown> | undefined;
  if (!comp || typeof comp !== "object") return null;
  const shadow = comp.v2_shadow as Record<string, unknown> | undefined;
  if (!shadow || typeof shadow !== "object") return null;
  const surfaces = shadow.surfaces as Record<string, unknown> | undefined;
  if (!surfaces || typeof surfaces !== "object") return null;

  return {
    work_statement: (surfaces.work_statement as WorkStatementKnown | null) ?? null,
    work_statement_unknown: (surfaces.work_statement_unknown as WorkStatementUnknown | null) ?? null,
    matrix_rollup: ((): MatrixRollupReshaped => {
      // FA-127b: TRAP badges derive solely from the §04-rendered flag set.
      const trapMap = sec04TrapClauses(comp);
      const rebadge = (rows: ClauseMatrixRow[]): ClauseMatrixRow[] =>
        rows.map((r) => {
          const num = String(r.number ?? "").trim();
          const trap = trapMap.get(num);
          if (trap) {
            return { ...r, badge: "trap" as MatrixBadge, trapReason: r.trapReason ?? trap.reason };
          }
          return r.badge === "trap"
            ? { ...r, badge: "required" as MatrixBadge, trapReason: null }
            : r;
        });
      // FA-103 fix: fall back to V1 clause lists when V2 extraction returned empty
      const v2m = surfaces.matrix_rollup as MatrixRollupReshaped | undefined;
      if (v2m && (v2m.required.length > 0 || v2m.reference.length > 0)) {
        const required = rebadge(v2m.required);
        const reference = rebadge(v2m.reference);
        // A §04-rendered trap that V2's extraction omitted from the matrix
        // would leave the tally chip > TRAP-badged rows. Append it — every
        // trap card in §04 must have a matrix row (SPRTA1 re-run: 252.211-7003
        // IUID was a §04 trap but absent from the V2 required list).
        const present = new Set(
          [...required, ...reference].map((r) => String(r.number ?? "").trim())
        );
        for (const [num, trap] of trapMap) {
          if (!present.has(num)) {
            required.push({ number: num, title: trap.title, badge: "trap" as MatrixBadge, trapReason: trap.reason });
          }
        }
        return { ...v2m, required, reference };
      }
      const dfars: string[] = Array.isArray(comp.dfars_clauses) ? (comp.dfars_clauses as string[]) : [];
      const far: string[] = Array.isArray(comp.far_clauses) ? (comp.far_clauses as string[]) : [];
      // FA-134: dfars_flags is the full 13-row hardcoded trap table with a
      // `detected` boolean — only detected rows are real findings. Severity
      // values are P0/P1/P2 (not HIGH/CRITICAL) and the clause number lives
      // in `clause` (not `clause_number`).
      const allFlags = Array.isArray(comp.dfars_flags) ? (comp.dfars_flags as Array<{clause?:string;title?:string;severity?:string;description?:string;detected?:boolean}>) : [];
      const flags = allFlags.filter((f) => f?.detected === true);
      if (dfars.length === 0 && far.length === 0 && flags.length === 0) {
        return { required: [], reference: [], reference_count: 0 };
      }
      const required: ClauseMatrixRow[] = flags.map((f) => {
        // FA-127b: severity alone is not enough — badge TRAP only when the
        // clause survives the §04 content filter, so every "See §04 trap"
        // pointer resolves to a rendered flag card.
        const num = String(f.clause ?? "").trim();
        const trap = trapMap.get(num);
        return {
          number: f.clause ?? "",
          title: f.title ?? "",
          badge: (trap ? "trap" : "required") as MatrixBadge,
          trapReason: trap ? (trap.reason ?? f.title ?? null) : null,
        };
      });
      const flagNums = new Set(flags.map((f) => f.clause ?? ""));
      dfars.forEach((c) => {
        const num = typeof c === "string" ? c : ((c as { number?: string }).number ?? "");
        if (num && !flagNums.has(num)) {
          required.push({ number: num, title: "", badge: "required" as MatrixBadge, trapReason: null });
        }
      });
      const reference: ClauseMatrixRow[] = far.map((c) => ({
        number: typeof c === "string" ? c : ((c as { number?: string }).number ?? ""),
        title: typeof c === "string" ? "" : ((c as { title?: string }).title ?? ""),
        badge: "reference" as MatrixBadge,
        trapReason: null,
      }));
      return { required, reference, reference_count: reference.length };
    })(),
    submission_checklist_filtered: ((): ChecklistBucketGroup[] => {
      const v2ck = Array.isArray(surfaces.submission_checklist_filtered)
        ? (surfaces.submission_checklist_filtered as ChecklistBucketGroup[])
        : [];
      // FA-139 richer-source guard: V2's checklist can be the 1-item
      // due-date fallback while V1's §L extraction holds dozens of lines
      // (616efb58: §09=1 vs §L=58). Overlaying the poorer list clobbers the
      // richer VM render — suppress the overlay so the renderer's
      // empty-guard keeps the V1-derived checklist.
      const v2Count = v2ck.reduce(
        (n, g) => n + (Array.isArray(g?.items) ? g.items.length : 0),
        0
      );
      const rawReqs = comp.submission_requirements_raw;
      const objReqs = comp.submission_requirements;
      const v1Count = Array.isArray(rawReqs)
        ? rawReqs.filter((s) => typeof s === "string" && s.trim().length > 0).length
        : Array.isArray(objReqs)
        ? objReqs.length
        : 0;
      if (v2Count > 0 && v2Count < v1Count) return [];
      return v2ck;
    })(),
    l02_catches: Array.isArray(surfaces.l02_catches)
      ? (surfaces.l02_catches as AuditL02Catch[])
      : [],
    confidence_notes: suppressContradictedConfidenceNotes(
      Array.isArray(surfaces.confidence_notes)
        ? (surfaces.confidence_notes as AuditConfidenceNote[])
        : [],
      audit as Record<string, unknown>
    ),
    has_incumbent: typeof surfaces.has_incumbent === "boolean" ? surfaces.has_incumbent : false,
    metadata_brief: (surfaces.metadata_brief as MetadataBrief | null) ?? null,
    submission_preflight: Array.isArray(surfaces.submission_preflight)
      ? (surfaces.submission_preflight as SubmissionChecklistItem[])
      : null,
    recompete_signal: (surfaces.recompete_signal as RecompeteSignal | null) ?? null,
    price_anchor: (surfaces.price_anchor as PriceAnchor | null) ?? null,
  };
}

// FA-139 — belt-and-suspenders vnote suppression. A confidence note may
// never contradict content rendered on the same page: if the note's SUBJECT
// (CLINs, §L submission requirements, §M evaluation factors, clause matrix,
// set-aside) is non-empty in the audit row / compliance_json, drop the note.
// Engine-side FA-113 filtering handles fresh runs; this guards the historical
// corpus whose persisted v2_shadow predates the engine fix. Shared by
// buildV2ViewModelFromShadow (rendered notes) and buildViewModel's
// v2_surface_lengths (confidence_count span + strip gating) so the count and
// the rendered rows can never disagree.
export function suppressContradictedConfidenceNotes(
  notes: AuditConfidenceNote[],
  audit: Record<string, unknown>
): AuditConfidenceNote[] {
  if (notes.length === 0) return notes;
  const comp = (audit.compliance_json as Record<string, unknown> | null) ?? {};
  const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  const clinsPresent = len(comp.clins) > 0;
  const reqsPresent =
    len(comp.submission_requirements_raw) > 0 || len(comp.submission_requirements) > 0;
  const evalPresent =
    len(comp.evaluation_factors_raw) > 0 || len(comp.evaluation_factors) > 0;
  const clausesPresent = len(comp.far_clauses) + len(comp.dfars_clauses) > 0;
  const setAsidePresent =
    (typeof audit.set_aside === "string" && audit.set_aside.trim().length > 0) ||
    (typeof comp.set_aside_type === "string" && (comp.set_aside_type as string).trim().length > 0) ||
    (typeof comp.set_aside_text === "string" && (comp.set_aside_text as string).trim().length > 0);
  // Scalar masthead subjects — these render from the audit row / SAM metadata
  // even when absent from the document text, so a "could not be confirmed
  // from the document" note still contradicts the page (1232: NAICS 236220
  // on the masthead beside a NAICS vnote).
  const overview = (audit.overview_json as Record<string, unknown> | null) ?? {};
  const str = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0 && v.trim() !== "—";
  const naicsPresent = str(audit.naics_code) || str(overview.naics_code);
  const solPresent = str(audit.solicitation_number) || str(overview.solicitation_number);
  const deadlinePresent = str(audit.response_deadline) || str(overview.response_deadline);
  const agencyPresent = str(audit.agency) || str(overview.agency);
  const contractTypePresent = str(overview.contract_type);
  const subjects: Array<[RegExp, boolean]> = [
    [/\bclin/i, clinsPresent],
    [/submission|section\s*l\b|checklist|proposal\s+requirements/i, reqsPresent],
    [/evaluation|section\s*m\b/i, evalPresent],
    [/\bclauses?\b|\bdfars\b/i, clausesPresent],
    [/set.aside/i, setAsidePresent],
    [/\bnaics\b/i, naicsPresent],
    [/solicitation\s*(number|no\b|#)/i, solPresent],
    [/due\s*date|deadline|response\s*date|offer\s*due/i, deadlinePresent],
    [/issuing\s*(office|agency)|\bagency\b/i, agencyPresent],
    [/contract\s*type/i, contractTypePresent],
  ];
  return notes.filter((n) => {
    // field is the schema-designated subject; fall back to the uncertainty
    // sentence only when field is blank.
    const subject =
      typeof n.field === "string" && n.field.trim().length > 0
        ? n.field
        : (typeof n.uncertain === "string" ? n.uncertain : "");
    for (const [re, present] of subjects) {
      if (present && re.test(subject)) return false;
    }
    return true;
  });
}

// HTML escape — minimal, sufficient for solicitation text content.
function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Repeater helpers ──────────────────────────────────────────────────────
// Each replaces the inner HTML of a single container element identified by
// its data-field attribute. Tag-balanced walk for nested children.

function findClassedDiv(html: string, dataField: string): { openEnd: number; closeStart: number } | null {
  const openRe = new RegExp(`<div\\b[^>]*\\bdata-field="${dataField.replace(/[.]/g, "\\.")}"[^>]*>`, "i");
  const m = openRe.exec(html);
  if (!m) return null;
  const openEnd = m.index + m[0].length;
  // Walk forward counting <div> opens/closes
  let depth = 1;
  let i = openEnd;
  const divOpen = /<div\b[^>]*>/gi;
  const divClose = /<\/div\s*>/gi;
  divOpen.lastIndex = i;
  divClose.lastIndex = i;
  while (depth > 0) {
    const o = divOpen.exec(html);
    const c = divClose.exec(html);
    if (!c) return null;
    if (o && o.index < c.index) {
      depth++;
      divClose.lastIndex = o.index + 1;
    } else {
      depth--;
      if (depth === 0) return { openEnd, closeStart: c.index };
      divOpen.lastIndex = c.index + 1;
    }
  }
  return null;
}

function replaceInnerByDataField(html: string, dataField: string, innerHtml: string): string {
  const r = findClassedDiv(html, dataField);
  if (!r) return html;
  return html.slice(0, r.openEnd) + innerHtml + html.slice(r.closeStart);
}

// data-hide-when-empty="<field>" → when array empty, strip whole element.
function stripIfEmpty(html: string, dataField: string, isEmpty: boolean): string {
  if (!isEmpty) return html;
  const openRe = new RegExp(
    `<(?:section|div)\\b[^>]*\\bdata-hide-when-empty="${dataField.replace(/[.]/g, "\\.")}"[^>]*>`,
    "i"
  );
  const m = openRe.exec(html);
  if (!m) return html;
  // Determine tag name from the opener
  const tagMatch = /^<(\w+)/.exec(m[0]);
  if (!tagMatch) return html;
  const tag = tagMatch[1];
  // Walk balanced close
  const openTagRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const closeTagRe = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 1;
  const openEnd = m.index + m[0].length;
  openTagRe.lastIndex = openEnd;
  closeTagRe.lastIndex = openEnd;
  while (depth > 0) {
    const o = openTagRe.exec(html);
    const c = closeTagRe.exec(html);
    if (!c) return html;
    if (o && o.index < c.index) {
      depth++;
      closeTagRe.lastIndex = o.index + 1;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(0, m.index) + html.slice(c.index + c[0].length);
      }
      openTagRe.lastIndex = c.index + 1;
    }
  }
  return html;
}

// Replace `<span data-field="X">VAL</span>` text node only (preserves attrs).
function setSpanByDataField(html: string, dataField: string, value: string): string {
  const re = new RegExp(
    `(<span\\b[^>]*\\bdata-field="${dataField.replace(/[.]/g, "\\.")}"[^>]*>)([\\s\\S]*?)(</span>)`,
    "i"
  );
  return html.replace(re, `$1${esc(value)}$3`);
}

// ─── Surface 1 — §03-HEAD work-statement reveal ────────────────────────────

function renderWorkStatement(html: string, v: V2RenderInput): string {
  // Empty-guard (Jun 8 2026) — when V2 shadow produced neither known nor unknown
  // work-statement, leave V1's rendered content in place. Never clobber with
  // null. The V1 strip pass (renderAuditReportComplete) owns empty-strip duty.
  if (!v.work_statement && !v.work_statement_unknown) return html;
  // Brain rule (Part D): render EXACTLY ONE of the two .ws-reveal blocks.
  // Implementation: strip whichever block does not apply by removing its
  // `style="display:none"` from the one that DOES apply and removing the
  // other block entirely.
  if (v.work_statement) {
    // V1 (renderWorkStatementReveal in _render.ts) has already un-hidden the
    // correct .ws-reveal block per its own work_statement derivation. V2 just
    // re-applies the un-hide for its chosen block (idempotent — no-op if V1
    // already did it) then overrides the content with shadow values.
    //
    // E13 floor-breach root cause (fixed Jun 8 2026): the previous V2 strip
    // regex /<div class="ws-reveal"...style="display:none">[\s\S]*?<\/div>\s*
    // <\/div>\s*<\/div>/ non-greedy-matched THROUGH both ws-reveal blocks (the
    // known block ends in 2 trailing </div>; the first 3-in-a-row is at the
    // end of unknown) and wiped BOTH elements. V1's renderWorkStatementReveal
    // header comment (L1480-1487) calls out this exact anti-pattern. Strip
    // removed; the other block stays hidden via the template's default
    // display:none. Same pattern applied in the unknown branch below.
    let out = html.replace(
      /<div class="ws-reveal" data-state="known" data-field="work_statement" style="display:none">/,
      `<div class="ws-reveal" data-state="known" data-field="work_statement">`
    );
    // Fill the known block's data-field spans/paragraphs (V2 overrides V1's content).
    out = setSpanByDataField(out, "work_statement.confidence_label", v.work_statement.confidence);
    out = out.replace(
      /(<span class="ws-abbr" data-field="work_statement\.abbr">)[\s\S]*?(<\/span>)/,
      `$1${esc(v.work_statement.abbr)}$2`
    );
    out = out.replace(
      /(<span class="ws-full" data-field="work_statement\.full">)[\s\S]*?(<\/span>)/,
      `$1${esc(v.work_statement.full)}$2`
    );
    out = out.replace(
      /(<p class="ws-mean" data-field="work_statement\.meaning">)[\s\S]*?(<\/p>)/,
      `$1${v.work_statement.meaning}$2`
    );
    out = out.replace(
      /(<span class="ev-cite" data-field="work_statement\.evidence">)[\s\S]*?(<\/span>)/,
      `$1${esc(v.work_statement.evidence)}$2`
    );
    out = out.replace(
      /(<p class="wst-t" data-field="work_statement\.bid_strategy">)[\s\S]*?(<\/p>)/,
      `$1${v.work_statement.bid_strategy}$2`
    );
    return out;
  }
  // FA-105 fix: suppress unknown banner when V1 scope-narrative already rendered
  const wsAlreadyPopulated = /<[^>]*data-field=["']work_statement["'][^>]*>[\s\S]{20,}/m.test(html);
  if (v.work_statement_unknown && !wsAlreadyPopulated) {
    // V1 un-hide stands; V2 re-applies un-hide (idempotent) then overrides
    // content. Known-block strip removed — see the known branch above for the
    // E13 floor-breach root cause and the V1 comment that originally documented
    // this exact regex pitfall.
    let out = html.replace(
      /<div class="ws-reveal is-unknown" data-state="unknown" data-field="work_statement_unknown" style="display:none">/,
      `<div class="ws-reveal is-unknown" data-state="unknown" data-field="work_statement_unknown">`
    );
    out = out.replace(
      /(<span class="ws-full" data-field="work_statement_unknown\.head">)[\s\S]*?(<\/span>)/,
      `$1${esc(v.work_statement_unknown.head)}$2`
    );
    out = out.replace(
      /(<p class="ws-mean" data-field="work_statement_unknown\.reason">)[\s\S]*?(<\/p>)/,
      `$1${v.work_statement_unknown.reason}$2`
    );
    out = out.replace(
      /(<span class="wsi-t" data-field="work_statement_unknown\.action">)[\s\S]*?(<\/span>)/,
      `$1${v.work_statement_unknown.action}$2`
    );
    return out;
  }
  return html;
}

// ─── Surface 2 — §04 clause-matrix rollup ──────────────────────────────────

function renderMatrixRollup(html: string, v: V2RenderInput): string {
  const m = v.matrix_rollup;
  // Empty-guard (W2, Jun 8 2026) — leave V1's matrix in place when V2 has no
  // data in any dimension. Architectural twin of aafa802's checklist guard.
  if (m.required.length === 0 && m.reference.length === 0 && m.reference_count === 0) return html;
  const trapCount = m.required.filter((r) => r.badge === "trap").length;
  const fulltextCount = m.required.filter((r) => r.badge === "required").length;

  let out = html;
  out = setSpanByDataField(out, "matrix_rollup.trap_count", String(trapCount));
  out = setSpanByDataField(out, "matrix_rollup.fulltext_count", String(fulltextCount));
  // matrix_rollup.reference_count appears in MULTIPLE spans (tally + expander) —
  // setSpanByDataField uses a non-global regex so we need to replace twice.
  // Use a global pass instead.
  const refCountRe = new RegExp(
    `(<(?:span|b)\\b[^>]*\\bdata-field="matrix_rollup\\.reference_count"[^>]*>)([\\s\\S]*?)(</(?:span|b)>)`,
    "gi"
  );
  out = out.replace(refCountRe, `$1${m.reference_count}$3`);

  // Required cards repeater — one .cmx-row per required clause.
  const requiredRows = m.required
    .map((r) => {
      const badge = r.badge === "trap"
        ? `<span class="cmx-badge required" style="background:var(--amber-50);color:var(--amber-700)">Trap</span>`
        : `<span class="cmx-badge required">Required</span>`;
      const status = r.badge === "trap" ? `See §04 trap` : `Standard · present`;
      return `<div class="cmx-row">${badge}<span class="cmx-clause">${esc(r.number)}</span><span class="cmx-title">${esc(r.title)}</span><span class="cmx-status">${esc(status)}</span></div>`;
    })
    .join("");
  out = replaceInnerByDataField(out, "matrix_rollup.required", requiredRows);

  // Reference chips repeater
  const refChips = m.reference.map((r) => `<span class="cmx-ref">${esc(r.number)}</span>`).join("");
  out = replaceInnerByDataField(out, "matrix_rollup.reference", refChips);

  return out;
}

// ─── Surface 3 — §09 6-bucket pre-flight ──────────────────────────────────

function renderChecklist(html: string, v: V2RenderInput): string {
  // Empty-guard (Jun 8 2026) — when V2 shadow produced no checklist, leave V1's
  // rendered 6-bucket / N-item checklist in place. Writing "" here would clobber
  // V1's content to "0 / 0 cleared". Fall-back, never blank.
  if (!v.submission_checklist_filtered || v.submission_checklist_filtered.length === 0) return html;
  const groups = v.submission_checklist_filtered
    .map((g) => {
      const critClass = g.critical ? " is-critical" : "";
      const items = g.items
        .map(
          (it) =>
            `<label class="ck-item${it.isCritical ? " is-critical" : ""}"><input type="checkbox"><span class="ck-box"></span><span class="ck-txt">${esc(it.text)}</span></label>`
        )
        .join("");
      return `<div class="ck-group${critClass}" data-bucket="${esc(g.bucket)}"><div class="ck-gh">${esc(g.label)}</div>${items}</div>`;
    })
    .join("");
  return replaceInnerByDataField(html, "submission_checklist_filtered", groups);
}

// ─── Surface 4 — L02 band ─────────────────────────────────────────────────

function renderL02Band(html: string, v: V2RenderInput): string {
  // Empty-guard (Jun 8 2026) — return html unchanged when V2 has nothing. V1's
  // strip pass (renderAuditReportComplete → stripHideWhenEmptyBlocks) owns the
  // empty-section cleanup as the single authority. Stripping here would create
  // a redundant code path + risk a regression if V1 ever fills l02_catches.
  if (v.l02_catches.length === 0) return html;
  let out = setSpanByDataField(html, "l02_count", String(v.l02_catches.length));
  const cards = v.l02_catches
    .map(
      (c, i) =>
        `<div class="et-card"><div class="et-num">${i + 1}</div><div><span class="et-cat">${esc(c.category)}</span><p class="et-ttl">${esc(c.title)}</p><p class="et-why"><span>${esc(c.why_invisible)}</span></p><div class="et-move"><div class="em-t"><b>FARaudit move</b>${esc(c.move)}</div></div></div></div>`
    )
    .join("");
  out = replaceInnerByDataField(out, "l02_catches.list", cards);
  return out;
}

// ─── Surface 5 — Verification notes ───────────────────────────────────────

function renderConfidenceNotes(html: string, v: V2RenderInput): string {
  // Empty-guard (Jun 8 2026) — same fail-safe pattern as renderL02Band. V1's
  // strip pass is the empty-section authority; V2 only writes when it has data.
  if (v.confidence_notes.length === 0) return html;
  let out = setSpanByDataField(html, "confidence_count", String(v.confidence_notes.length));
  const rows = v.confidence_notes
    .map(
      (n) =>
        `<div class="vn-row"><span class="vn-field">${esc(n.field)}</span><div class="vn-body"><p class="vn-unsure">${esc(n.uncertain)}</p><p class="vn-assume"><span class="va-k">Assumed</span>${esc(n.assumption)} <span class="va-resolve">${esc(n.resolve)}</span></p></div></div>`
    )
    .join("");
  out = replaceInnerByDataField(out, "confidence_notes.list", rows);
  return out;
}

// ─── Surface 6 — Metadata brief (Fix 8) ───────────────────────────────────

function renderMetadataBrief(html: string, v: V2RenderInput): string {
  const mb = v.metadata_brief;
  if (!mb) return stripIfEmpty(html, "metadata_brief", true);
  let out = html;
  out = out.replace(
    /(<p class="v2-mb-summary" data-field="metadata_brief\.synopsis_summary">)[\s\S]*?(<\/p>)/,
    `$1${esc(mb.synopsis_summary)}$2`
  );
  out = setSpanByDataField(out, "metadata_brief.deadline.formatted", mb.deadline.formatted);
  out = setSpanByDataField(out, "metadata_brief.deadline.days_remaining", mb.deadline.days_remaining == null ? "—" : String(mb.deadline.days_remaining));
  out = setSpanByDataField(out, "metadata_brief.eligibility.notes", mb.eligibility.notes);
  out = setSpanByDataField(out, "metadata_brief.co_contact.name", mb.co_contact.name ?? "—");
  out = setSpanByDataField(out, "metadata_brief.co_contact.email", mb.co_contact.email ?? "—");
  const missingItems = mb.missing_intel.map((m) => `<li>${esc(m)}</li>`).join("");
  out = out.replace(
    /(<ul data-field="metadata_brief\.missing_intel">)[\s\S]*?(<\/ul>)/,
    `$1${missingItems}$2`
  );
  return out;
}

// ─── Surface 7 — Submission preflight (Fix 12) ────────────────────────────

function renderSubmissionPreflight(html: string, v: V2RenderInput): string {
  const items = v.submission_preflight;
  if (!items || items.length === 0) return stripIfEmpty(html, "submission_preflight", true);
  const statusBadge = (s: string) =>
    s === "required"
      ? `<span class="v2-sp-b req" style="background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600">required</span>`
      : s === "conditional"
      ? `<span class="v2-sp-b cond" style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600">conditional</span>`
      : `<span class="v2-sp-b nr" style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600">not required</span>`;
  const rows = items
    .map(
      (it) =>
        `<li class="v2-sp-item">${statusBadge(it.status)} <span class="v2-sp-text">${esc(it.item)}</span><span class="v2-sp-src" style="color:#6b7280;font-size:12px"> · ${esc(it.source)}</span>${it.detail ? `<div class="v2-sp-detail" style="color:#374151;font-size:12px;margin-left:8px">${esc(it.detail)}</div>` : ""}</li>`
    )
    .join("");
  // Direct regex — replaceInnerByDataField only walks <div>; preflight anchor is <ul>.
  return html.replace(
    /(<ul class="v2-sp-list" data-field="submission_preflight">)[\s\S]*?(<\/ul>)/,
    `$1${rows}$2`
  );
}

// ─── Surface 8 — Recompete signal (Fix 13) ────────────────────────────────

function renderRecompeteSignal(html: string, v: V2RenderInput): string {
  const rs = v.recompete_signal;
  if (!rs) return stripIfEmpty(html, "recompete_signal", true);
  let out = html;
  out = setSpanByDataField(out, "recompete_signal.contract_number", rs.contract_number ?? "—");
  out = setSpanByDataField(out, "recompete_signal.naics", rs.naics ?? "—");
  out = setSpanByDataField(out, "recompete_signal.agency", rs.agency ?? "—");
  out = setSpanByDataField(out, "recompete_signal.estimated_end_date", rs.estimated_end_date ?? "Not extracted");
  out = setSpanByDataField(out, "recompete_signal.recompete_window", rs.recompete_window ?? "Pending end-date extraction");
  out = out.replace(
    /(<p class="v2-rs-note" data-field="recompete_signal\.monitoring_note">)[\s\S]*?(<\/p>)/,
    `$1${esc(rs.monitoring_note)}$2`
  );
  return out;
}

// ─── Surface 9 — Price anchor (Fix 14) ────────────────────────────────────

function renderPriceAnchor(html: string, v: V2RenderInput): string {
  const pa = v.price_anchor;
  if (!pa) return stripIfEmpty(html, "price_anchor", true);
  let out = html;
  out = setSpanByDataField(out, "price_anchor.evaluation_type", pa.evaluation_type);
  out = setSpanByDataField(out, "price_anchor.clin_count", pa.clin_count == null ? "—" : String(pa.clin_count));
  out = out.replace(
    /(<p class="v2-pa-guidance" data-field="price_anchor\.lpta_guidance">)[\s\S]*?(<\/p>)/,
    `$1${pa.lpta_guidance ? esc(pa.lpta_guidance) : ""}$2`
  );
  out = out.replace(
    /(<p class="v2-pa-ige" data-field="price_anchor\.ige_note">)[\s\S]*?(<\/p>)/,
    `$1${pa.ige_note ? esc(pa.ige_note) : ""}$2`
  );
  return out;
}

// ─── Main entrypoint ──────────────────────────────────────────────────────
// Applies all 9 surface renders. Pure function. Determinism contract:
// renderV2Surfaces(template, vm) === renderV2Surfaces(template, vm) byte-by-byte.

export function renderV2Surfaces(template: string, v: V2RenderInput): string {
  let out = template;
  out = renderWorkStatement(out, v);
  out = renderMatrixRollup(out, v);
  out = renderChecklist(out, v);
  out = renderL02Band(out, v);
  out = renderConfidenceNotes(out, v);
  // Extended surfaces (Phase 2 cutover — Fix 8 / 12 / 13 / 14)
  out = renderMetadataBrief(out, v);
  out = renderSubmissionPreflight(out, v);
  out = renderRecompeteSignal(out, v);
  out = renderPriceAnchor(out, v);
  return out;
}
