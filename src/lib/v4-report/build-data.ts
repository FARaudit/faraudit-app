// buildV4Data(audit) — the ADAPTER: persisted audit row → V4Data (the render contract).
// Everything traces to a persisted value or is dropped (absence rule). No field is invented.
// Binds per _DATA-CONTRACT.md; derives §L/§M/CLIN/dates per _DERIVATION-SPEC.md (card 225).
// Reads the SAME inputs as the v3 renderer: audit.compliance_json.v3 (V3ReportPayload) + audit-row columns.
import type { V3ReportPayload, FindingLite } from "@/lib/audit-v3-report";
import type {
  V4Data, V4Fact, V4Verdict, V4Coverage, V4Findings, V4Finding,
  V4SubmissionL, V4EvalM, V4Clins, V4Date, V4Provenance, Tone, Pole,
} from "@/lib/v4-report/render";
import { reconcileOfferDueDeadlines } from "@/lib/audit-deadline-extract";

// ── pole → display word + tone (Brain doctrine; honest-fail poles carry noVerdict + noCharge) ──
const POLE_BAND: Record<string, string> = {
  BID: "BID",
  BID_WITH_CAUTION: "BID — WITH CAUTION",
  NO_BID: "NO-BID",
  INELIGIBLE: "INELIGIBLE",
  NEEDS_HUMAN_REVIEW: "NEEDS HUMAN REVIEW",
  INCOMPLETE: "INCOMPLETE",
  OUT_OF_SCOPE: "OUT OF SCOPE",
};
const POLE_TONE: Record<string, Tone> = {
  BID: "go",
  BID_WITH_CAUTION: "caution",
  NO_BID: "stop",
  INELIGIBLE: "stop",
  NEEDS_HUMAN_REVIEW: "slate",
  INCOMPLETE: "slate",
  OUT_OF_SCOPE: "slate",
};
// noVerdict + noCharge apply to all three honest-fail poles (per _DATA-CONTRACT §verdict + port prompt:
// "NHR + INCOMPLETE + OUT_OF_SCOPE all carry noCharge:true → the NO CHARGE chip"). NOTE: whether the audit
// was ACTUALLY not charged depends on AUDIT_HONESTFAIL_NO_CHARGE (OFF in prod → billing still charges) — the
// display-vs-billing reconciliation is the open S-4/D blocker, out of scope for this render adapter.
const NO_VERDICT_POLES = new Set(["NEEDS_HUMAN_REVIEW", "INCOMPLETE", "OUT_OF_SCOPE"]);

const s = (v: unknown): string => (v == null ? "" : String(v));

// ── derived-view candidate matchers (_DERIVATION-SPEC.md) ──
// Require an explicit UCF section anchor (§L / L-6) — a BARE letter must NOT pull a finding into the wrong
// section (review fix: "Proposal" ends in 'l' → was matching §L; "M0001" amendment → was matching §M). A
// separator is required after the letter so amendment/mod tokens (M0001, B0001) don't false-match. `kind`
// stays the PRIMARY signal; the regex is only the fallback when the engine did not type the finding.
const RE_L = /§\s*L\b|(?:^|[\s(])L[-.\s]\d/i;
const RE_M = /§\s*M\b|(?:^|[\s(])M[-.\s]\d/i;
const RE_CLIN = /\bCLIN\b|§\s*B\b/i;
// numeric tail of a citation, for §L ascending sort (L-4.1 before L-4.2)
const citeTail = (c: string): number => {
  const m = s(c).match(/(\d+(?:\.\d+)?)\s*$/);
  return m ? parseFloat(m[1]) : Number.POSITIVE_INFINITY;
};

// Union showStoppers + findings (deduped), matching the v3 renderer: buildV3Payload persists them from
// INDEPENDENT sources, and a disqualifying finding carried ONLY in showStoppers must still render — else a
// NO_BID/INELIGIBLE band shows an empty Show-stoppers group (the worst error class). showStoppers first.
function unionFindings(showStoppers: FindingLite[], findings: FindingLite[]): FindingLite[] {
  const seen = new Set<string>();
  const out: FindingLite[] = [];
  for (const f of [...showStoppers, ...findings]) {
    const k = `${s(f.requirement)}|${s(f.citation)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function mapFinding(f: FindingLite): V4Finding {
  const out: V4Finding = { req: s(f.requirement), cite: s(f.citation) };
  if (f.excerpt) out.excerpt = s(f.excerpt);
  // "Clears when" callout: the curability note. curableInWindow implies a gate the bidder can clear.
  if (f.note) out.curability = s(f.note);
  // temporal timing-evidence strip — render only when the arriving field is present (Brain #1).
  if (f.temporalEvidence) out.temporal = f.temporalEvidence;
  // driver = the finding that drives the verdict → expanded by default (disqualifying / P0).
  if (f.disposition === "disqualifying" || f.severity === "P0") out.driver = true;
  return out;
}

// severity bucket: explicit severity wins; else infer from disposition
// (disqualifying→P0, gate_to_clear→P1). "met"→satisfied, "dropped"→excluded.
function severityOf(f: FindingLite): "P0" | "P1" | "P2" {
  if (f.severity) return f.severity;
  if (f.disposition === "disqualifying") return "P0";
  if (f.disposition === "gate_to_clear") return "P1";
  return "P2";
}

// Split into the report's three tiers. Show-stoppers (blocks award) is sourced
// EXCLUSIVELY from the engine `showStoppers[]` registry — Brain card-293 ruling
// (2026-07-07): '"Show-stopper (blocks award)" = engine showStoppers[] exclusively.
// The report tile renders that registry and may never re-derive blockers from
// severity tags.' The union is one-way: every showStoppers[] entry renders in the
// tile regardless of its severity tag; a severity-P0 finding NOT in showStoppers[]
// is NOT a blocker (the engine severity classifier over-tags P0 — see ENGINE-DEFECT
// -LEDGER) and renders as a gate/advisory by severity, with no award-blocking copy.
function buildFindings(showStoppers: FindingLite[], all: FindingLite[]): V4Findings {
  const p0: V4Finding[] = [], p1: V4Finding[] = [], p2: V4Finding[] = [];
  const satisfied: { req: string; cite: string }[] = [];
  const key = (f: FindingLite): string => `${s(f.requirement)}|${s(f.citation)}`;
  const seen = new Set<string>();

  // Tier 0 — the blocker registry, verbatim (any severity, deduped, met→satisfied).
  for (const f of showStoppers) {
    const k = key(f);
    if (seen.has(k)) continue;
    seen.add(k);
    if (f.disposition === "dropped") continue;
    if (f.disposition === "met") { satisfied.push({ req: s(f.requirement), cite: s(f.citation) }); continue; }
    p0.push(mapFinding(f));
  }
  // Everything else — gates (P0-non-blocker + P1) / advisories (P2). No block-award language.
  for (const f of all) {
    const k = key(f);
    if (seen.has(k)) continue; // already rendered as a show-stopper (or a dup)
    seen.add(k);
    if (f.disposition === "dropped") continue;
    if (f.disposition === "met") { satisfied.push({ req: s(f.requirement), cite: s(f.citation) }); continue; }
    const v = mapFinding(f);
    (severityOf(f) === "P2" ? p2 : p1).push(v);
  }
  return { p0, p1, p2, satisfied };
}

// ── §L submission matrix (derived) ──
function buildSubmissionL(all: FindingLite[]): V4SubmissionL | { grounded: false } {
  const set = all.filter((f) => f.disposition !== "dropped" && (f.kind === "submission_instruction" || RE_L.test(s(f.citation))));
  if (!set.length) return { grounded: false };
  const rows = set
    .slice()
    // ascending by citation numeric tail; NaN (both tail-less → Infinity-Infinity) must not corrupt the sort.
    .sort((a, b) => { const d = citeTail(s(a.citation)) - citeTail(s(b.citation)); return Number.isNaN(d) ? 0 : d; })
    // Volume column drops (engine does not type a volume grouping) → degrade to req + condition + cite.
    .map((f) => ({ vol: "", req: s(f.requirement), condition: s(f.excerpt || ""), cite: s(f.citation) }));
  return { grounded: true, rows };
}

// ── §M evaluation grid (derived; persisted order = descending importance, DO NOT re-sort) ──
function buildEvalM(all: FindingLite[]): V4EvalM | { grounded: false } {
  const set = all.filter((f) => f.disposition !== "dropped" && (f.kind === "evaluation_factor" || RE_M.test(s(f.citation))));
  if (!set.length) return { grounded: false };
  const factors = set.map((f) => ({ name: s(f.requirement), basis: s(f.excerpt || f.note || ""), cite: s(f.citation) }));
  return { grounded: true, basis: "", factors };
}

// ── CLIN structure (derived; degrade to CLIN + Title + Cite when attrs untyped) ──
function buildClins(all: FindingLite[]): V4Clins | { grounded: false } {
  const set = all.filter((f) => f.disposition !== "dropped" && (f.kind === "clin" || RE_CLIN.test(s(f.citation))));
  if (!set.length) return { grounded: false };
  const rows = set.map((f) => {
    const clinNo = (s(f.requirement).match(/\b(\d{4})\b/) || s(f.citation).match(/\b(\d{4})\b/) || [])[1] || "";
    return { clin: clinNo, title: s(f.requirement), type: "", qtyUnit: "", period: "" };
  });
  return { grounded: true, rows };
}

// ── key dates: audit-row response_deadline is the ONLY persisted date VALUE. FindingLite carries no date
// value field, so finding-derived milestones would render valueless rows — omit them (never fabricate; a
// timeline of empty dates is worse than none). Additional milestones await a persisted date value upstream. ──
// Brain #329 render-coherence (LIVE-PATH fix) — v4-report is the renderer for every agentic_v3 audit, so the
// deadline formatting must live HERE (the earlier fix in the V1-legacy _view-model.ts never reached the live
// report). Format the raw response-deadline ISO into a customer-facing cutoff, preserving the stated wall-clock
// time + offset (never UTC-converted, never dropped, no date-shift across midnight-UTC). Date-only sources render
// date-only. Mirrors the web view-model's fmtDeadlineFull so both paths agree. A missed cutoff is a contract-loss
// vector — the time must always show. Pure.
const MONTHS_SHORT_V4 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DEADLINE_RE_V4 = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/;
export function fmtDeadline(raw: string): string {
  const m = raw.match(ISO_DEADLINE_RE_V4);
  if (!m) return raw; // unparseable → show as-is, never drop
  const [, y, mo, da, hh, mi, off] = m;
  const dateStr = `${Number(da)} ${MONTHS_SHORT_V4[Number(mo) - 1]} ${y}`;
  if (hh === undefined || (hh === "00" && mi === "00" && !off)) return dateStr; // date-only source
  const offLabel = !off || off === "Z" ? "UTC" : `UTC${off.replace(":", "").replace(/([+-])(\d{2})(\d{2})/, "$1$2:$3").replace("-", "−")}`;
  return `${dateStr} · ${hh}:${mi} (${offLabel})`;
}

function buildDates(responseDeadline: string, cj: Record<string, unknown>): V4Date[] {
  // Card #479 — the §06 Key Dates "Offers due" row carries the SAME reset/reconcile caveat as the masthead (offerDueFact),
  // so a reader scanning Key Dates alone isn't misled that a reset-TBD date is firm. Under the base flags this is the bare
  // date exactly as before (offerDueFact returns {value, sub:undefined}) → byte-identical.
  if (!responseDeadline) return [];
  const od = offerDueFact(responseDeadline, cj);
  return [{ label: "Offers due", value: od.value, kind: "gate", ...(od.sub ? { sub: od.sub } : {}) }];
}

// ── ENGINE-5-ROOT #2 (S7-1 / S8-04) — deadline conflict caveat ───────────────────────────────
// SAM metadata REMAINS authoritative for the displayed/controlling date and open-vs-closed — a doc
// parse must NEVER override it (a prior attempt closed a live, winnable solicitation off a mis-parsed
// cancelled date: customer-fatal). But when the DOCUMENT states a different offer-due date than SAM,
// silently showing only SAM's can send a bidder to the wrong day (0728: SAM 13 Jul vs the SF1449's
// 9 Jul). So keep SAM's date and, when a confidently-parsed document date differs by >24h, ADD a
// verify caveat. Conservative by construction: fires ONLY when BOTH dates parse cleanly and clearly
// disagree — any ambiguity ⇒ no caveat. It never changes the shown date or the open/closed status, so
// the worst case is a harmless "double-check" note, never a false close.
function docOfferDueMs(cj: Record<string, unknown>): number | null {
  const dl = cj.deadlines;
  if (!Array.isArray(dl)) return null;
  for (const e of dl) {
    const isObj = e && typeof e === "object";
    const label = String(isObj ? ((e as Record<string, unknown>).label ?? "") : "").toLowerCase();
    const raw = typeof e === "string" ? e : String(isObj ? ((e as Record<string, unknown>).date ?? "") : "");
    if (!raw) continue;
    // Only consider offer/quote/response-due labels; an unlabeled bare date string is allowed.
    if (label && !/offer|quote|proposal|response|due|submission|close/i.test(label)) continue;
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}
function deadlineConflictNote(responseDeadline: string, cj: Record<string, unknown>): string | null {
  const sam = Date.parse(responseDeadline);
  const doc = docOfferDueMs(cj);
  if (Number.isNaN(sam) || doc == null) return null;
  if (Math.abs(sam - doc) <= 24 * 60 * 60 * 1000) return null;
  return `⚠ Document states ${new Date(doc).toISOString().slice(0, 10)} — verify before submitting`;
}

// D2-A (Brain card 441, flag AUDIT_DEADLINE_RECONCILE, default-OFF) — amendment-supersession deadline COHERENCE on the V4
// (live agentic_v3) render path. The prior behavior kept SAM's date and, on a >24h conflict, added a co-equal "⚠ Document
// states … — verify" caveat — which presented a STALE date and the current date as peers (bd605b88: SAM 18 Jul + phantom
// 06-24 both shown). When the document itself supersedes its offer-due date (an amendment reset, or ≥2 offer-due dates),
// the CURRENT/controlling date should WIN the masthead and the stale/superseded dates should DEMOTE to a labeled note —
// never co-equal. reconcileOfferDueDeadlines resolves the controlling doc date (amendment-aware, dead-date-excluding,
// latest-wins). SAFETY RAIL (RULED, pinned in the test): this is DISPLAY-ONLY — it changes ONLY the "Offers due" fact
// value + sub-note, NEVER open/closed (that stays SAM-authoritative, computed elsewhere). Flag OFF ⇒ the exact prior
// behavior (SAM value + verify caveat), byte-identical (Rule 61).
const DEADLINE_RECONCILE_ENABLED = process.env.AUDIT_DEADLINE_RECONCILE === "true";
export function offerDueFact(responseDeadline: string, cj: Record<string, unknown>): { value: string; sub?: string } {
  const prior = { value: fmtDeadline(responseDeadline), sub: deadlineConflictNote(responseDeadline, cj) ?? undefined };
  // Card #477 ruling 2 — the notice-body UPDATE-stack state (flag AUDIT_DEADLINE_UPDATE_STACK; present only when on)
  // TAKES PRECEDENCE: it read the newest UPDATE and knows whether the due date was RESET, so it surfaces the TRUE state
  // instead of the stale-metadata reconcile that harvested an UPDATE-header/RFI-filename date ("document states 24 Jun").
  // SAM stays the masthead FLOOR; this only powers the caveat. Absent (flag OFF) ⇒ falls through unchanged (byte-identical).
  const nb = cj.notice_body_deadline as { status?: string; date?: string | null; lastStated?: { date: string } | null; note?: string } | undefined;
  if (nb && nb.status === "reset_tbd") {
    return { value: fmtDeadline(responseDeadline), sub: `⚠ ${nb.note || "Offer-due date reset by the latest amendment — a new date will be provided; verify against the latest amendment."}` };
  }
  if (!DEADLINE_RECONCILE_ENABLED) return prior;
  const r = reconcileOfferDueDeadlines(cj.deadlines);
  const sam = Date.parse(responseDeadline);
  if (!r.supersession || !r.controlling) return prior;               // no supersession evidence → SAM stays authoritative
  const ctrlMs = Date.parse(r.controlling.date);
  if (Number.isNaN(ctrlMs)) return prior;
  // SAM-FLOOR GUARD (D-3, card #444/#448 red-team adjudication) — SAM's responseDeadline is the FLOOR. A controlling
  // doc date may WIN the masthead ONLY when it is strictly LATER than SAM (a genuine reset/extension) or SAM is
  // absent/unparseable. A doc date EARLIER than SAM is a STALE original (or a mis-parsed/OCR'd amendment) and must
  // NEVER beat SAM — 64b79916 would have demoted SAM 18 Jul under a stale doc 06-24. When supersession evidence
  // exists but no doc date clears the SAM floor, the genuine reset likely lives in an image-only amendment
  // attachment the engine cannot read — so KEEP SAM's date and flag "deadline unreconciled — verify the amendment",
  // never a confident wrong date. (Rule 17: this masthead behavior must hold on BOTH worker + Vercel.)
  const samKnown = !Number.isNaN(sam);
  const DAY = 24 * 60 * 60 * 1000;
  if (samKnown && sam - ctrlMs > DAY) {
    return {
      value: fmtDeadline(responseDeadline), // SAM keeps the masthead (floor) — an earlier doc date never wins
      sub: `⚠ Deadline unreconciled — an amendment may reset the offer-due date; verify against the latest amendment (SAM metadata ${fmtDeadline(responseDeadline)} shown; document states ${fmtDeadline(r.controlling.date)}).`,
    };
  }
  if (samKnown && Math.abs(sam - ctrlMs) <= DAY) return prior;        // doc controlling ≈ SAM (agree) → SAM shown cleanly
  const samDiffers = !Number.isNaN(sam) && Math.abs(sam - ctrlMs) > DAY;
  // Controlling doc date WINS the masthead; SAM (if it differs) + every demoted/superseded date drop to a labeled note.
  const isDead = (l: string) => /superseded|prior|previous|cancell?ed|replaced|void/i.test(l);
  const priors = [
    samDiffers ? `SAM metadata ${fmtDeadline(responseDeadline)} (prior)` : null,
    ...r.demoted.map((d) => `${fmtDeadline(d.date)}${isDead(d.label) ? " (superseded)" : " (prior)"}`),
  ].filter((x): x is string => !!x);
  return {
    value: fmtDeadline(r.controlling.date),
    sub: priors.length ? `⚠ Amended — current offer-due shown; demoted: ${priors.join("; ")}` : undefined,
  };
}

// ROOT #4 COVERAGE-COHERENCE (card #453/#448, flag AUDIT_COVERAGE_COHERENCE, default-OFF) — a UCF section with
// GROUNDED (rendered, section-anchored) findings cannot honestly be listed "missing". 64b79916 showed §L/§M
// "missing" while 30+ grounded L/M findings rendered (masthead "100% · 9/9" vs body "L/M missing / INCOMPLETE").
// Reconcile the coverage panel against the evidence: an evidenced section is marked COVERED (chip flips to ok) and
// drops out of `missing`. Flag OFF ⇒ the exact prior sets (byte-identical, Rule 61).
const COVERAGE_COHERENCE_ENABLED = process.env.AUDIT_COVERAGE_COHERENCE === "true";
function buildCoverage(p: V3ReportPayload, documentsComplete: boolean, noVerdict: boolean): V4Coverage {
  const cov = p.coverage || { required: [], covered: [], missing: [] };
  const docs = p.documents || null;
  const required = Array.isArray(cov.required) ? cov.required : [];
  const covered = new Set(Array.isArray(cov.covered) ? cov.covered : []);
  const coreMissing = Array.isArray(cov.coreMissing) ? cov.coreMissing : [];
  const rawMissing = Array.isArray(cov.missing) ? cov.missing : [];
  // COVERAGE-COHERENCE reconciliation (flag-gated) — mark any section with grounded evidence as covered. The
  // section anchor MIRRORS RE_L/RE_M (require §K or K + separator + digit; a BARE letter never matches, so
  // "Proposal"/"M0001" can't false-evidence a section). Flag OFF ⇒ `covered` untouched ⇒ byte-identical.
  if (COVERAGE_COHERENCE_ENABLED) {
    const rendered = unionFindings(
      Array.isArray(p.showStoppers) ? p.showStoppers : [],
      Array.isArray(p.findings) ? p.findings : [],
    ).filter((f) => f.disposition !== "dropped");
    const evidenced = (k: string): boolean => {
      const L = s(k).trim().toUpperCase();
      if (!/^[A-M]$/.test(L)) return false;                          // only single UCF-section letters are anchor-checkable
      const re = new RegExp(`§\\s*${L}\\b|(?:^|[\\s(])${L}[-.\\s]\\d`, "i");
      // Anchor on the CITATION only (mirrors RE_L/RE_M finding-bucketing) — NOT requirement prose, so an incidental
      // "Deliverable C-2" / "phase L-1" token in a finding's text can't false-evidence a genuinely-missing section.
      return rendered.some((f) => re.test(s(f.citation)));
    };
    for (const k of new Set([...required, ...coreMissing, ...rawMissing])) if (!covered.has(k) && evidenced(k)) covered.add(k);
  }
  // core chips = required ∪ coreMissing (a core section absent-from-package lives only in coreMissing, and
  // must still surface as a "missing" chip — matches the v3 renderer's section-key union).
  const coreKeys = Array.from(new Set([...required, ...coreMissing]));
  const core = coreKeys.map((k) => ({ k, ok: covered.has(k) }));
  // "Core section missing" = required-but-uncovered ∪ absent-from-package (coreMissing). NOT retrieval failures.
  // Flag ON: an evidenced section (now in `covered`) drops out of missing; flag OFF: no covered-filter (byte-identical).
  const missingBase = Array.from(new Set([...rawMissing, ...coreMissing]));
  const missing = COVERAGE_COHERENCE_ENABLED ? missingBase.filter((k) => !covered.has(k)) : missingBase;
  // "Could not be parsed" = files the engine had but could NOT read/retrieve (documents.missing) — a genuine
  // parse/retrieval failure. coreMissing (never in the package) is absence, NOT a parse failure — keep them apart.
  // Card #479 — surface BOTH genuine parse failures (documents.missing) AND OCR-recovered-but-held docs (documents.ocr_held,
  // e.g. the numeric-dense Wage Determination) so the human-verification caveat reaches the reader. ocr_held is populated
  // only under AUDIT_OCR_HELD_REGISTER; empty otherwise ⇒ byte-identical. A construction sub is told to verify the DBA rates.
  const ocrHeldList = ((docs as { ocr_held?: Array<{ name: string; reason?: string }> } | undefined)?.ocr_held || [])
    .map((h) => (h.reason ? `${h.name} — ${h.reason}` : `${h.name} — OCR-recovered; human verification recommended`));
  const unreadable = [...(docs?.missing || []).map((m) => (m.reason ? `${m.name} — ${m.reason}` : m.name)), ...ocrHeldList];
  const total = docs?.posted ?? required.length;
  const rawRead = docs?.read ?? covered.size;
  const read = Math.min(rawRead, total); // never exceed total → coverage % can't blow past 100
  // ENGINE-5-ROOT #5 (S8-02/S8-03) — coverage.state is COMPLETE only when the document set is complete,
  // no required section is missing, AND the engine actually reached a verdict. Keying it on documentsComplete
  // alone stamped a green COMPLETE badge (and, via the render `complete` flag, a false "Show-stoppers — None
  // identified") on a withheld-verdict report where a section was uncovered. A no-verdict pole never shows COMPLETE.
  const state = (documentsComplete && missing.length === 0 && !noVerdict) ? "COMPLETE" : "INCOMPLETE";
  return { state, lead: docs?.note || "", read, indexed: 0, total, core, missing, unreadable } as V4Coverage;
}

// notice/procurement type → masthead badge word. Reads the persisted notice_type column when present
// (facts-vs-analysis: bind the real column); falls back to an HONEST pole heuristic only when absent.
function deriveDocType(noticeType: string, pole: Pole): string {
  const nt = noticeType.trim().toLowerCase();
  if (nt) {
    if (/sources\s*sought|rfi|request for information/.test(nt)) return "SOURCES SOUGHT";
    if (/combined|synopsis|rfq|request for quot/.test(nt)) return "RFQ";
    if (/\brfp\b|request for proposal/.test(nt)) return "RFP";
    if (/presol/.test(nt)) return "PRESOLICITATION";
    return noticeType.trim().toUpperCase().slice(0, 24);
  }
  return pole === "OUT_OF_SCOPE" ? "SOURCES SOUGHT" : "SOLICITATION";
}

/**
 * Adapt one persisted audit row → the V4 render contract. Mirrors the v3 renderer's
 * input reading (compliance_json.v3 + audit-row columns) so the two never diverge on source.
 */
export function buildV4Data(audit: Record<string, unknown>): V4Data {
  const cj = (audit.compliance_json as Record<string, unknown> | null) ?? {};
  const p = (cj.v3 as V3ReportPayload | undefined) ?? {
    // schema-drift / missing payload → INCOMPLETE with an EXPLANATORY rationale (never a blank verdict).
    verdict: "INCOMPLETE", eligible: null,
    reason: "The agentic report payload could not be loaded for this audit — it is under review and was not charged. Re-run to recover a complete report.",
    showStoppers: [], findings: [], coverage: { required: [], covered: [], missing: [] },
  } as V3ReportPayload;

  const solicitation = s(audit.solicitation_number);
  const title = s(audit.title);
  const agency = s(audit.agency);
  const naics = s(audit.naics_code);
  const setAside = s(audit.set_aside);
  const responseDeadline = s(audit.response_deadline);
  const pole = s(p.verdict) as Pole;
  // authoritative completeness = the top-level compliance_json.documents_complete (C-group truth-source,
  // sibling of v3 — same field shouldGateExport reads), so the report state matches the export gate.
  const documentsComplete = (cj.documents_complete as boolean | undefined) === true
    || (cj.documents_complete === undefined && p.documents?.complete === true);

  // ── masthead — audit-row columns only (Brain #5), never compliance_json ──
  const facts: V4Fact[] = [];
  if (agency) facts.push({ k: "Agency", v: agency });
  if (naics) facts.push({ k: "NAICS", v: naics, mono: true });
  if (setAside) facts.push({ k: "Set-aside", v: setAside });
  // #329: label is "Offers due" (this is the RESPONSE deadline, not a delivery date — the old "Delivery" mislabel
  // was a customer-facing error) and the value is formatted to preserve the wall-clock cutoff + offset.
  if (responseDeadline) { const od = offerDueFact(responseDeadline, cj); facts.push({ k: "Offers due", v: od.value, sub: od.sub }); }
  const docType = deriveDocType(s(audit.notice_type), pole);

  // ── verdict ──
  // Card #485 (Design #483 re-stamp · flag 1): the V4 port over-generalized noCharge to ALL three no-verdict poles,
  // but the NHR pole carries NO no-charge line — Card 355 doctrine ("NHR foot: no no-charge line") + card #483
  // checklist §1 + the V1 legacy renderer (audit-v3-report.ts, which only charged-off INCOMPLETE/OOS, never NHR).
  // Flag AUDIT_NHR_NOCHARGE_SUPPRESS excludes NHR from the chip; INCOMPLETE/OUT_OF_SCOPE untouched.
  // Flag OFF ⇒ NO_VERDICT_POLES.has(pole) unchanged, byte-identical (Rule 61).
  const NHR_NOCHARGE_SUPPRESS = process.env.AUDIT_NHR_NOCHARGE_SUPPRESS === "true";
  const verdict: V4Verdict = {
    pole,
    band: POLE_BAND[pole] || pole,
    tone: POLE_TONE[pole] || "slate",
    noVerdict: NO_VERDICT_POLES.has(pole),
    noCharge: NO_VERDICT_POLES.has(pole) && !(NHR_NOCHARGE_SUPPRESS && pole === "NEEDS_HUMAN_REVIEW"),
    eligible: p.eligible ?? null,          // tri-state; render suppresses the chip on OUT_OF_SCOPE (explicit pole rule)
    rationale: s(p.reason),                // VERBATIM — never paraphrase or trim
  };

  // union showStoppers + findings for the §L/§M/CLIN derivations (kind/citation-based,
  // severity-agnostic — a submission/eval/CLIN row may live in either array).
  const showStoppers = Array.isArray(p.showStoppers) ? p.showStoppers : [];
  const all = unionFindings(showStoppers, Array.isArray(p.findings) ? p.findings : []);
  // Findings tiers: p0 sourced EXCLUSIVELY from showStoppers[] (Brain card-293) — a
  // severity-P0 finding not in the registry routes to Gates/Advisories, never Show-stoppers.
  const findings: V4Findings = buildFindings(showStoppers, all);
  const coverage = buildCoverage(p, documentsComplete, NO_VERDICT_POLES.has(pole));

  // "Audited/Evaluated" date — bind the first persisted date available (Design Gate-2 flag: some run-records,
  // incl. the real W50 fixture, carry a null v3.generatedAt → the readout showed "Evaluated —"). Fall back
  // through the sibling top-level stamp then the row's own completion/creation columns; genuine absence → "".
  const auditDate = s(p.generatedAt) || s(cj.generated_at) || s(audit.completed_at) || s(audit.created_at);
  const provenance: V4Provenance = {
    auditDate,
    engine: "", // engine version must NEVER be customer-facing (CEO rule) — no longer rendered (Engine row removed)
    // read-file NAMES are not persisted (only counts + the missing list), so the manifest can only surface the
    // files the engine could NOT read, marked unread. A COMPLETE audit → empty manifest (nothing to flag).
    manifest: (p.documents?.missing || []).map((m) => ({ name: m.name, read: "unread" as const })),
  };

  return {
    shell: { auditId: s(audit.id) },
    masthead: { docType, solicitation, title, facts },
    verdict,
    coverage,
    findings,
    submissionL: buildSubmissionL(all),
    evalM: buildEvalM(all),
    clins: buildClins(all),
    dates: buildDates(responseDeadline, cj),
    provenance,
  } as V4Data;
}
