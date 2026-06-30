// GAP C — the GRADUATED engine OWNS the customer report.
//
// The proven engine (auditPackage → deriveVerdict) emits a GATE verdict
// (BID / BID_WITH_CAUTION / NO_BID / INELIGIBLE / NEEDS_HUMAN_REVIEW /
// INCOMPLETE) plus grounded findings + a coverage ledger — NOT V1's prose
// overview / 0-100 score / win-themes. Rather than force that into V1's column
// shapes (which would render blanks and violate the no-blank honesty rule),
// the agentic path renders its OWN full customer report from the engine's
// structured output: every section is a real grounded finding with a verbatim
// citation. Pure (no I/O, no model) → renderable from a $0 gold proof OR from
// the persisted live row.
//
// RENDER = the Design-owned "Bid Decision Memo" (CEO-AGENTIC-REPORT-V3.html),
// ported 1:1 from Claude Design. The verdict color system is the moat: an
// honest failure must never read like a decision. The disclosure band + the
// coverage ledger are LOAD-BEARING honesty surfaces, not chrome — they are
// derived deterministically from the persisted manifest reconciliation, never
// authored. No improvising beyond the design (per design-ownership rule).

import { disposeFinding } from "./audit-decide";
import type { Decision } from "./audit-decide";

/** Compact, persistable finding — the unit the report renders. `disposition` is
 *  the derived bucket (show-stopper / gate / met) so the renderer needs no
 *  engine logic. The typed fields (kind/controllability/severity/…) are carried
 *  through (widened per Brain card 124) so Tier-2 surfaces (§L matrix · §M
 *  factors · clause register · curability labels) can render off persisted data
 *  without re-running the engine. The current austere memo does not render them. */
export interface FindingLite {
  requirement: string;
  citation: string;
  excerpt?: string;
  note?: string;              // Step 10 (gate-framing) — short plain-language note under the requirement (Design contract). Absent today ⇒ flag-OFF byte-identical.
  disposition: "disqualifying" | "gate_to_clear" | "met" | "dropped";
  // Carried through for Tier-2 (persist-only today — NOT rendered by the memo):
  kind?: string;
  controllability?: string;
  severity?: "P0" | "P1" | "P2";
  requiredAttribute?: string;
  curableInWindow?: boolean;
}

/** The agentic report payload persisted to compliance_json.v3 and consumed by
 *  the report + PDF routes. Self-contained: everything the renderer needs. */
export interface V3ReportPayload {
  verdict: string;
  eligible: boolean | null;  // null = "not determined" on an honest-fail verdict (doctrine #6); persist-only, renderer keys off verdict
  reason: string;
  // STEP 10 (gate-framing) data-contract additions — both optional / absent today, so flag-OFF is byte-identical.
  verdictSub?: string;       // optional verdict-band one-liner override; falls back to the presentation default.
  profileVerified?: boolean; // true ONLY when a firm profile was affirmatively verified. Green "satisfied" renders only then; default is neutral slate (doctrine #1/#6). INELIGIBLE requires this true.
  showStoppers: FindingLite[];
  findings: FindingLite[];
  // coreMissing = core UCF sections (C/L/M) NOT present in the package at all. The
  // verdict says nothing about these — they must be disclosed loudly, never hidden.
  coverage: { required: string[]; covered: string[]; missing: string[]; coreMissing?: string[] };
  // Document-manifest reconciliation vs SAM (the fail-safe for "all files fetched"):
  // reconciled = we HAD SAM's manifest to compare against (false = manifest-assembly
  // failed → single-doc fallback → cannot claim completeness). posted/read = manifest
  // count vs what we ingested. complete = the deterministic guarantee. missing names
  // every posted file we could NOT pull. null = genuine upload (no SAM manifest).
  documents?: {
    reconciled: boolean;
    posted: number;
    read: number;
    complete: boolean;
    missing: Array<{ name: string; reason?: string }>;
    note?: string;
  } | null;
  generatedAt?: string;
}

export interface V3ReportMeta {
  solicitationNumber?: string | null;
  title?: string | null;
  agency?: string | null;
  naicsCode?: string | null;
  setAside?: string | null;
  responseDeadline?: string | null;
  auditId?: string | null;
}

// Standard HTML escaping. `$` is NOT special in HTML text — it only mangled the
// V1 renderer because that code used it inside a regex replacement string; plain
// interpolation here is safe.
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build the persist payload from a raw engine Decision + coverage + findings.
 *  Used by both the live executor and the $0 gold-proof render. */
export function buildV3Payload(
  decision: Decision,
  coverage: { required: string[]; covered: string[]; missing: string[]; coreMissing?: string[] },
  rawFindings: Array<RawLiteInput>,
  generatedAt?: string,
): V3ReportPayload {
  return {
    verdict: decision.verdict,
    eligible: decision.eligible,
    reason: decision.reason,
    showStoppers: decision.showStoppers.map(lite),
    findings: rawFindings.map(lite),
    coverage: { required: coverage.required, covered: coverage.covered, missing: coverage.missing, coreMissing: coverage.coreMissing ?? [] },
    generatedAt,
  };
}

type RawLiteInput = {
  requirement: string; citation: string; excerpt?: string;
  kind?: string; controllability?: string;
  severity?: "P0" | "P1" | "P2"; requiredAttribute?: string; curableInWindow?: boolean;
};
const lite = (f: RawLiteInput): FindingLite => ({
  requirement: f.requirement,
  citation: f.citation,
  excerpt: f.excerpt,
  // disposeFinding only needs kind + controllability.
  disposition: disposeFinding({ kind: f.kind, controllability: f.controllability } as never),
  // Tier-2 carry-through (persist-only): keep only the fields that are present.
  ...(f.kind != null ? { kind: f.kind } : {}),
  ...(f.controllability != null ? { controllability: f.controllability } : {}),
  ...(f.severity != null ? { severity: f.severity } : {}),
  ...(f.requiredAttribute != null ? { requiredAttribute: f.requiredAttribute } : {}),
  ...(f.curableInWindow != null ? { curableInWindow: f.curableInWindow } : {}),
});

// ── verdict → presentation contract (the moat lives here; ported from Design) ──
interface VerdictPres { word: string; cls: string; kind: "decision" | "unresolved"; eyebrow: string; sub: string; }

// STEP 10 · AUDIT_GATE_FRAMING (doctrine #8) — default-OFF, Step-7 wiring template (`=== "true"`). Reframes the
// verdict band from ADVICE ("Recommendation / submit / do not bid") to GATE language ("gate, not advice") — the
// presentation side of zero-contract-loss (the tool surfaces a gate; the human makes the call). Flag OFF ⇒
// verdictPres returns the current contract BYTE-IDENTICALLY (the early-return below is skipped).
export function gateFramingEnabled(): boolean { return process.env.AUDIT_GATE_FRAMING === "true"; }

// GATE-FRAMING presentation (doctrine #8: name the gate + state its condition; never issue an instruction).
// PORTED 1:1 from Design's `Agentic Report v3 - Retrofit.html` VERDICTS map (card 126-R, Brain-selected v3).
// eyebrow = gate name · sub = one plain factual sentence, no verb of instruction. INVARIANT: word/cls/kind are
// IDENTICAL to verdictPres (the color moat never changes); only eyebrow + sub reframe. OUT_OF_SCOPE is the 7th state.
export function gateFramingPres(v: string): VerdictPres {
  switch (v) {
    case "BID":                return { word: "BID",                cls: "v-bid",     kind: "decision",   eyebrow: "No gate found",              sub: "A clean reading surfaced no blocking condition." };
    case "BID_WITH_CAUTION":   return { word: "BID — WITH CAUTION", cls: "v-caution", kind: "decision",   eyebrow: "Gates to clear",            sub: "Biddable once the conditions below are met — each is clearable by the bidder." };
    case "NO_BID":             return { word: "NO-BID",             cls: "v-stop",    kind: "decision",   eyebrow: "Closing gate",              sub: "A condition is present that no offeror can clear — the requirement forecloses an award for everyone." };
    case "INELIGIBLE":         return { word: "INELIGIBLE",         cls: "v-stop",    kind: "decision",   eyebrow: "Eligibility gate",          sub: "A structural bar stands between this bidder and an award." };
    case "NEEDS_HUMAN_REVIEW": return { word: "NEEDS HUMAN REVIEW", cls: "v-slate",   kind: "unresolved", eyebrow: "Gate undetermined",         sub: "The verdict turns on a fact we can't confirm — a human must resolve it." };
    case "INCOMPLETE":         return { word: "INCOMPLETE",         cls: "v-slate",   kind: "unresolved", eyebrow: "Coverage gate · no charge", sub: "Not enough of the document resolved to call the gate; nothing was charged." };
    case "OUT_OF_SCOPE":       return { word: "OUT OF SCOPE",       cls: "v-slate",   kind: "unresolved", eyebrow: "Outside scope · no charge", sub: "This package is outside what FARaudit assesses; no gate was evaluated, and nothing was charged." };
    default:                   return { word: v,                    cls: "v-slate",   kind: "unresolved", eyebrow: "Gate undetermined",         sub: "" };
  }
}

export function verdictPres(v: string, gateFraming: boolean = gateFramingEnabled()): VerdictPres {
  if (gateFraming) return gateFramingPres(v);   // flag ON → gate-language framing (placeholder copy pending Design)
  switch (v) {
    case "BID":                return { word: "BID",                cls: "v-bid",     kind: "decision",   eyebrow: "Recommendation",                  sub: "Clean fit — submit." };
    case "BID_WITH_CAUTION":   return { word: "BID — WITH CAUTION", cls: "v-caution", kind: "decision",   eyebrow: "Recommendation",                  sub: "Biddable once the gates below are cleared." };
    case "NO_BID":             return { word: "NO-BID",             cls: "v-stop",    kind: "decision",   eyebrow: "Recommendation",                  sub: "Do not bid — an unwinnable requirement is present." };
    case "INELIGIBLE":         return { word: "INELIGIBLE",         cls: "v-stop",    kind: "decision",   eyebrow: "Recommendation",                  sub: "A structural eligibility bar blocks an award." };
    case "NEEDS_HUMAN_REVIEW": return { word: "NEEDS HUMAN REVIEW", cls: "v-slate",   kind: "unresolved", eyebrow: "No verdict reached",              sub: "No verdict reached — the basis is below; a person must make the call." };
    case "INCOMPLETE":         return { word: "INCOMPLETE",         cls: "v-slate",   kind: "unresolved", eyebrow: "Assessment incomplete · no charge", sub: "We could not read all of the binding content — so we did not issue a verdict, and did not charge for this audit." };
    default:                   return { word: v,                    cls: "v-slate",   kind: "unresolved", eyebrow: "No verdict reached",              sub: "" };
  }
}

// Inline icon paths (24×24 stroke). Ported from Design.
const ICO = {
  go: '<path d="M5 12l5 5L20 7"/>',
  dash: '<path d="M5 12h14"/>',                // Step 10: neutral "checked — solicitation facts only"
  alert: '<path d="M10.3 3.3L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  pause: '<path d="M8 6v12M16 6v12"/>',
  doc: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>', // Step 10: OUT_OF_SCOPE
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
function svg(p: string, sw = 2): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

// UCF section labels for the coverage chips (key is a bare letter, e.g. "C").
const UCF_LABEL: Record<string, string> = {
  A: "Solicitation form", B: "Supplies / services & prices", C: "Statement of work / specs",
  D: "Packaging & marking", E: "Inspection & acceptance", F: "Deliveries / performance",
  G: "Contract administration", H: "Special requirements", I: "Contract clauses",
  J: "Attachments", K: "Reps & certs", L: "Instructions to offerors", M: "Evaluation factors",
};
const UCF_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
const CORE_LABEL: Record<string, string> = {
  C: "§C Statement of Work / specifications", L: "§L Instructions to offerors", M: "§M Evaluation factors",
};

// Format an ISO timestamp as "28 Jun 2026 · 14:18 UTC"; pass through on parse fail.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtGenerated(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

// ── disclosure cards — derived DETERMINISTICALLY from the manifest reconciliation
//    + core-section presence. These are the load-bearing honesty surfaces; the
//    copy is the panel-approved wording, never authored per-audit. ──
interface Disc { tone: "confirm" | "caution" | "slate" | "stop"; icon: "go" | "alert"; head: string; text: string; files?: string[]; }
function deriveDisclosures(payload: V3ReportPayload, coreMissing: string[]): Disc[] {
  const out: Disc[] = [];

  // Core-section absence is the most severe disclosure → lead with it.
  if (coreMissing.length) {
    const names = coreMissing.map((k) => CORE_LABEL[k] || `§${k}`).join("; ");
    const one = coreMissing.length === 1;
    out.push({
      tone: "stop", icon: "alert",
      head: `Core section${one ? "" : "s"} not found`,
      text: `<b>${escapeHtml(names)}</b> ${one ? "was" : "were"} not present in the readable set — ${one ? "it was" : "they were"} <b>not analyzed</b>. A missing core section caps the result; no confident verdict can be issued over content that was not read. Confirm whether the agency posted ${one ? "this section" : "these sections"} on SAM.gov.`,
    });
  }

  // NEEDS_HUMAN_REVIEW has FOUR distinct triggers (audit-decide.ts: verification failure ·
  // expert conflict · untyped bar fails-closed · untyped eligibility under null profile) — so
  // the disclosure must stay CAUSE-AGNOSTIC. The specific basis is carried verbatim by the
  // verdict reason above; asserting a single cause (e.g. "conflict") here would fabricate it
  // for 3 of 4 triggers. NOTE: this treatment is provisional, pending Brain's doctrine ruling.
  if (payload.verdict === "NEEDS_HUMAN_REVIEW") {
    out.push({
      tone: "slate", icon: "alert",
      head: "Held for human review — no verdict issued",
      text: "The engine reached this point without a verdict it could stand behind, so it is holding the decision for a person rather than guessing. The specific basis is stated above — read the cited sections before deciding.",
    });
  }

  const d = payload.documents;
  if (d) {
    // Coerce counts to safe integers — a legacy/malformed cj.v3 can carry undefined/string
    // counts that render "Read undefined of undefined" AND (being raw-interpolated into the
    // disclosure text to allow <b>) are an injection vector. A number cannot carry markup.
    const read = Number.isFinite(Number(d.read)) ? Math.max(0, Math.trunc(Number(d.read))) : 0;
    const posted = Number.isFinite(Number(d.posted)) ? Math.max(0, Math.trunc(Number(d.posted))) : 0;
    const missing = Array.isArray(d.missing) ? d.missing : [];
    // Gate on `=== false` (not `!d.reconciled`): a row persisted before `reconciled` existed has
    // it undefined — that must fall through, NOT show a false "not confirmed" on a complete audit.
    // posted<=0 (a fieldless/zero-manifest object) also routes here rather than emit "Read 0 of 0".
    if (d.reconciled === false || posted <= 0) {
      out.push({
        tone: "caution", icon: "alert",
        head: "Document set — not confirmed",
        text: `Read all <b>${read} document${read === 1 ? "" : "s"} provided</b> and grounded every finding in them — but <b>could not reconcile against SAM's posted manifest</b>. A late amendment or additional attachment, if one exists, would not be reflected here. Re-run from the solicitation number to upgrade this to a confirmed verdict.`,
      });
    } else if (d.complete && missing.length === 0 && read >= posted) {
      // Green "complete" ONLY when internally consistent — an object claiming complete:true yet
      // listing missing files (or read<posted) must fall through to partial, never vouch.
      out.push({
        tone: "confirm", icon: "go",
        head: "Document set — complete",
        text: `Retrieved and read <b>every document the agency posted</b> to SAM.gov (${posted} file${posted === 1 ? "" : "s"}), including amendments as of the generation time.`,
      });
    } else {
      out.push({
        tone: "caution", icon: "alert",
        head: "Document set — partial",
        text: `Read <b>${read} of ${posted}</b> document${posted === 1 ? "" : "s"} the agency posted to SAM.gov.${d.note ? ` ${escapeHtml(d.note)}` : ""} This verdict reflects only the documents we could read — add the missing files for a complete audit.`,
        files: missing.map((m) => (m.reason ? `${m.name} — ${m.reason}` : `${m.name} — retrieval failed; re-run to recover`)),
      });
    }
  }
  return out;
}

function discCard(b: Disc): string {
  const files = b.files && b.files.length
    ? `<div class="d-files">${b.files.map((f) => `<span class="d-file">${escapeHtml(f)}</span>`).join("")}</div>`
    : "";
  return `<div class="disc d-${b.tone}"><span class="d-mk">${svg(b.icon === "go" ? ICO.go : ICO.alert, 2.4)}</span>` +
    `<div><div class="d-h">${escapeHtml(b.head)}</div><div class="d-t">${b.text}</div>${files}</div></div>`;
}

function findCard(f: FindingLite): string {
  const cite = f.citation ? `<span class="find-cite">${escapeHtml(f.citation)}</span>` : "";
  const note = f.note && f.note.trim() ? `<p class="find-note">${escapeHtml(f.note.trim())}</p>` : "";   // Step 10 (Design contract)
  const ex = f.excerpt && f.excerpt.trim()
    ? `<div class="excerpt"><p>“${escapeHtml(f.excerpt.trim().slice(0, 420))}”</p><span class="src">Verbatim — ${escapeHtml(f.citation || "posted solicitation")}</span></div>`
    : "";
  return `<div class="find"><div class="find-top"><div class="find-req">${escapeHtml(f.requirement)}</div>${cite}</div>${note}${ex}</div>`;
}

function findGroup(title: string, items: FindingLite[], cls: string, icon: string, emptyTxt: string, lead?: string): string {
  const head = `<div class="fg-h"><span class="fmk">${svg(icon, 2.6)}</span>${escapeHtml(title)}${items.length ? ` <span class="cnt">${items.length}</span>` : ""}</div>`;
  if (!items.length) return `<div class="fgroup ${cls}">${head}<div class="fg-empty">${escapeHtml(emptyTxt)}</div></div>`;
  const leadHtml = lead ? `<p class="fg-lead">${escapeHtml(lead)}</p>` : "";   // Step 10: solicitation-facts-only neutral lead
  return `<div class="fgroup ${cls}">${head}${leadHtml}${items.map(findCard).join("")}</div>`;
}

/** Render the full board-room-grade agentic customer report (web + PDF). */
export function renderV3Report(payload: V3ReportPayload, meta: V3ReportMeta): string {
  // Defensive normalization — a corrupted / schema-drifted persisted cj.v3 (present but
  // partial) must render an honest, readable report, never throw a 500 on the customer route.
  // Normalize EACH array field individually — a schema-drifted/legacy cj.v3 can carry a
  // present-but-fieldless coverage object ({covered:[...]} with no required/missing), which
  // would throw "not iterable" / "reading length" and 500 the customer route (panel CODE blocker).
  const cov = (payload.coverage ?? {}) as Partial<V3ReportPayload["coverage"]>;
  const coverage = {
    required: Array.isArray(cov.required) ? cov.required : [],
    covered: Array.isArray(cov.covered) ? cov.covered : [],
    missing: Array.isArray(cov.missing) ? cov.missing : [],
    coreMissing: Array.isArray(cov.coreMissing) ? cov.coreMissing : [],
  };
  const allFindings = Array.isArray(payload.findings) ? payload.findings : [];
  const allShowStoppers = Array.isArray(payload.showStoppers) ? payload.showStoppers : [];

  const gf = gateFramingEnabled();   // Step 10 — flag OFF ⇒ every branch below is byte-identical to today.
  // Doctrine #4: INELIGIBLE asserts a verified failing profile. Under gate-framing, an INELIGIBLE without an
  // affirmatively-verified profile degrades to the honest NEEDS_HUMAN_REVIEW band (deriveVerdict already never
  // emits INELIGIBLE under a null profile — card 163 — so this is a defensive renderer guard, not a behavior change).
  const effectiveVerdict = (gf && payload.verdict === "INELIGIBLE" && payload.profileVerified !== true) ? "NEEDS_HUMAN_REVIEW" : payload.verdict;
  const V = verdictPres(effectiveVerdict, gf);
  const isUn = V.kind === "unresolved";
  const noCharge = gf ? (effectiveVerdict === "INCOMPLETE" || effectiveVerdict === "OUT_OF_SCOPE") : (effectiveVerdict === "INCOMPLETE");
  const eyebrowIco = isUn
    ? (effectiveVerdict === "INCOMPLETE" ? ICO.pause : (gf && effectiveVerdict === "OUT_OF_SCOPE") ? ICO.doc : ICO.alert)
    : (V.cls === "v-stop" ? ICO.alert : ICO.go);

  const gates = allFindings.filter((f) => f.disposition === "gate_to_clear");
  const met = allFindings.filter((f) => f.disposition === "met");
  const inlineStoppers = allFindings.filter((f) => f.disposition === "disqualifying");
  // The stopper group is the UNION of the verdict-driver showStoppers AND any disqualifying-
  // disposed finding, deduped by requirement+citation. A disqualifying finding is filtered out
  // of gates/met — so if it were neither in showStoppers nor unioned here it would render
  // NOWHERE (an honesty hole in the worst error class). Union guarantees it always surfaces.
  const stopperMap = new Map<string, FindingLite>();
  for (const f of [...allShowStoppers, ...inlineStoppers]) stopperMap.set(`${f.requirement}|||${f.citation}`, f);
  const stoppers = Array.from(stopperMap.values());

  const coreMissing = coverage.coreMissing ?? [];
  const disclosures = deriveDisclosures(payload, coreMissing);

  // Coverage chips: every required section ∪ any core section missing-from-package,
  // in UCF order. present = grounded. "Complete" requires BOTH every present binding
  // section grounded AND no core UCF section absent (a missing §M is not "complete").
  const coveredSet = new Set(coverage.covered);
  const sectionKeys = Array.from(new Set([...coverage.required, ...coreMissing]))
    .sort((a, b) => {
      const ia = UCF_ORDER.indexOf(a), ib = UCF_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const coverageComplete = coverage.missing.length === 0 && coreMissing.length === 0;
  const covChips = sectionKeys.map((k) => {
    const yes = coveredSet.has(k);
    const label = yes ? (UCF_LABEL[k] ? UCF_LABEL[k] : "read & grounded") : (coreMissing.includes(k) ? "not found — not analyzed" : "not grounded");
    return `<div class="chip ${yes ? "yes" : "no"}"><span class="cmk">${svg(yes ? ICO.go : ICO.x, 2.6)}</span>` +
      `<div><div class="ckey">§${escapeHtml(k)}</div><div class="clab">${escapeHtml(label)}</div></div></div>`;
  }).join("");

  const metaRows = [
    ["Solicitation", meta.solicitationNumber, true],
    ["Title", meta.title, false],
    ["Agency", meta.agency, false],
    ["NAICS", meta.naicsCode, true],
    ["Set-aside", meta.setAside, false],
    ["Response deadline", meta.responseDeadline, false],
  ].filter(([, v]) => v != null && String(v).trim())
   .map(([k, v, monoFlag]) => {
     const val = monoFlag ? `<span class="mono">${escapeHtml(v)}</span>` : escapeHtml(v);
     return `<div class="meta-row"><div class="k">${escapeHtml(k)}</div><div class="v">${val}</div></div>`;
   }).join("");

  const generatedAt = fmtGenerated(payload.generatedAt);

  const head =
    `<div class="doc-head">` +
      `<div class="dh-brand"><span class="dh-mk">F</span><div><div class="dh-wm">FAR<span class="au">audit</span></div>` +
      `<span class="dh-sub">Bid Decision Memo</span></div></div>` +
      `<div class="dh-right"><span class="dh-kind">${gf ? "Gate Assessment" : "Go / No-Go Assessment"}</span>` +
      (meta.solicitationNumber ? `<span class="dh-id">${escapeHtml(meta.solicitationNumber)}</span>` : "") +
      (generatedAt ? `<span class="dh-date">Generated ${escapeHtml(generatedAt)}</span>` : "") +
      `</div></div>` +
    (meta.title ? `<h1 class="doc-title">${escapeHtml(meta.title)}</h1>` : "");

  const verdict =
    `<div class="verdict ${V.cls}${isUn ? " is-unresolved" : ""}"><div class="vd-in">` +
      `<div class="vd-eyebrow"><span class="ico">${svg(eyebrowIco, 2.2)}</span>${escapeHtml(V.eyebrow)}</div>` +
      `<div class="vd-head"><span class="vd-word">${escapeHtml(V.word)}</span>${noCharge ? '<span class="vd-pill ghost">No charge</span>' : ""}</div>` +
      `<p class="vd-sub">${escapeHtml(payload.verdictSub || V.sub)}</p>` +
      (payload.reason ? `<p class="vd-reason">${escapeHtml(payload.reason)}</p>` : "") +
    `</div></div>`;

  const discBand = disclosures.length ? `<div class="disclosures">${disclosures.map(discCard).join("")}</div>` : "";

  const metaSec = metaRows
    ? `<div class="sec"><div class="sec-h"><span class="lbl">Solicitation</span><span class="ln"></span></div><div class="meta">${metaRows}</div></div>`
    : "";

  const covSec =
    `<div class="sec"><div class="sec-h"><span class="lbl">Coverage — UCF sections read</span><span class="ln"></span>` +
    `<span class="tag ${coverageComplete ? "tag-ok" : "tag-warn"}">${coverageComplete ? "Complete" : "Incomplete"}</span></div>` +
    `<p class="cov-lead">Which Uniform Contract Format sections the engine located and grounded its findings in. A finding is only made where the underlying section was read.</p>` +
    `<div class="cov-chips">${covChips || '<div class="chip no"><span class="cmk">' + svg(ICO.x, 2.6) + '</span><div><div class="clab">no binding sections detected</div></div></div>'}</div></div>`;

  // INCOMPLETE / honest-fail issues NO findings — the disclosures explain why; rendering
  // gates/met would imply a partial adjudication the engine explicitly declined to make
  // ("no verdict, no charge"). Design intent: findings:null for INCOMPLETE only — every
  // other verdict (incl. NEEDS_HUMAN_REVIEW) shows its findings.
  // OUT_OF_SCOPE (gate-framing 7th state) issues no findings, same as INCOMPLETE.
  const showFindings = gf ? (effectiveVerdict !== "INCOMPLETE" && effectiveVerdict !== "OUT_OF_SCOPE") : (effectiveVerdict !== "INCOMPLETE");
  // Doctrine #1/#3/#6: green "satisfied" ONLY on an affirmatively-verified profile; otherwise neutral slate
  // carrying solicitation-side facts only (never firm-capability claims). Flag OFF → current green group, byte-identical.
  const satVerified = payload.profileVerified === true;
  const satGroup = gf
    ? findGroup(satVerified ? "Already satisfied" : "Checked — solicitation facts only", met,
        satVerified ? "fg-ok" : "fg-neutral", satVerified ? ICO.go : ICO.dash, "Nothing checked yet.",
        satVerified ? undefined : "Solicitation-side facts the engine grounded at fetch — not a verification of your firm, since no profile was assessed.")
    : findGroup("Already satisfied", met, "fg-ok", ICO.go, "Nothing confirmed yet.");
  const findSec = showFindings
    ? `<div class="sec"><div class="sec-h"><span class="lbl">Findings</span><span class="ln"></span></div>` +
      findGroup("Show-stoppers", stoppers, "fg-stop", ICO.x, "None — no award-blocking requirement was found.") +
      findGroup("Gates to clear", gates, "fg-gate", ICO.alert, "None outstanding.") +
      satGroup +
      `</div>`
    : "";

  const foot =
    `<div class="doc-foot"><p>` +
    `<b>FARaudit deterministic compliance engine · v3</b>${meta.auditId ? ` · audit ${escapeHtml(meta.auditId)}` : ""}${generatedAt ? ` · ${escapeHtml(generatedAt)}` : ""}<br>` +
    `This memo reflects only content the engine could read and ground in the posted solicitation. Where binding content could not be retrieved, the engine reports an honest failure rather than a verdict. ` +
    `Facts (NAICS · set-aside · deadline) are authoritative from SAM.gov; the verdict is a gate, not advice.` +
    `</p></div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FARaudit · ${escapeHtml(meta.solicitationNumber ?? "Bid Decision Memo")}</title>
<style>${REPORT_CSS}${gf ? GATE_FRAMING_CSS : ""}</style></head><body>
<div class="topbar"><span class="tb-brand">FAR<span class="au">audit</span> · Agentic Verification Engine</span><span class="tb-actions"><a href="/audit">← Back to audits</a><button onclick="window.print()">Print / PDF</button></span></div>
<div class="deck"><div class="sheet">${head}${verdict}${discBand}${metaSec}${covSec}${findSec}${foot}</div></div>
</body></html>`;
}

/** Render directly from a persisted audit row (report + PDF routes branch here
 *  when compliance_json.engine === "agentic_v3"). */
export function renderAgenticReportFromRow(audit: Record<string, unknown>): string {
  const cj = (audit.compliance_json as Record<string, unknown> | null) ?? {};
  const payload = (cj.v3 as V3ReportPayload | undefined) ?? {
    verdict: "INCOMPLETE", eligible: false, reason: "Agentic report payload missing.",
    showStoppers: [], findings: [], coverage: { required: [], covered: [], missing: [] },
  };
  return renderV3Report(payload, {
    solicitationNumber: (audit.solicitation_number as string) ?? null,
    title: (audit.title as string) ?? null,
    agency: (audit.agency as string) ?? null,
    naicsCode: (audit.naics_code as string) ?? null,
    setAside: (audit.set_aside as string) ?? null,
    responseDeadline: (audit.response_deadline as string) ?? null,
    auditId: (audit.id as string) ?? null,
  });
}

// ── Design CSS — ported 1:1 from CEO-AGENTIC-REPORT-V3.html (switcher + mockup
//    fixtures dropped; screen-only topbar added). Verdict color system = the moat. ──
const REPORT_CSS = `
:root{
  --serif:ui-serif, Georgia, "Times New Roman", serif;
  --sans:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono:ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --page:#e7eaef; --paper:#ffffff; --ink:#15202e; --ink-2:#39475a; --mute:#65717f;
  --faint:#8a94a1; --rule:#dde2e9; --rule-2:#eaeef3; --rule-strong:#c3ccd6;
  --navy:#0A1628; --accent:#185FA5; --accent-2:#378ADD;
  --go:#0e7a4f; --go-deep:#0a5638; --go-tint:#eef7f1; --go-line:#c2e2cf;
  --cau:#b15309; --cau-deep:#8a3f06; --cau-tint:#fbf4ea; --cau-line:#eed9b6;
  --stop:#b1271f; --stop-deep:#891b15; --stop-tint:#fbeeed; --stop-line:#f0c9c5;
  --slate:#4a586a; --slate-deep:#33414f; --slate-tint:#eef1f5; --slate-line:#cdd5df;
}
*{box-sizing:border-box} html,body{margin:0;padding:0}
body{background:var(--page);font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased;line-height:1.5}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;background:rgba(13,21,34,.96);border-bottom:1px solid #1d2c44;padding:10px 20px;flex-wrap:wrap}
.topbar .tb-brand{color:#fff;font-weight:700;font-size:13px;letter-spacing:-.01em}
.topbar .tb-brand .au{color:#7fb3ec}
.topbar .tb-actions{display:flex;align-items:center;gap:14px}
.topbar a{font-size:12px;font-weight:600;color:#aab8cc;text-decoration:none}
.topbar a:hover{color:#fff}
.topbar button{appearance:none;border:1px solid #28385280;background:transparent;color:#aab8cc;font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer}
.topbar button:hover{color:#fff;border-color:#3a4f72}
.deck{padding:34px 20px 80px;display:flex;justify-content:center}
.sheet{width:100%;max-width:816px;background:var(--paper);border:1px solid var(--rule);box-shadow:0 1px 2px rgba(18,28,42,.05),0 24px 60px -34px rgba(18,28,42,.32);padding:54px 64px 40px}
.doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:2px solid var(--navy)}
.dh-brand{display:flex;align-items:center;gap:11px}
.dh-mk{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#378ADD,#185FA5 60%,#0d4885);color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px;box-shadow:inset 0 -2px 0 rgba(0,0,0,.18)}
.dh-wm{font-size:19px;font-weight:800;letter-spacing:-.02em;color:var(--navy)}
.dh-wm .au{color:var(--accent)}
.dh-brand .dh-sub{display:block;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-top:2px}
.dh-right{text-align:right;display:flex;flex-direction:column;gap:3px;padding-top:2px}
.dh-kind{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.dh-id{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--ink)}
.dh-date{font-family:var(--mono);font-size:10.5px;color:var(--mute)}
.doc-title{font-family:var(--serif);font-size:25px;line-height:1.2;font-weight:600;letter-spacing:-.01em;color:var(--ink);margin:22px 0 0;text-wrap:balance}
.verdict{margin-top:22px;border:1px solid var(--vd-line);border-left:none;background:var(--vd-tint);position:relative;overflow:hidden}
.verdict::before{content:"";position:absolute;left:0;top:0;bottom:0;width:7px;background:var(--vd)}
.verdict.is-unresolved::before{background:repeating-linear-gradient(135deg,var(--vd) 0 7px,var(--vd-deep) 7px 14px)}
.vd-in{padding:22px 26px 22px 30px}
.vd-eyebrow{display:flex;align-items:center;gap:10px;font-size:10.5px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--vd-deep);margin-bottom:11px}
.vd-eyebrow .ico{width:15px;height:15px;display:grid;place-items:center}
.vd-eyebrow .ico svg{width:15px;height:15px;stroke:var(--vd-deep)}
.vd-head{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}
.vd-word{font-size:38px;font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--vd-deep)}
.vd-pill{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#fff;background:var(--vd);border-radius:999px;padding:5px 12px;align-self:center}
.vd-pill.ghost{background:transparent;color:var(--vd-deep);border:1.5px solid var(--vd)}
.vd-sub{font-size:15px;font-weight:600;color:var(--ink);margin:12px 0 0;line-height:1.45}
.vd-reason{font-size:13.5px;line-height:1.62;color:var(--ink-2);margin:11px 0 0;max-width:64ch}
.vd-reason b{color:var(--ink);font-weight:700}
.v-bid{--vd:var(--go);--vd-deep:var(--go-deep);--vd-tint:var(--go-tint);--vd-line:var(--go-line)}
.v-caution{--vd:var(--cau);--vd-deep:var(--cau-deep);--vd-tint:var(--cau-tint);--vd-line:var(--cau-line)}
.v-stop{--vd:var(--stop);--vd-deep:var(--stop-deep);--vd-tint:var(--stop-tint);--vd-line:var(--stop-line)}
.v-slate{--vd:var(--slate);--vd-deep:var(--slate-deep);--vd-tint:var(--slate-tint);--vd-line:var(--slate-line)}
.disclosures{margin-top:14px;display:flex;flex-direction:column;gap:10px}
.disc{display:grid;grid-template-columns:30px 1fr;gap:13px;border:1px solid var(--d-line);background:var(--d-tint);border-radius:9px;padding:13px 16px 13px 14px;align-items:start}
.disc .d-mk{width:30px;height:30px;border-radius:7px;background:var(--d-mk);color:#fff;display:grid;place-items:center;margin-top:1px}
.disc .d-mk svg{width:16px;height:16px;stroke:#fff}
.disc .d-h{font-size:12px;font-weight:800;letter-spacing:.02em;color:var(--d-deep);text-transform:uppercase;margin:1px 0 4px}
.disc .d-t{font-size:13px;line-height:1.55;color:var(--ink-2)}
.disc .d-t b{color:var(--ink);font-weight:700}
.disc .d-files{margin:8px 0 0;display:flex;flex-direction:column;align-items:stretch;gap:5px}
.disc .d-file{font-family:var(--mono);font-size:11px;line-height:1.45;color:var(--d-deep);background:#fff;border:1px solid var(--d-line);border-radius:5px;padding:5px 10px 5px 22px;text-indent:-12px}
.disc .d-file::before{content:"✕ ";opacity:.65}
.d-confirm{--d-tint:var(--go-tint);--d-line:var(--go-line);--d-mk:var(--go);--d-deep:var(--go-deep)}
.d-caution{--d-tint:var(--cau-tint);--d-line:var(--cau-line);--d-mk:var(--cau);--d-deep:var(--cau-deep)}
.d-slate{--d-tint:var(--slate-tint);--d-line:var(--slate-line);--d-mk:var(--slate);--d-deep:var(--slate-deep)}
.d-stop{--d-tint:var(--stop-tint);--d-line:var(--stop-line);--d-mk:var(--stop);--d-deep:var(--stop-deep)}
.sec{margin-top:30px}
.sec-h{display:flex;align-items:center;gap:10px;margin:0 0 14px}
.sec-h .lbl{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--navy)}
.sec-h .ln{flex:1;height:1px;background:var(--rule)}
.sec-h .tag{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:5px}
.tag-ok{color:var(--go-deep);background:var(--go-tint);border:1px solid var(--go-line)}
.tag-warn{color:var(--cau-deep);background:var(--cau-tint);border:1px solid var(--cau-line)}
.meta{border:1px solid var(--rule);border-radius:9px;overflow:hidden}
.meta-row{display:grid;grid-template-columns:170px 1fr;border-top:1px solid var(--rule-2)}
.meta-row:first-child{border-top:none}
.meta-row .k{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);padding:11px 16px;background:#fafbfc;border-right:1px solid var(--rule-2);display:flex;align-items:center}
.meta-row .v{padding:11px 16px;font-size:13.5px;color:var(--ink);font-weight:500;display:flex;align-items:center;gap:8px}
.meta-row .v .mono{font-size:13px}
.cov-lead{font-size:12.5px;line-height:1.55;color:var(--mute);margin:0 0 13px;max-width:70ch}
.cov-chips{display:flex;flex-wrap:wrap;gap:9px}
.chip{display:flex;align-items:center;gap:9px;border:1px solid var(--rule);border-radius:8px;padding:9px 13px 9px 11px;min-width:128px;background:#fff}
.chip .cmk{width:20px;height:20px;border-radius:5px;display:grid;place-items:center;flex-shrink:0}
.chip .cmk svg{width:12px;height:12px}
.chip.yes .cmk{background:var(--go-tint);border:1px solid var(--go-line)}
.chip.yes .cmk svg{stroke:var(--go-deep)}
.chip.no .cmk{background:var(--stop-tint);border:1px solid var(--stop-line)}
.chip.no .cmk svg{stroke:var(--stop-deep)}
.chip .ckey{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--ink)}
.chip .clab{font-size:11px;color:var(--mute);line-height:1.2}
.chip.no .clab{color:var(--stop-deep)}
.fgroup{margin-top:20px}
.fgroup:first-child{margin-top:0}
.fg-h{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;margin:0 0 11px}
.fg-h .fmk{width:18px;height:18px;border-radius:5px;display:grid;place-items:center}
.fg-h .fmk svg{width:12px;height:12px;stroke:#fff;stroke-width:2.6}
.fg-h .cnt{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--faint);letter-spacing:0;text-transform:none}
.fg-stop .fg-h{color:var(--stop-deep)} .fg-stop .fmk{background:var(--stop)}
.fg-gate .fg-h{color:var(--cau-deep)} .fg-gate .fmk{background:var(--cau)}
.fg-ok .fg-h{color:var(--go-deep)} .fg-ok .fmk{background:var(--go)}
.fg-empty{font-size:13px;color:var(--mute);padding:2px 0 0 27px;font-style:italic}
.find{border:1px solid var(--rule);border-left-width:3px;border-radius:8px;padding:13px 16px;margin-top:9px;background:#fff}
.fg-stop .find{border-left-color:var(--stop)}
.fg-gate .find{border-left-color:var(--cau)}
.fg-ok .find{border-left-color:var(--go);padding:11px 16px}
.find-top{display:flex;align-items:baseline;justify-content:space-between;gap:14px}
.find-req{font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.4}
.fg-ok .find-req{font-weight:600}
.find-cite{font-family:var(--mono);font-size:10.5px;color:var(--mute);white-space:nowrap;flex-shrink:0;padding-top:2px}
.find-note{font-size:12.5px;line-height:1.55;color:var(--ink-2);margin:7px 0 0}
.excerpt{margin:11px 0 2px;border-left:2px solid var(--rule-strong);background:#f7f8fa;padding:10px 14px;border-radius:0 6px 6px 0}
.excerpt p{font-family:var(--serif);font-style:italic;font-size:12.5px;line-height:1.6;color:var(--ink-2);margin:0}
.excerpt .src{display:block;font-family:var(--mono);font-style:normal;font-size:10px;letter-spacing:.03em;color:var(--faint);margin-top:7px;text-transform:uppercase}
.doc-foot{margin-top:34px;padding-top:14px;border-top:1px solid var(--rule)}
.doc-foot p{font-family:var(--mono);font-size:10.5px;line-height:1.7;color:var(--faint);margin:0}
.doc-foot p b{color:var(--mute);font-weight:600}
@media print{
  @page{margin:14mm} body{background:#fff} .topbar{display:none!important}
  .deck{padding:0;display:block}
  .sheet{max-width:none;width:auto;border:none;box-shadow:none;padding:0}
  .verdict,.disc,.find,.meta,.chip,.fgroup,.sec{break-inside:avoid}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
@media (max-width:680px){
  .sheet{padding:34px 26px 30px}
  .doc-head{flex-direction:column;gap:14px} .dh-right{text-align:left}
  .meta-row{grid-template-columns:1fr}
  .meta-row .k{border-right:none;border-bottom:1px solid var(--rule-2)}
}`;

// STEP 10 — gate-framing-only CSS (the neutral "solicitation facts only" satisfied group). Appended to the
// <style> ONLY when AUDIT_GATE_FRAMING is ON, so the flag-OFF stylesheet is BYTE-IDENTICAL to the base port.
const GATE_FRAMING_CSS = `
.fg-neutral .fg-h{color:var(--slate-deep)} .fg-neutral .fmk{background:var(--slate)}
.fg-neutral .find{border-left-color:var(--slate-line)}
.fg-lead{font-size:12px;line-height:1.5;color:var(--mute);margin:0 0 10px;padding-left:27px;max-width:68ch}`;
