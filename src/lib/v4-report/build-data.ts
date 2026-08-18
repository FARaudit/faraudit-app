// buildV4Data(audit) — the ADAPTER: persisted audit row → V4Data (the render contract).
// Everything traces to a persisted value or is dropped (absence rule). No field is invented.
// Binds per _DATA-CONTRACT.md; derives §L/§M/CLIN/dates per _DERIVATION-SPEC.md (card 225).
// Reads the SAME inputs as the v3 renderer: audit.compliance_json.v3 (V3ReportPayload) + audit-row columns.
import type { V3ReportPayload, FindingLite } from "@/lib/audit-v3-report";
import { extractClinSchedule } from "@/lib/audit-clin-schedule";
import type {
  V4Data, V4Fact, V4Verdict, V4Coverage, V4Findings, V4Finding,
  V4SubmissionL, V4EvalM, V4Clins, V4Date, V4Provenance, Tone, Pole,
} from "@/lib/v4-report/render";
import { reconcileOfferDueDeadlines, isDeadDateLabel } from "@/lib/audit-deadline-extract";
import { adaptV2ToV3Payload } from "@/lib/v4-report/adapt-v2-payload";

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

// Strip ENGINE-INTERNAL annotations that leaked into customer prose (card #612-(3d)).
// The engine tags some eligibility findings with a bracketed adjudication note, and
// emits eligibility-gap KEYS as snake_case identifiers (panel-findings-bridge.ts) — the
// customer sees "[cited clause is not a recognized …]" and "confirm set_aside_eligibility;
// size_standard" verbatim. This removes/humanizes ONLY those two KNOWN machine artifacts;
// it never paraphrases substance, so the rationale stays verbatim in spirit. Applied at the
// single build points (mapFinding + rationale) so all three renderers inherit clean prose.
export function sanitizeProse(v: unknown): string {
  let t = s(v);
  if (!t) return t;
  // (1) eligibility-authority-allowlist adjudication note → concise customer phrasing.
  // NB: no internal "; " in the replacement — the caveat splitter separates on "; ", so a
  // semicolon here would orphan "confirm)" onto its own bullet (Design flag, PR #266).
  t = t.replace(/\s*[—-]?\s*\[cited clause is not a recognized[^\]]*\]/gi, " (advisory — not a recognized eligibility bar, confirm)");
  // (2) the KNOWN eligibility-gap keys emitted by panel-findings-bridge (setAsideAttribute) —
  //     the only underscore-bearing machine tokens that reach customer prose — humanised via an
  //     EXPLICIT allowlist. A blanket snake_case regex would corrupt legitimate underscores in
  //     KO emails (contract_officer@…), attachment filenames (wage_determination.pdf), and portal
  //     URLs (…/opp/some_notice) that appear verbatim in submission-instruction prose.
  t = t.replace(/\bset_aside_eligibility\b/gi, "set-aside eligibility").replace(/\bsize_standard\b/gi, "size standard");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

// ── derived-view candidate matchers (_DERIVATION-SPEC.md) ──
// Require an explicit UCF section anchor (§L / L-6) — a BARE letter must NOT pull a finding into the wrong
// section (review fix: "Proposal" ends in 'l' → was matching §L; "M0001" amendment → was matching §M). A
// separator is required after the letter so amendment/mod tokens (M0001, B0001) don't false-match. `kind`
// stays the PRIMARY signal; the regex is only the fallback when the engine did not type the finding.
const RE_L = /§\s*L\b|(?:^|[\s(])L[-.\s]\d/i;
const RE_M = /§\s*M\b|(?:^|[\s(])M[-.\s]\d/i;
const RE_CLIN = /\bCLIN\b|§\s*B\b/i;
// REPORT-TRUTH #3 (flag AUDIT_PANEL_COMPUTE_OR_ABSENT, default OFF ⇒ every panel below keeps its legacy "" fields ⇒
// byte-identical). Evaluated per call, not frozen at import, so the flag is honoured at render time.
const panelComputeOrAbsent = (): boolean => process.env.AUDIT_PANEL_COMPUTE_OR_ABSENT === "true";
// A CLIN number is only a CLIN number when a LINE-ITEM MARKER says so. Anchoring on the marker is what separates
// "CLIN 0006" from a street number, a year, or the -7012 tail of a DFARS clause. Optional plural ("CLINs 0001-0006"),
// optional "No.", optional leading zeros, and the A/AA alphanumeric SLIN suffix federal schedules use.
const ANCHORED_CLIN = /\b(?:CLIN|SLIN|LINE\s+ITEM|ITEM)S?\s*(?:NO\.?|#)?\s*(\d{4}[A-Z]{0,2})\b/i;
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
  const out: V4Finding = { req: sanitizeProse(f.requirement), cite: s(f.citation) };
  if (f.excerpt) out.excerpt = s(f.excerpt);
  // DEDUP IDENTITY IS AN ANALYSIS QUESTION (ARC #747 · E1). `excerptHeadKey` keys on the first 120 normalized
  // chars — precisely the region head re-grounding rewrites. Without this, widening a quote for the reader
  // silently changes which findings are "the same obligation": two findings from one clause, previously
  // distinct, extend back to the same clause start, collide, and `dedupeByExcerpt` keeps the survivor while
  // DISCARDING the loser's requirement and severity — an obligation disappears from the customer's report.
  // That is the PR #293 defect class, reached by a different road. So identity keys on the span the analysis
  // examined, never on the span the reader sees. Flag-OFF `excerptPreReground` is undefined ⇒ keyExcerpt ===
  // excerpt ⇒ every key is byte-identical to today.
  const analyzed = (f as { excerptPreReground?: string }).excerptPreReground ?? f.excerpt;
  if (analyzed) out.keyExcerpt = s(analyzed);
  // "Clears when" callout: the curability note. curableInWindow implies a gate the bidder can clear.
  if (f.note) out.curability = s(f.note);
  // temporal timing-evidence strip — render only when the arriving field is present (Brain #1).
  if (f.temporalEvidence) out.temporal = f.temporalEvidence;
  // driver = the finding that drives the verdict → expanded by default (disqualifying / P0).
  if (f.disposition === "disqualifying" || f.severity === "P0") out.driver = true;
  return out;
}

// Vehicle F2 · F-2 (flag AUDIT_SEVERITY_HONEST, default-OFF) — the UNCOMPUTED-DEFAULT class (L42): an absent
// severity must NEVER default UPWARD. When ON, a finding with no severity AND a disposition that does not
// authoritatively rank it renders as UNRATED + emits a defect signal — it is never silently promoted to a gate.
const severityHonestEnabled = (): boolean => process.env.AUDIT_SEVERITY_HONEST === "true";

// severity bucket: explicit severity wins; else infer from the AUTHORITATIVE disposition
// (disqualifying→P0, gate_to_clear→P1). "met"→satisfied, "dropped"→excluded.
// Flag-OFF: a non-ranking disposition with no severity falls to P2 (legacy, byte-identical).
// Flag-ON: it becomes "unrated" (honest) with a signal — never P1/P0 by convenience.
function severityOf(f: FindingLite): "P0" | "P1" | "P2" | "unrated" {
  if (f.severity) return f.severity;
  if (f.disposition === "disqualifying") return "P0";
  if (f.disposition === "gate_to_clear") return "P1";
  if (severityHonestEnabled()) {
    console.error(`[severity] UNRATED finding (no severity · disposition=${f.disposition ?? "none"}): ${s(f.requirement).slice(0, 60)}`);
    return "unrated";
  }
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
  const p0: V4Finding[] = [], p1: V4Finding[] = [], p2: V4Finding[] = [], unrated: V4Finding[] = [];
  const satisfied: { req: string; cite: string }[] = [];
  const key = (f: FindingLite): string => `${s(f.requirement)}|${s(f.citation)}`;
  const seen = new Set<string>();
  // Vehicle F2 · F-2 cross-tier — the excerpt-heads already rendered as show-stoppers. Flag-ON: a gate/advisory that
  // rests on the SAME source excerpt as a show-stopper is the SAME bar restated one tier down (the anchor eligibility
  // bar was rendering as both "Stop" AND "Gate"); it is dropped from the lower tier so each bar appears once, and the
  // show-stoppers stay unmistakable. Flag-OFF: never populated ⇒ byte-identical.
  const p0Heads = new Set<string>();

  // Tier 0 — the blocker registry, verbatim (any severity, deduped, met→satisfied).
  for (const f of showStoppers) {
    const k = key(f);
    if (seen.has(k)) continue;
    seen.add(k);
    if (f.disposition === "dropped") continue;
    if (f.disposition === "met") { satisfied.push({ req: s(f.requirement), cite: s(f.citation) }); continue; }
    if (severityHonestEnabled() && f.excerpt) p0Heads.add(excerptHeadKey(f.excerptPreReground ?? f.excerpt));
    p0.push(mapFinding(f));
  }
  // Everything else — gates (P0-non-blocker + P1) / advisories (P2). No block-award language.
  for (const f of all) {
    const k = key(f);
    if (seen.has(k)) continue; // already rendered as a show-stopper (or a dup)
    seen.add(k);
    // Flag-ON cross-tier: same bar as a show-stopper (identical excerpt-head) → do not also render it as a gate.
    if (severityHonestEnabled() && f.excerpt && p0Heads.has(excerptHeadKey(f.excerptPreReground ?? f.excerpt))) continue;
    if (f.disposition === "dropped") continue;
    if (f.disposition === "met") { satisfied.push({ req: s(f.requirement), cite: s(f.citation) }); continue; }
    const v = mapFinding(f);
    const sev = severityOf(f);
    if (sev === "unrated") unrated.push(v);        // flag-ON only — never promoted to a gate
    else if (sev === "P2") p2.push(v);
    else p1.push(v);
  }
  // Conservative report-layer near-dedup (card #612-(3b)): collapse findings whose ENTIRE
  // requirement normalizes identically once articles/punctuation/case are neutralised — the
  // same obligation restated with a trivial wording difference (e.g. "Provide a QCP within
  // 10 days" vs "Provide QCP within 10 days"). Keyed on the FULL normalized requirement,
  // NEVER fuzzy similarity, so genuinely distinct gates (RN vs LPN vs Psychologist licensure)
  // keep separate rows. Verdict-inert — display only; the engine's cross-fleet deduper
  // (AUDIT_CROSS_FLEET_DEDUP) is the source-side tool for cross-panel near-dups.
  // Flag-ON (F-2): a second, excerpt-grounded near-dedup collapses findings that rest on the IDENTICAL source
  // excerpt but were restated with different requirement wording / citation punctuation (the 6× "submit only one
  // proposal" family — same grounded text, six paraphrases). Keyed on the FULL normalized excerpt, never a prefix
  // or similarity score, so genuinely distinct gates (different source text) never collapse. Flag-OFF: byte-identical.
  const ded = (list: V4Finding[]): V4Finding[] =>
    severityHonestEnabled() ? dedupeByExcerpt(dedupeNearFindings(list)) : dedupeNearFindings(list);
  const out: V4Findings = { p0: ded(p0), p1: ded(p1), p2: ded(p2), satisfied };
  if (severityHonestEnabled() && unrated.length) out.unrated = dedupeByExcerpt(dedupeNearFindings(unrated));
  return out;
}

// FULL-excerpt near-dedup (F-2). Two findings resting on the IDENTICAL normalized source excerpt are the same
// obligation restated — collapse them, merging distinct citations (same contract as dedupeNearFindings). Findings
// with an empty excerpt are never a dedup key (each kept). NOT a similarity score — exact normalized-excerpt match.
// Excerpt-HEAD key (first 120 normalized chars) — not the full string: the same obligation is sometimes captured
// with more/less trailing context (e.g. the one-proposal rule persisted at 156 vs 329 chars). 120 chars of identical
// normalized source text is specific enough that two genuinely distinct obligations never collide.
const excerptHeadKey = (e: string): string => normReqKey(e).slice(0, 120);
// A merged row keeps at most this many distinct obligations. Beyond it the row stops being readable, and a
// span attracting four different obligations is a signal the dedup key is too coarse for that source — worth
// knowing rather than papering over, so the overflow is logged.
const MAX_MERGED_REQS = 3;
export function dedupeByExcerpt(list: V4Finding[]): V4Finding[] {
  const byKey = new Map<string, V4Finding>();
  const out: V4Finding[] = [];
  for (const f of list) {
    const k = f.excerpt ? excerptHeadKey(f.keyExcerpt ?? f.excerpt) : "";
    if (!k) { out.push(f); continue; }
    const survivor = byKey.get(k);
    if (survivor) {
      const cites = survivor.cite.split(/\s*·\s*/).filter(Boolean);
      const add = s(f.cite).trim();
      if (add && !cites.some((c) => c.toLowerCase() === add.toLowerCase())) survivor.cite = [...cites, add].join(" · ");
      // …and the REQUIREMENT too. Citations were merged here from the start; requirements were dropped, so a
      // finding whose obligation differed left the report entirely — the reader saw one row and had no way to
      // know a second obligation had been folded into it. Two lenses quoting the same §L schedule span, one
      // stating the page limit and one the submission portal, shipped as the page limit alone. The engine's
      // applyFindingDedup (audit-decide.ts) has always preserved every facet with " · "; this is the report
      // layer catching up to it. Capped, because a row is a row and not a paragraph.
      //
      // MERGE FACET-WISE, NOT STRING-WISE. The arriving requirement may ALREADY be a multi-facet string:
      // the engine's own `applyFindingDedup` joins with the same " · ", and 7 of 2,060 banked requirements
      // arrive pre-merged. Treating it as one opaque unit produced two defects, both reproduced by execution
      // before this change: appending "C · D" to a survivor holding "A · B" rendered FOUR obligations while
      // the guard believed it had appended one (the cap silently exceeded), and merging "B · C" into "A · B"
      // printed "A · B · B · C" — the same obligation twice in a single row, from the very pass whose job is
      // to stop obligations being duplicated or lost. Splitting both sides first makes the dedup and the cap
      // operate on the unit the reader actually sees: one obligation.
      const reqs = s(survivor.req).split(/\s*·\s*/).map((r) => r.trim()).filter(Boolean);
      const incoming = s(f.req).split(/\s*·\s*/).map((r) => r.trim()).filter(Boolean);
      for (const addReq of incoming) {
        if (reqs.some((r) => r.toLowerCase() === addReq.toLowerCase())) continue;
        if (reqs.length >= MAX_MERGED_REQS) {
          console.error(`[report-dedup] dropped an obligation past the ${MAX_MERGED_REQS}-per-row cap on one excerpt key — dedup key may be too coarse here: ${addReq.slice(0, 80)}`);
          continue;
        }
        reqs.push(addReq);
      }
      survivor.req = reqs.join(" · ");
      continue;
    }
    const copy: V4Finding = { ...f };
    byKey.set(k, copy);
    out.push(copy);
  }
  return out;
}

// FULL-requirement normalizer (NOT a similarity score): lowercase, drop leading/standalone
// articles, punctuation → space, collapse whitespace. Two findings collide ONLY when the
// entire requirement is the same sentence modulo articles/spacing — safe against over-collapse.
const normReqKey = (r: string): string =>
  s(r).toLowerCase().replace(/\b(?:a|an|the)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
export function dedupeNearFindings(list: V4Finding[]): V4Finding[] {
  const byKey = new Map<string, V4Finding>();
  const out: V4Finding[] = [];
  for (const f of list) {
    const k = normReqKey(f.req);
    if (!k) { out.push(f); continue; }          // empty req is never a dedup key
    const survivor = byKey.get(k);
    if (survivor) {
      // Same obligation restated. Keep the first row but PRESERVE the dropped row's citation —
      // a restatement grounded in a second authority (clause + rep/cert, §C + §H) is protest-
      // relevant dual-cite the report must still show. Merge distinct, non-empty cites with " · ".
      const cites = survivor.cite.split(/\s*·\s*/).filter(Boolean);
      const add = s(f.cite).trim();
      if (add && !cites.some((c) => c.toLowerCase() === add.toLowerCase())) survivor.cite = [...cites, add].join(" · ");
      continue;
    }
    const copy: V4Finding = { ...f };            // clone so the cite-merge never mutates the source finding
    byKey.set(k, copy);
    out.push(copy);
  }
  return out;
}

// Flag-ON (F-2): collapse §L rows resting on the IDENTICAL normalized excerpt (the same one-proposal / amendment-ack
// obligation restated across paraphrases). Keeps the first, drops the rest. Empty-excerpt rows never dedup. Flag-OFF:
// byte-identical (the raw filtered set is returned unchanged).
function dedupeLiteByExcerpt(list: FindingLite[]): FindingLite[] {
  if (!severityHonestEnabled()) return list;
  const seen = new Set<string>(); const out: FindingLite[] = [];
  for (const f of list) { const k = f.excerpt ? excerptHeadKey(f.excerptPreReground ?? f.excerpt) : ""; if (k && seen.has(k)) continue; if (k) seen.add(k); out.push(f); }
  return out;
}

// ── §L submission matrix (derived) ──
function buildSubmissionL(all: FindingLite[]): V4SubmissionL | { grounded: false } {
  const set = dedupeLiteByExcerpt(all.filter((f) => f.disposition !== "dropped" && (f.kind === "submission_instruction" || RE_L.test(s(f.citation)))));
  if (!set.length) return { grounded: false };
  const rows = set
    .slice()
    // ascending by citation numeric tail; NaN (both tail-less → Infinity-Infinity) must not corrupt the sort.
    .sort((a, b) => { const d = citeTail(s(a.citation)) - citeTail(s(b.citation)); return Number.isNaN(d) ? 0 : d; })
    // REPORT-TRUTH #3 — the engine does not type a volume grouping, so `vol` is OMITTED (undefined) rather than sent
    // as "": the renderer drops the whole Volume column instead of printing a header over blanks. Flag-OFF keeps ""
    // so the column still renders ⇒ byte-identical.
    .map((f) => ({ ...(panelComputeOrAbsent() ? {} : { vol: "" }), req: s(f.requirement), condition: s(f.excerpt || ""), cite: s(f.citation) }));
  return { grounded: true, rows };
}

// ── §M evaluation grid (derived; persisted order = descending importance, DO NOT re-sort) ──
function buildEvalM(all: FindingLite[]): V4EvalM | { grounded: false } {
  const set = all.filter((f) => f.disposition !== "dropped" && (f.kind === "evaluation_factor" || RE_M.test(s(f.citation))));
  if (!set.length) return { grounded: false };
  // REPORT-TRUTH #3 — a factor's `basis` IS computed (it is the finding's own excerpt/note), so it stays. The PANEL-level
  // `basis` — the one-line statement of the award basis — is not computed by anything and was emitted as "", rendering
  // an empty lead paragraph above the grid. Omitted under the flag so the renderer drops the paragraph entirely.
  const factors = set.map((f) => ({ name: s(f.requirement), basis: s(f.excerpt || f.note || ""), cite: s(f.citation) }));
  return { grounded: true, ...(panelComputeOrAbsent() ? {} : { basis: "" }), factors };
}

// ── CLIN structure (derived; degrade to CLIN + Title + Cite when attrs untyped) ──
function buildClins(all: FindingLite[], rawSource?: string): V4Clins | { grounded: false } {
  // REPORT-TRUTH #4 (flag AUDIT_CLIN_SCHEDULE_EXTRACT, default OFF ⇒ skipped ⇒ byte-identical). PREFER the schedule
  // the solicitation actually states. §B of run 95698f91 carries 26 line items with titles, quantities, pricing
  // arrangement and periods — while this panel was deriving CLINs from finding PROSE a few hundred lines away and
  // rendering a street number as a line item (#3). Findings are the FALLBACK now, not the source of truth: a stated
  // schedule beats an inferred one, and when §B states nothing the panel degrades exactly as before.
  if (process.env.AUDIT_CLIN_SCHEDULE_EXTRACT === "true" && rawSource) {
    const sched = extractClinSchedule(rawSource);
    if (sched.length) return { grounded: true, rows: sched.map((r) => ({ clin: r.clin, title: r.title ?? "", ...(r.type ? { type: r.type } : {}), ...(r.qtyUnit ? { qtyUnit: r.qtyUnit } : {}), ...(r.period ? { period: r.period } : {}) })) };
  }
  const set = all.filter((f) => f.disposition !== "dropped" && (f.kind === "clin" || RE_CLIN.test(s(f.citation))));
  if (!set.length) return { grounded: false };
  const rows = set.map((f) => {
    // REPORT-TRUTH #3 — the CLIN number must be ANCHORED to a line-item marker, never scraped as "any 4-digit token".
    // The bare /\b(\d{4})\b/ scrape over finding PROSE is what put CLIN "1810" in the customer's report on run
    // 95698f91 — the street number of 1810 Jefferson Blvd. Run against that run's real findings it also produced
    // "2026" from dates, "1984" from a FAR reference, and "7012"/"7008"/"7003"/"7004" — the SUFFIXES OF DFARS CLAUSE
    // NUMBERS like 252.204-7012 — every one of them rendered to the customer as a contract line item.
    // Unanchored ⇒ the cell is OMITTED (and if no row anchors, the renderer drops the CLIN column) — never invented.
    const clinNo = panelComputeOrAbsent()
      ? (ANCHORED_CLIN.exec(s(f.requirement)) || ANCHORED_CLIN.exec(s(f.citation)) || [])[1]
      : ((s(f.requirement).match(/\b(\d{4})\b/) || s(f.citation).match(/\b(\d{4})\b/) || [])[1] || "");
    return panelComputeOrAbsent()
      // type / qtyUnit / period: FindingLite carries no field for any of them, so they were never computed — omitted,
      // not emptied, so the renderer cannot draw three permanently-blank columns that imply the source is silent.
      ? { ...(clinNo ? { clin: clinNo } : {}), title: s(f.requirement) }
      : { clin: clinNo, title: s(f.requirement), type: "", qtyUnit: "", period: "" };
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

function buildDates(responseDeadline: string, cj: Record<string, unknown>, amended?: AmendedDue): V4Date[] {
  // Card #479 — the §06 Key Dates "Offers due" row carries the SAME reset/reconcile caveat as the masthead (offerDueFact),
  // so a reader scanning Key Dates alone isn't misled that a reset-TBD date is firm. Under the base flags this is the bare
  // date exactly as before (offerDueFact returns {value, sub:undefined}) → byte-identical.
  if (!responseDeadline) return [];
  const od = offerDueFact(responseDeadline, cj, amended);
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

// Vehicle F3 · masthead deadline reconcile (flag AUDIT_MASTHEAD_DEADLINE_RECONCILE, default-OFF) — DOMAIN RULING
// (Brain, card #736): the offer-due date hierarchy is (a) an executed SF-30 amendment in the package = AUTHORITATIVE;
// (b) SAM `response_deadline` metadata = fallback ONLY when no in-package amendment touches the date; (c) notice-body
// UPDATEs = annotations, never the rendered date. NEVER render a date absent from every artifact. The engine does NOT
// extract the SF-30 amended date into any structured field (cj.deadlines empty; notice_body_deadline reset_tbd/date=null
// — card #735), so the amended date lives ONLY in raw_pdf_text. This parses the executed SF-30 "SUMMARY OF CHANGES →
// Response Due Date <from> <to>" and returns the amended (To) date. Conservative: fires ONLY inside SF-30/amendment
// context AND only on an unambiguous From→To pair; anything else → null (SAM stays authoritative). SAM-floor is applied
// by the caller (override only when strictly later than SAM). Pure; raw_pdf_text scan is a cheap targeted regex.
// PER-CALL (not a module const) so the flag is honoured at render time, not frozen at import — matches severityHonestEnabled.
const mastheadDeadlineReconcileEnabled = (): boolean => process.env.AUDIT_MASTHEAD_DEADLINE_RECONCILE === "true";
const MONTH_IX_V4: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function ddMonYyyyToIso(d: string): string | null {
  const m = d.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTH_IX_V4[m[2].toLowerCase()];
  if (mo === undefined) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}
export function extractAmendmentDueDate(rawText: string): { iso: string; display: string } | null {
  if (!rawText) return null;
  if (!/summary of changes|amendment of solicitation/i.test(rawText)) return null; // SF-30 context required
  // "Response Due Date <FROM date> <TO date>" — a From→To change table; the SECOND (To) date is the amended value.
  const m = rawText.match(/Response Due Date\s+(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\s+(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/i);
  if (!m) return null;
  const iso = ddMonYyyyToIso(m[2]);
  if (!iso) return null;
  return { iso, display: fmtDeadline(iso) };
}

type AmendedDue = { iso: string; display: string } | null;
export function offerDueFact(responseDeadline: string, cj: Record<string, unknown>, amended?: AmendedDue): { value: string; sub?: string } {
  const prior = { value: fmtDeadline(responseDeadline), sub: deadlineConflictNote(responseDeadline, cj) ?? undefined };
  // Card #477 ruling 2 — the notice-body UPDATE-stack state (flag AUDIT_DEADLINE_UPDATE_STACK; present only when on)
  // TAKES PRECEDENCE: it read the newest UPDATE and knows whether the due date was RESET, so it surfaces the TRUE state
  // instead of the stale-metadata reconcile that harvested an UPDATE-header/RFI-filename date ("document states 24 Jun").
  // SAM stays the masthead FLOOR; this only powers the caveat. Absent (flag OFF) ⇒ falls through unchanged (byte-identical).
  const nb = cj.notice_body_deadline as { status?: string; date?: string | null; lastStated?: { date: string } | null; note?: string } | undefined;
  // (a) executed SF-30 amendment = AUTHORITATIVE (SAM-floor already applied by the caller). Render the amended date
  // with provenance; when a later notice UPDATE signals the date was reset again, append a pending-revision caveat.
  // This supersedes both the reset_tbd fallback and the cj.deadlines reconcile — an in-package executed amendment
  // touches the date, so SAM metadata is no longer the fallback (DOMAIN RULING b). Flag gate is on `amended` being set.
  if (mastheadDeadlineReconcileEnabled() && amended) {
    const pending = nb?.status === "reset_tbd";
    return {
      value: amended.display,
      sub: `Per the executed amendment (SF-30) — current offer-due date.${pending ? " A later notice indicates a further revision may be pending; verify against the latest amendment." : ""}`,
    };
  }
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
  // Was a LOCAL regex with no word boundaries: bare `void` matched inside "aVOID" and bare `prior` inside
  // "PRIORity", so a LIVE deadline was rendered as superseded. Now the one shared recognizer (engine audit pass 1).
  const isDead = isDeadDateLabel;
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
  // REPORT-TRUTH #1 — documents READ but not ANALYZED, passed straight through from the engine's own coverage answer
  // (executor-v3 `deriveAnalyzedDocuments` ← orchestrator `uncoveredForGap`). NOT recomputed here: the whole defect was
  // the display layer deriving its own, weaker version of a fact the engine had already established correctly.
  // Absent (flag-OFF / legacy rows) ⇒ undefined ⇒ nothing renders ⇒ byte-identical.
  const unanalyzed = ((docs as { unanalyzed?: Array<{ name: string; reason?: string }> } | undefined)?.unanalyzed || [])
    .map((u) => (u.reason ? `${u.name} — ${u.reason}` : u.name));
  const analyzedCount = (docs as { analyzed?: number } | undefined)?.analyzed;
  return {
    state, lead: docs?.note || "", read, indexed: 0, total, core, missing, unreadable,
    ...(unanalyzed.length ? { unanalyzed } : {}),
    ...(unanalyzed.length && typeof analyzedCount === "number" ? { analyzed: Math.min(analyzedCount, total) } : {}),
  } as V4Coverage;
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
  // A PRE-V3 AUDIT IS ADAPTED, NOT DECLARED UNLOADABLE. 29 of the 105 complete audits predate the
  // v3 engine and carry 38-39 populated v2 fields plus overview_json and risks_json. Falling
  // straight through to the INCOMPLETE branch below would have told those customers their report
  // "could not be loaded ... re-run", which is false — the analysis is there, in the older shape.
  // The INCOMPLETE branch stays, and is still reached when there is genuinely nothing to read.
  const p = (cj.v3 as V3ReportPayload | undefined) ?? adaptV2ToV3Payload(audit) ?? {
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
  // Vehicle F3 · masthead deadline reconcile (flag AUDIT_MASTHEAD_DEADLINE_RECONCILE) — extract the executed SF-30
  // amended offer-due date from raw_pdf_text ONCE, SAM-floor guarded (override only when strictly LATER than SAM, or
  // SAM absent — an earlier doc date is a stale original and never wins). null ⇒ SAM stays authoritative (byte-identical).
  const amendedRaw = mastheadDeadlineReconcileEnabled() ? extractAmendmentDueDate(s(audit.raw_pdf_text)) : null;
  const samMsForAmend = Date.parse(responseDeadline);
  const amended: AmendedDue = amendedRaw && (Number.isNaN(samMsForAmend) || Date.parse(amendedRaw.iso) > samMsForAmend) ? amendedRaw : null;
  const pole = s(p.verdict) as Pole;
  // authoritative completeness = the top-level compliance_json.documents_complete (C-group truth-source,
  // sibling of v3 — same field shouldGateExport reads), so the report state matches the export gate.
  const documentsComplete = (cj.documents_complete as boolean | undefined) === true
    || (cj.documents_complete === undefined && p.documents?.complete === true);

  // ── masthead — audit-row columns only (Brain #5), never compliance_json ──
  const facts: V4Fact[] = [];
  if (agency) facts.push({ k: "Agency", v: agency });
  // Vehicle F2 · F-4 (flag AUDIT_MASTHEAD_OFFICE_LEAF, default-OFF) — surface the issuing-office leaf (e.g. AFSC/PZIOC,
  // the org that authored §I) when the engine captured it. COMPUTE-OR-ABSENT: rendered ONLY when office_leaf is
  // populated; when the column is empty it is silently absent (never a fabricated leaf). Flag-OFF: byte-identical.
  if (process.env.AUDIT_MASTHEAD_OFFICE_LEAF === "true") {
    const leaf = s(audit.office_leaf);
    if (leaf) facts.push({ k: "Issuing office", v: leaf });
  }
  if (naics) facts.push({ k: "NAICS", v: naics, mono: true });
  // Vehicle F2 · F-3 (flag AUDIT_SETASIDE_HEADER_RECONCILE, default-OFF) — the header must not ASSERT a set-aside the
  // body denies. Raw SAM `set_aside` is sometimes an agency/metadata label ("SBA") with no operative clause. When the
  // engine's own body finding says no operative set-aside exists (52.219-6 absent) AND no set_aside_type is typed, the
  // header DERIVES from that finding instead of parroting the metadata. Flag-OFF: raw value (byte-identical).
  if (setAside) {
    const setAsideType = s(audit.set_aside_type);
    const bodyDeniesSetAside = process.env.AUDIT_SETASIDE_HEADER_RECONCILE === "true"
      && !setAsideType
      // THE ANALYZED SPAN, not the displayed one (review round 5, finding #1). This predicate asks what the
      // ENGINE FOUND — "did the body deny the set-aside?" — and then overrides a SAM-sourced masthead fact with
      // the answer. Its three siblings in this file were converted; this one was missed, and it is the one with
      // the largest blast radius. Reproduced against the real pass: where the source wraps as "…no socioeconomic
      // set-aside\napplies; offerors shall submit unit prices…", a pricing finding quoting from "applies;" gets
      // its head restored — legitimately, the classification guard sees no change — and the widened DISPLAY span
      // now contains "no socioeconomic set-aside" while the span the analysis actually examined does not. The
      // masthead would flip to "None confirmed" on the strength of text no lens ever read. [[L45]]
      && (p.findings || []).some((f) => /no\s+socioeconomic\s+set.?aside|52\.219-6\s+(is\s+)?absent/i.test(
        `${s(f.requirement)} ${s((f as { excerptPreReground?: string }).excerptPreReground ?? f.excerpt)}`));
    if (bodyDeniesSetAside) {
      facts.push({ k: "Set-aside", v: "None confirmed", sub: `SAM coding "${setAside}" present; no operative set-aside clause (52.219-6 absent) — confirm` });
    } else {
      facts.push({ k: "Set-aside", v: setAside });
    }
  }
  // #329: label is "Offers due" (this is the RESPONSE deadline, not a delivery date — the old "Delivery" mislabel
  // was a customer-facing error) and the value is formatted to preserve the wall-clock cutoff + offset.
  if (responseDeadline) { const od = offerDueFact(responseDeadline, cj, amended); facts.push({ k: "Offers due", v: od.value, sub: od.sub }); }
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
    rationale: sanitizeProse(p.reason),    // verbatim in substance; strips only leaked machine artifacts (#612-3d)
    // Vehicle F · D2 — thread the engine's enumerated no-verdict cause (absent on pre-D2 records ⇒ renderer fail-loud
    // neutral string, never a fabricated conflict). Omitted-when-absent keeps pre-D2 V4Data byte-identical.
    ...(p.noVerdictCause ? { noVerdictCause: p.noVerdictCause } : {}),
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
    clins: buildClins(all, s(audit.raw_pdf_text)),
    dates: buildDates(responseDeadline, cj, amended),
    provenance,
  } as V4Data;
}
