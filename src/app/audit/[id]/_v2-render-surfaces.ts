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
import { resolveClauseTitle } from "../../../lib/clause-titles";
import { dropSelfContradictedNotes, type AuditL02Catch, type AuditConfidenceNote } from "../../../lib/audit-judgment";
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
  // ⑤.5 Ingestion banner — read from compliance_json.ingestion (top-level,
  // not v2_shadow.surfaces). Per-file role at form/amendment/attachment grain;
  // §C/§L/§M section tags deferred to FA-182. null → banner stripped.
  ingestion?: IngestionRender | null;
  // ⑤.7 The Capture Play — sequenced move list SYNTHESIZED from the engine's
  // own findings (v2_shadow.judgment l02Catches + high-severity risks). Every
  // move traces to a real finding; empty → section stripped.
  capture_play?: CaptureMove[] | null;
  // ⑤.4 §M un-provided-attachment callout — pre-built honest sentence (HTML,
  // carries <b>) or null. High-precision: only set when §M cites an attachment
  // in a scoring context that no ingested file matches. null → callout stripped.
  eval_attachment_gap?: string | null;
}

// ⑤.7 — one sequenced capture move. All fields derive from a real engine
// finding; nothing is invented. `when` drives the timing pill colour.
export interface CaptureMove {
  order: number;
  when: "now" | "qa" | "quote";
  when_label: string;
  effort: string; // "" → effort chip hidden (we don't fabricate a duration)
  do: string;
  why: string;
  source_label: string;
}

// Render-shaped subset of lib/sam-attachments IngestionMeta (kept local to
// avoid importing the engine module into the render path).
export interface IngestionRender {
  files_total: number;
  files_ingested: number;
  // Densify port (Design 2026-06-21): the read-vs-indexed manifest split.
  // files_read = deep-read in full (ingested); files_indexed = listed but not
  // deep-read. (files_read mirrors files_ingested; the named pair drives the
  // manifest summary row.)
  files_read: number;
  files_indexed: number;
  form_name: string | null;
  files: Array<{
    name: string;
    role: "form" | "amendment" | "attachment";
    ingested: boolean;
    section_roles: string[];
    // "full" = ingested/deep-read · "indexed" = listed-but-not-ingested.
    depth: "full" | "indexed";
    // For depth:"indexed" files only — the engine's per-file drop reason. "" when full.
    indexed_reason: string;
    // Densify port (Design 2026-06-21): an HONEST friendly bucket mapped from
    // indexed_reason, used to GROUP the "Indexed — not deep-read" manifest by
    // category (one category chip per group) while the raw reason stays in the
    // chip's title. "" when full or when no reason. Falls back to the raw reason
    // string when it matches no known bucket (never invented).
    indexed_category: string;
    // Engine-normalized display name; "" → the client normalizes from `name`.
    display_name: string;
  }>;
}

// ⑤.4 — detect a §M evaluation-criteria attachment that was referenced but
// not ingested. HIGH PRECISION by design: we only claim a gap when (a) we have
// an ingestion manifest to compare against, (b) §M cites an attachment in a
// scoring context, and (c) NO ingested file plausibly matches it. Biased hard
// toward NOT firing — a false "missing attachment" is a fabrication. Framed as
// tool-perspective ("not in the documents provided"), never a reality claim.
export function detectEvalAttachmentGap(comp: Record<string, unknown> | null | undefined): string | null {
  if (!comp || typeof comp !== "object") return null;
  const ing = comp.ingestion as Record<string, unknown> | undefined;
  const files = ing && Array.isArray(ing.files) ? (ing.files as Array<Record<string, unknown>>) : null;
  if (!files || files.length === 0) return null; // no manifest → cannot claim absence
  const fileNames = files.map((f) => String((f as { name?: unknown }).name ?? "")).join(" | ").toLowerCase();
  const parts: string[] = [];
  const pushStr = (v: unknown): void => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach((x) => { if (typeof x === "string") parts.push(x); });
  };
  pushStr(comp.eval_basis);
  pushStr(comp.section_m_summary);
  pushStr(comp.evaluation_factors_raw);
  if (Array.isArray(comp.evaluation_factors)) {
    (comp.evaluation_factors as Array<Record<string, unknown>>).forEach((ef) => {
      if (ef && typeof ef === "object") Object.values(ef).forEach((x) => { if (typeof x === "string") parts.push(x); });
    });
  }
  const mText = parts.join("  ");
  if (mText.trim().length < 20) return null;
  const refRe = /\b(attachment|exhibit|annex|appendix|addendum)\s+(?:no\.?\s*)?([A-Z]?-?\d{1,3}[A-Z]?|[A-Z])\b/gi;
  const scoringRe = /criteria|rubric|scoring|score|points?|weight|sub-?factors?|evaluat|basis of award/i;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(mText)) !== null) {
    const token = m[2];
    const around = mText.slice(Math.max(0, m.index - 80), m.index + 80);
    if (!scoringRe.test(around)) continue; // only attachment refs in a scoring context
    const kind = m[1].toLowerCase();
    const num = token.replace(/^0+/, "").toLowerCase();
    const refLabel = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${token.toUpperCase()}`;
    // A filename plausibly matches when it carries the same attachment kind +
    // number/letter (in any separator style: "Attachment_5", "attach 05",
    // "exhibitA"). (?![0-9]) — not \b — so a trailing "_" (attachment_5_rubric)
    // still counts as a match. Bias toward "provided": any plausible hit clears
    // the gap, because a false "missing" is worse than a missed callout.
    const escNum = num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const provided =
      fileNames.includes(refLabel.toLowerCase()) ||
      new RegExp(`(attach|exhibit|annex|append|addend)\\w*[ _.-]*0*${escNum}(?![0-9])`, "i").test(fileNames) ||
      fileNames.includes(`${kind} ${num}`) ||
      fileNames.includes(`${kind}${num}`);
    if (provided) continue; // a matching file WAS ingested — not a gap
    seen.add(refLabel);
  }
  if (seen.size === 0) return null;
  const refs = [...seen];
  const phrase = refs.length === 1 ? refs[0] : `${refs.slice(0, -1).join(", ")} and ${refs[refs.length - 1]}`;
  const plural = refs.length > 1;
  return `Section M references <b>${phrase}</b> for scoring detail, but ${plural ? "they were" : "it was"} not in the documents provided. The factors above are read from the &sect;M body text &mdash; confirm the exact weighting in ${plural ? "those attachments" : "that attachment"} on SAM.gov before you finalize your proposal.`;
}

// ⑤.7 — synthesize the Capture Play from the engine's persisted judgment. We
// re-sequence + time-anchor the engine's OWN findings (l02 "invisible catches"
// + high-severity risk mitigations); we never invent a move. Pure function,
// exported for test. Empty judgment → []  → section stripped.
export function synthesizeCapturePlay(shadow: Record<string, unknown> | null | undefined): CaptureMove[] {
  if (!shadow || typeof shadow !== "object") return [];
  const sj = (shadow.judgment as Record<string, unknown> | null) ?? null;
  if (!sj || typeof sj !== "object") return [];
  const l02 = Array.isArray(sj.l02Catches) ? (sj.l02Catches as Array<Record<string, unknown>>) : [];
  const risks = Array.isArray(sj.risks) ? (sj.risks as Array<Record<string, unknown>>) : [];
  const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  type Cand = { do: string; why: string; source: string; severity: number };
  const cands: Cand[] = [];
  // L02 "invisible catches" — the Capture Play's native material (move + why).
  for (const c of l02) {
    const move = clean(c.move);
    if (!move) continue;
    const src = clean(c.category) || clean(c.title);
    cands.push({ do: move, why: clean(c.why_invisible), source: src ? `From execution traps · ${src}` : "From execution traps", severity: 2 });
  }
  // High-severity risks carrying a concrete mitigation → a move.
  const sevRank = (s: string): number => {
    const u = s.toUpperCase();
    return u === "P0" || u === "CRITICAL" || u === "HIGH" ? 3 : u === "P1" || u === "MEDIUM" ? 2 : 1;
  };
  for (const r of risks) {
    const mit = clean(r.mitigation);
    if (!mit) continue;
    const sev = sevRank(clean(r.severity));
    if (sev < 2) continue; // skip low-severity advisory risks
    const ref = clean(r.trapClause) || clean(r.sectionReference);
    cands.push({ do: mit, why: clean(r.description), source: ref ? `From risk register · ${ref}` : "From risk register", severity: sev });
  }
  // Dedup by normalized action prefix; keep the richer / higher-severity entry.
  const seen = new Map<string, Cand>();
  for (const c of cands) {
    const key = c.do.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    const prev = seen.get(key);
    if (!prev || c.severity > prev.severity || (c.severity === prev.severity && c.why.length > prev.why.length)) {
      seen.set(key, c);
    }
  }
  // Timing — classify WHEN each real action must happen from its own text.
  const whenOf = (c: Cand): "now" | "qa" | "quote" => {
    const t = `${c.do} ${c.why}`.toLowerCase();
    if (/\bsprs\b|\bjcp\b|register|registration|sam\.gov|\bcage\b|certif|current score|lead.?time|30.?day|out of reach|structurally|start (today|now)|before anything/.test(t)) return "now";
    if (/clarif|question|ask the|q&a|q ?and ?a|carve|data.?right|ambig|in writing|pin the|raise.*before|before award|confirm.*(before|in writing)/.test(t)) return "qa";
    return "quote";
  };
  const WHEN_RANK = { now: 0, qa: 1, quote: 2 } as const;
  const WHEN_LABEL = { now: "Start today", qa: "Before Q&A", quote: "Before quote" } as const;
  // P1-c severity calibration (2026-06-21): "blocks bid" implies DISQUALIFICATION
  // and was applied to EVERY "now" move — including curable pre-bid setup like SPRS
  // posting, SAM/CAGE registration, and reps/certs. On a CONUS custodial contract
  // that read as "you're ineligible" when the offeror just has paperwork to do.
  // Reserve "blocks bid" for genuinely STRUCTURAL disqualifiers; label the rest
  // "pre-bid setup" (accurate urgency without the false ineligibility signal).
  const STRUCTURAL_RE = /out of reach|structurally|sole.?source|only (?:known )?source|ineligible|cannot (?:bid|compete)|disqualif|not eligible/i;
  return [...seen.values()]
    .map((c) => ({ c, when: whenOf(c) }))
    .sort((a, b) => WHEN_RANK[a.when] - WHEN_RANK[b.when] || b.c.severity - a.c.severity)
    .slice(0, 6) // keep the move list scannable; top findings only
    .map((m, i): CaptureMove => ({
      order: i + 1,
      when: m.when,
      when_label: WHEN_LABEL[m.when],
      effort: m.when === "now"
        ? (STRUCTURAL_RE.test(`${m.c.do} ${m.c.why}`) ? "blocks bid" : "pre-bid setup")
        : "",
      do: m.c.do,
      why: m.c.why,
      source_label: m.c.source,
    }));
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
      // P2 polish: a clause title renders in full or not at all — a garbled
      // single-word extraction fragment ("Heavalent") reads worse than a bare
      // clause number. Known trap numbers rebind their canonical title.
      const vetClauseTitle = (raw: unknown, canonical?: string): string => {
        const t = typeof raw === "string" ? raw.trim() : "";
        if (!t) return canonical ?? "";
        const oneWord = !/\s/.test(t);
        if (oneWord && !/^[A-Z0-9.&-]+$/.test(t)) return canonical ?? "";
        return t;
      };
      const rebadge = (rows: ClauseMatrixRow[]): ClauseMatrixRow[] =>
        rows.map((r) => {
          const num = String(r.number ?? "").trim();
          const trap = trapMap.get(num);
          const title = vetClauseTitle(r.title, trap?.title);
          if (trap) {
            return { ...r, title, badge: "trap" as MatrixBadge, trapReason: r.trapReason ?? trap.reason };
          }
          return r.badge === "trap"
            ? { ...r, title, badge: "required" as MatrixBadge, trapReason: null }
            : { ...r, title };
        });
      // FA-103 fix: fall back to V1 clause lists when V2 extraction returned empty
      const v2m = surfaces.matrix_rollup as MatrixRollupReshaped | undefined;
      if (v2m && (v2m.required.length > 0 || v2m.reference.length > 0)) {
        const required = rebadge(v2m.required);
        // A §04 trap hiding in the collapsed reference list carries no
        // visible TRAP badge (SPRTA1 re-run: 252.211-7003 IUID sat among 151
        // reference rows) — promote it to required so the chip, the TRAP
        // rows, and §04 stay one number.
        const referenceAll = rebadge(v2m.reference);
        const reference = referenceAll.filter((r) => r.badge !== "trap");
        required.push(...referenceAll.filter((r) => r.badge === "trap"));
        // And a trap V2 omitted from the matrix entirely still gets a row.
        const present = new Set(
          [...required, ...reference].map((r) => String(r.number ?? "").trim())
        );
        for (const [num, trap] of trapMap) {
          if (!present.has(num)) {
            required.push({ number: num, title: trap.title, badge: "trap" as MatrixBadge, trapReason: trap.reason });
          }
        }
        return { required, reference, reference_count: reference.length };
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
      // Fix #4 (2026-06-21) — blank cmx-title rows. The V1-fallback branch built
      // rows straight from the bare far_clauses / dfars_clauses number arrays with
      // title:"" — so FA301626R0018 rendered ~58 of 65 rows with an empty
      // cmx-title ("Standard · present", no clause name); only the ~7 curated
      // dfars_flags carried titles. Resolve each clause number against the static
      // clause-title map; fall back to the SAME honest placeholder the deterministic
      // normalizer uses so no row is ever title-blank. Never fabricates a title —
      // the clause NUMBER always renders, and unknown titles read "(title not
      // extracted)" rather than nothing.
      const titleFor = (num: string, given?: string): string =>
        (given && given.trim()) || resolveClauseTitle(num) || "(title not extracted)";
      const required: ClauseMatrixRow[] = flags.map((f) => {
        // FA-127b: severity alone is not enough — badge TRAP only when the
        // clause survives the §04 content filter, so every "See §04 trap"
        // pointer resolves to a rendered flag card.
        const num = String(f.clause ?? "").trim();
        const trap = trapMap.get(num);
        return {
          number: f.clause ?? "",
          title: titleFor(num, f.title),
          badge: (trap ? "trap" : "required") as MatrixBadge,
          trapReason: trap ? (trap.reason ?? f.title ?? null) : null,
        };
      });
      const flagNums = new Set(flags.map((f) => f.clause ?? ""));
      dfars.forEach((c) => {
        const num = typeof c === "string" ? c : ((c as { number?: string }).number ?? "");
        if (num && !flagNums.has(num)) {
          required.push({ number: num, title: titleFor(num), badge: "required" as MatrixBadge, trapReason: null });
        }
      });
      const reference: ClauseMatrixRow[] = far.map((c) => {
        const num = typeof c === "string" ? c : ((c as { number?: string }).number ?? "");
        const given = typeof c === "string" ? "" : ((c as { title?: string }).title ?? "");
        return {
          number: num,
          title: titleFor(num, given),
          badge: "reference" as MatrixBadge,
          trapReason: null,
        };
      });
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
    ingestion: readIngestion(comp),
    capture_play: synthesizeCapturePlay(shadow),
    eval_attachment_gap: detectEvalAttachmentGap(comp),
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
  const kept = notes.filter((n) => {
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

  // FA-141 — self-consistency for the historical corpus: persisted v2_shadow
  // rows predate the engine-side pass, so re-run it here against the shadow
  // judgment's own risks/L02 text + the notice title. Engine-filtered fresh
  // runs pass through unchanged (their contradicted notes are already gone).
  const shadow = (comp.v2_shadow as Record<string, unknown> | null) ?? {};
  const sj = (shadow.judgment as Record<string, unknown> | null) ?? {};
  const sjRisks = Array.isArray(sj.risks) ? (sj.risks as Array<Record<string, unknown>>) : [];
  const sjL02 = Array.isArray(sj.l02Catches) ? (sj.l02Catches as Array<Record<string, unknown>>) : [];
  // FA-143 — historical shadows don't persist facts.delivery, but the V1
  // columns that render §03 CLINs and §04 rows carry the same delivery
  // assertions (dates, DoDAACs, FOB terms); serialize their string fields.
  const rowStrings = (v: unknown): string[] =>
    Array.isArray(v)
      ? (v as Array<Record<string, unknown>>).flatMap((row) =>
          row && typeof row === "object"
            ? Object.values(row).filter((x): x is string => typeof x === "string")
            : []
        )
      : [];
  // FA-143 — §05 renders from the V1 risks_json columns, and those rows can
  // assert facts the shadow judgment's own risks hedge on (ROV: "6 weeks"
  // schedule + DoDAAC codes live only in risk_findings while the shadow risk
  // says "not confirmed"). The page-visible assertion must join the corpus,
  // or the contradicted vnote survives beside it.
  const risksJson = (audit.risks_json as Record<string, unknown> | null) ?? {};
  const assertions: Array<string | null | undefined> = [
    ...sjRisks.flatMap((r) => [r.title, r.description, r.mitigation, r.trapClause] as Array<string | null | undefined>),
    ...sjL02.flatMap((c) => [c.title, c.why_invisible, c.move] as Array<string | null | undefined>),
    ...rowStrings(comp.clins),
    ...rowStrings(comp.compliance_flags),
    ...rowStrings(risksJson.risk_findings),
    ...rowStrings(risksJson.prioritized_risks),
  ];
  const docClass = (sj.documentClassification as Record<string, unknown> | null) ?? {};
  if (typeof docClass.type === "string" && !["unknown", "wrong_doc", "metadata_only"].includes(docClass.type)) {
    assertions.push(`document type: ${docClass.type}`);
  }
  const title = typeof audit.title === "string" ? audit.title : null;
  return dropSelfContradictedNotes(kept, assertions, title, "render.v2_shadow");
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
  // The " notes" suffix is static template text OUTSIDE the count span — bind
  // the plural so a single-note report doesn't read "1 notes" (Jun 11 walk).
  out = out.replace(
    /(<span class="vn-count"><span data-field="confidence_count">\d+<\/span>) notes?(<\/span>)/,
    `$1${v.confidence_notes.length === 1 ? " note" : " notes"}$2`
  );
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

// ─── Surface 10 — Ingestion banner (Phase 4 · ⑤.5) ────────────────────────

// Densify port (Design 2026-06-21): map a raw per-file indexed_reason to an
// HONEST friendly bucket so the "Indexed — not deep-read" manifest groups by a
// human category instead of N near-identical raw sentences. The raw reason is
// kept in the chip's title attribute (caller). Anything that matches no bucket
// passes through as the raw reason string — never invented.
function deriveIndexedCategory(reason: string): string {
  const r = String(reason ?? "").trim();
  if (!r) return "";
  if (/near-duplicate|duplicate|superseded/i.test(r)) return "Duplicate / superseded";
  // Bare amendment / "SF-30" cover sheet → superseded amendments bucket.
  if (/\bsf[\s-]?30\b|amendment\s+cover|bare\s+amendment|^amendment\b/i.test(r)) return "Superseded amendments";
  if (/document cap|page budget|token budget|inline budget|exceeded/i.test(r)) return "Beyond ingest budget";
  if (/sign-in|incident report|administrative|roster/i.test(r)) return "Administrative";
  // Honest fallback — the raw reason string itself.
  return r;
}

// Read the ingestion manifest from compliance_json.ingestion (FA-136 — a
// V1-level field set by the multi-doc assembly, INDEPENDENT of v2_shadow).
export function readIngestion(comp: Record<string, unknown> | null | undefined): IngestionRender | null {
  if (!comp || typeof comp !== "object") return null;
  const ing = comp.ingestion as Record<string, unknown> | undefined;
  const rawFiles = ing && Array.isArray(ing.files) ? (ing.files as Array<Record<string, unknown>>) : null;
  if (!rawFiles || rawFiles.length === 0) return null;
  const files = rawFiles
    .filter((f) => f && typeof f.name === "string" && (f.name as string).trim().length > 0)
    .map((f) => {
      const role: "form" | "amendment" | "attachment" =
        f.role === "form" ? "form" : f.role === "amendment" ? "amendment" : "attachment";
      const section_roles = Array.isArray(f.section_roles)
        ? (f.section_roles as unknown[]).filter((s): s is string => typeof s === "string" && /^[CHLM]$/.test(s))
        : [];
      const ingested = f.ingested !== false;
      // Densify port: depth = full when deep-read (ingested), indexed otherwise.
      // indexed_reason reuses the engine's per-file drop `reason` (no-blank honesty:
      // every indexed file states why it wasn't deep-read).
      const depth: "full" | "indexed" = ingested ? "full" : "indexed";
      const indexed_reason = !ingested && typeof f.reason === "string" ? String(f.reason).trim() : "";
      const indexed_category = deriveIndexedCategory(indexed_reason);
      const display_name = typeof f.display_name === "string" ? String(f.display_name).trim() : "";
      return { name: String(f.name), role, ingested, section_roles, depth, indexed_reason, indexed_category, display_name };
    });
  if (files.length === 0) return null;
  const filesTotal = typeof ing!.files_total === "number" ? (ing!.files_total as number) : files.length;
  const filesIngested = typeof ing!.files_ingested === "number" ? (ing!.files_ingested as number) : files.filter((f) => f.ingested).length;
  const filesRead = files.filter((f) => f.depth === "full").length;
  const filesIndexed = files.filter((f) => f.depth === "indexed").length;
  const formName = typeof ing!.form_name === "string" ? (ing!.form_name as string) : null;
  return { files_total: filesTotal, files_ingested: filesIngested, files_read: filesRead, files_indexed: filesIndexed, form_name: formName, files };
}

// Standalone banner render — driven by compliance_json.ingestion DIRECTLY, so
// the banner shows on EVERY audit with a manifest, even when v2_shadow is
// absent (V2 didn't run). Decoupled from the V2 path (was wrongly stripped on
// V1-only renders). Strips itself when there's no manifest.
export function renderIngestionBannerFromAudit(html: string, audit: Record<string, unknown> | null | undefined): string {
  const comp = audit?.compliance_json as Record<string, unknown> | undefined;
  return renderIngestionBanner(html, { ingestion: readIngestion(comp) } as V2RenderInput);
}

// Densify port (Design 2026-06-21): normalize a raw SAM filename into a clean
// display name for the manifest rows. Conservative — strips the extension, the
// leading sol/amendment token noise, and de-shouts; keeps the raw name in the
// row's title attribute (done by the caller). Falls back to a trimmed raw name.
function normalizeDocName(raw: string): string {
  let s = String(raw);
  // Strip a leading timestamp/index upload prefix, e.g. "1781745825510-0-".
  // A long digit run (10+) optionally followed by "-<index>", then a "-"/"_".
  s = s.replace(/^\d{10,}(?:[-_]\d{1,3})?[-_]/, "");
  s = s.replace(/\.[a-z0-9]{2,4}$/i, ""); // drop extension
  s = s.replace(/[_]+/g, " ").replace(/\s{2,}/g, " ").trim();
  // De-shout: convert ALL-CAPS *words* to Title Case (leave already-mixed-case
  // words alone). Preserves amendment/section tokens by Title-casing them too
  // ("AMENDMENT 0011" → "Amendment 0011", "SECTION C" → "Section C"). Short
  // all-caps acronyms (≤3 letters, e.g. SOW, PWS, RFP) are kept as-is.
  s = s.replace(/[A-Za-z][A-Za-z'.]*/g, (w) => {
    const letters = w.replace(/[^A-Za-z]/g, "");
    if (letters.length === 0) return w;
    const isAllCaps = w === w.toUpperCase();
    if (!isAllCaps) return w; // leave mixed-case words untouched
    if (letters.length <= 3) return w; // keep short acronyms (SOW/PWS/RFP/SF)
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || String(raw).trim();
}

// Densify port: a §-section tag (from section_roles) takes precedence over a
// role badge for the "Read in full" rows; otherwise a role badge.
function docTagHtml(f: IngestionRender["files"][number]): string {
  const sec = (f.section_roles ?? [])[0];
  if (sec) return `<span class="dtag sec">&sect;${esc(sec)}</span>`;
  const ROLE: Record<string, string> = { form: "FORM", amendment: "AMENDMENT", attachment: "ATTACH" };
  return `<span class="dtag role">${ROLE[f.role] ?? "ATTACH"}</span>`;
}

const DOC_SVG = `<svg class="doc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg>`;

function docRowHtml(f: IngestionRender["files"][number], tags: string): string {
  const display = f.display_name || normalizeDocName(f.name);
  return `<div class="doc-row">${DOC_SVG}<span class="doc-name" title="${esc(f.name)}">${esc(display)}</span><span class="doc-tags">${tags}</span></div>`;
}

// Densify port — the collapsed read-vs-indexed manifest. Replaces the .ingest
// chip cloud. Collapsed by default; summary counts (total / read / indexed) +
// coverage chip + "View sources". Expanded body: "Read in full" (per file, by
// §-section/role) and "Indexed — not deep-read" (grouped by reason, one reason
// chip per group). Raw filename preserved in each row's title attribute.
function renderIngestionBanner(html: string, v: V2RenderInput): string {
  const ing = v.ingestion;
  // No manifest → strip the banner. Always-on when files exist; never faked.
  if (!ing || ing.files.length === 0) return stripIfEmpty(html, "ingestion", true);

  const readFiles = ing.files.filter((f) => f.depth === "full");
  const indexedFiles = ing.files.filter((f) => f.depth === "indexed");

  // Summary counts — total / read / indexed.
  const counts =
    `<span class="mc"><span class="mc-n">${esc(String(ing.files_total))}</span><span class="mc-k">documents</span></span>` +
    `<span class="mc-sep"></span>` +
    `<span class="mc read"><span class="mc-n">${esc(String(ing.files_read))}</span><span class="mc-k">read in full</span></span>` +
    `<span class="mc-sep"></span>` +
    `<span class="mc idx"><span class="mc-n">${esc(String(ing.files_indexed))}</span><span class="mc-k">indexed</span></span>`;

  // Coverage chip — TRUE §-section coverage when §-roles detected, else file-level.
  const allIngested = ing.files_total > 0 && ing.files_read >= ing.files_total;
  const detected = new Set<string>();
  ing.files.forEach((f) => (f.section_roles ?? []).forEach((s) => detected.add(s)));
  let covClass: "ok" | "warn";
  let covText: string;
  if (detected.size > 0) {
    const present = ["C", "H", "L", "M", "F"].filter((c) => detected.has(c));
    const missingCore = ["C", "L", "M"].filter((c) => !detected.has(c));
    covClass = missingCore.length === 0 ? "ok" : "warn";
    covText = missingCore.length === 0
      ? `Core sections present · ${present.map((c) => `§${c}`).join(" ")}`
      : `${missingCore.map((c) => `§${c}`).join(" · ")} not detected`;
  } else if (allIngested) {
    covClass = "ok";
    covText = "All sources read in full";
  } else {
    covClass = "warn";
    covText = `${ing.files_read} of ${ing.files_total} read · rest indexed`;
  }
  const okSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg>`;
  const warnSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`;
  const covChip = `<span class="man-cov ${covClass}">${covClass === "ok" ? okSvg : warnSvg}${esc(covText)}</span>`;

  // "Read in full" group.
  const readRows = readFiles.map((f) => docRowHtml(f, docTagHtml(f))).join("");
  const readGroup = readFiles.length === 0 ? "" :
    `<div class="man-grp read">` +
    `<div class="man-grp-h"><span class="gh-dot"></span><span class="gh-t">Read in full</span><span class="gh-c">${readFiles.length}</span><span class="gh-note">every word parsed against the compliance map</span></div>` +
    `<div class="man-cols">${readRows}</div>` +
    `</div>`;

  // "Indexed — not deep-read" group, grouped by friendly CATEGORY (Densify port,
  // Design 2026-06-21). One category chip per group; the RAW per-file reason is
  // kept in each chip's title attribute (no-blank honesty). Files with no engine
  // reason fall into a generic "not deep-read" bucket so none render reason-less.
  let indexedGroup = "";
  if (indexedFiles.length > 0) {
    const byCategory = new Map<string, IngestionRender["files"]>();
    for (const f of indexedFiles) {
      const key = f.indexed_category || f.indexed_reason || "not deep-read";
      const arr = byCategory.get(key) ?? [];
      arr.push(f);
      byCategory.set(key, arr);
    }
    const reasonBlocks = [...byCategory.entries()].map(([category, group]) => {
      const sub = `<p class="man-sub">${esc(category)} · ${group.length}</p>`;
      const rows = group.map((f) => {
        // Category chip; raw reason preserved in the chip's title attribute.
        const rawReason = f.indexed_reason || category;
        return docRowHtml(f, `<span class="dtag reason" title="${esc(rawReason)}">${esc(category)}</span>`);
      }).join("");
      return `<div>${sub}${rows}</div>`;
    }).join("");
    indexedGroup =
      `<div class="man-grp idx">` +
      `<div class="man-grp-h"><span class="gh-dot"></span><span class="gh-t">Indexed — not deep-read</span><span class="gh-c">${indexedFiles.length}</span><span class="gh-note">searchable for lookup; each carries a reason</span></div>` +
      `<div class="man-cols">${reasonBlocks}</div>` +
      `</div>`;
  }

  const manInner =
    `<div class="man-sum" data-man-toggle>` +
      `<span class="ingest-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h7l2 2h7a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg></span>` +
      `<div class="man-sum-tx"><span class="il-k">Source manifest</span><div class="man-counts">${counts}</div></div>` +
      covChip +
      `<button class="man-expand" type="button">View sources<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg></button>` +
    `</div>` +
    `<div class="man-body">${readGroup}${indexedGroup}</div>`;

  // Swap the entire .ingest banner element for the .man manifest.
  return replaceIngestBannerWithManifest(html, manInner);
}

// Replace the legacy .ingest banner element with the new .man manifest, keeping
// the data-field="ingestion" + data-hide-when-empty hooks the render pipeline
// keys off (the standalone caller already gated on a present manifest).
function replaceIngestBannerWithManifest(html: string, manInner: string): string {
  const re = /<div class="ingest"[^>]*>/;
  const m = re.exec(html);
  if (!m) return html;
  const range = findElementRange(html, m.index, "div");
  if (!range) return html;
  const replacement = `<div class="man" id="manA" data-field="ingestion" data-hide-when-empty="ingestion">${manInner}</div>`;
  return html.slice(0, range.start) + replacement + html.slice(range.end);
}

// Tag-balanced element-range finder (open-tag start .. matching close-tag end).
function findElementRange(html: string, openStart: number, tag: string): { start: number; end: number } | null {
  const openRe = new RegExp(`<${tag}\\b`, "g");
  const closeRe = new RegExp(`</${tag}>`, "g");
  // Find end of the opening tag.
  const tagEnd = html.indexOf(">", openStart);
  if (tagEnd === -1) return null;
  let depth = 1;
  let cursor = tagEnd + 1;
  while (depth > 0) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const o = openRe.exec(html);
    const c = closeRe.exec(html);
    if (!c) return null;
    if (o && o.index < c.index) { depth++; cursor = o.index + 1; }
    else { depth--; cursor = c.index + c[0].length; }
  }
  return { start: openStart, end: cursor };
}

// ─── Surface 11 — The Capture Play (Phase 4 · ⑤.7) ────────────────────────

function renderCapturePlay(html: string, v: V2RenderInput): string {
  const moves = v.capture_play;
  if (!moves || moves.length === 0) return stripIfEmpty(html, "capture_moves", true);
  const WHEN_ICON: Record<string, string> = {
    qa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    now: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>`,
    quote: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 4v12"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/></svg>`,
  };
  const docSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`;
  const cards = moves
    .map(
      (m) =>
        `<div class="cap-move"><div class="cap-rail"><span class="cap-n">${m.order}</span></div>` +
        `<div class="cap-card"><div class="cap-top"><span class="cap-when ${m.when}">${WHEN_ICON[m.when] ?? WHEN_ICON.quote}${esc(m.when_label)}</span>${m.effort ? `<span class="cap-effort">${esc(m.effort)}</span>` : ""}</div>` +
        `<p class="cap-do">${esc(m.do)}</p>` +
        (m.why ? `<p class="cap-why">${esc(m.why)}</p>` : "") +
        `<span class="cap-src">${docSvg}${esc(m.source_label)}</span></div></div>`
    )
    .join("");
  let out = replaceInnerByDataField(html, "capture_moves", cards);
  const qaCount = moves.filter((m) => m.when === "qa").length;
  const nowCount = moves.filter((m) => m.when === "now").length;
  const detail = qaCount > 0 ? `${qaCount} before Q&A` : nowCount > 0 ? `${nowCount} to start now` : "sequenced by cutoff";
  const summary = `${moves.length} move${moves.length === 1 ? "" : "s"} · ${detail}`;
  out = setSpanByDataField(out, "capture_summary", summary);
  return out;
}

// ─── Surface 12 — §M un-provided-attachment callout (Phase 4 · ⑤.4) ───────

function renderEvalGap(html: string, v: V2RenderInput): string {
  const gap = v.eval_attachment_gap;
  if (!gap) return stripIfEmpty(html, "eval_attachment_gap", true);
  // Fill the .eval-gap <span> (gap is pre-built HTML, intentionally not esc'd —
  // dynamic parts are alnum attachment tokens only). Preserve the leading svg.
  return html.replace(
    /(<div class="eval-gap"[^>]*data-field="eval_attachment_gap"[^>]*>[\s\S]*?<span>)[\s\S]*?(<\/span>)/,
    `$1${gap}$2`
  );
}

// ─── Main entrypoint ──────────────────────────────────────────────────────
// Applies all surface renders. Pure function. Determinism contract:
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
  // Phase 4 — agentic report upgrade (⑤)
  // NOTE: ingestion banner is rendered standalone (renderIngestionBannerFromAudit)
  // in renderAuditReportComplete — it's V1-level data, not gated on v2_shadow.
  out = renderCapturePlay(out, v);
  out = renderEvalGap(out, v);
  return out;
}
