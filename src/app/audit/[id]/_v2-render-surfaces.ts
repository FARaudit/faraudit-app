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
    matrix_rollup:
      (surfaces.matrix_rollup as MatrixRollupReshaped | undefined) ?? {
        required: [],
        reference: [],
        reference_count: 0,
      },
    submission_checklist_filtered: Array.isArray(surfaces.submission_checklist_filtered)
      ? (surfaces.submission_checklist_filtered as ChecklistBucketGroup[])
      : [],
    l02_catches: Array.isArray(surfaces.l02_catches)
      ? (surfaces.l02_catches as AuditL02Catch[])
      : [],
    confidence_notes: Array.isArray(surfaces.confidence_notes)
      ? (surfaces.confidence_notes as AuditConfidenceNote[])
      : [],
    has_incumbent: typeof surfaces.has_incumbent === "boolean" ? surfaces.has_incumbent : false,
    metadata_brief: (surfaces.metadata_brief as MetadataBrief | null) ?? null,
    submission_preflight: Array.isArray(surfaces.submission_preflight)
      ? (surfaces.submission_preflight as SubmissionChecklistItem[])
      : null,
    recompete_signal: (surfaces.recompete_signal as RecompeteSignal | null) ?? null,
    price_anchor: (surfaces.price_anchor as PriceAnchor | null) ?? null,
  };
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
  // Brain rule (Part D): render EXACTLY ONE of the two .ws-reveal blocks.
  // Implementation: strip whichever block does not apply by removing its
  // `style="display:none"` from the one that DOES apply and removing the
  // other block entirely.
  if (v.work_statement) {
    // Show known block (drop display:none on data-state="known"), strip unknown.
    let out = html.replace(
      /<div class="ws-reveal" data-state="known" data-field="work_statement" style="display:none">/,
      `<div class="ws-reveal" data-state="known" data-field="work_statement">`
    );
    // Strip the entire unknown ws-reveal block
    out = stripIfEmpty(
      // We use stripIfEmpty pattern but need a non-data-hide-when-empty path.
      // Simpler: regex-strip the unknown block as a whole.
      out,
      "__UNUSED__",
      true
    );
    // Manually strip the unknown ws-reveal:
    out = out.replace(
      /<div class="ws-reveal is-unknown" data-state="unknown" data-field="work_statement_unknown" style="display:none">[\s\S]*?<\/div>\s*<\/div>/,
      ""
    );
    // Now fill the known block's data-field spans/paragraphs.
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
  if (v.work_statement_unknown) {
    // Show unknown block (drop display:none), strip known.
    let out = html.replace(
      /<div class="ws-reveal is-unknown" data-state="unknown" data-field="work_statement_unknown" style="display:none">/,
      `<div class="ws-reveal is-unknown" data-state="unknown" data-field="work_statement_unknown">`
    );
    out = out.replace(
      /<div class="ws-reveal" data-state="known" data-field="work_statement" style="display:none">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
      ""
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
  if (v.l02_catches.length === 0) {
    return stripIfEmpty(html, "l02_catches", true);
  }
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
  if (v.confidence_notes.length === 0) {
    return stripIfEmpty(html, "confidence_notes", true);
  }
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
