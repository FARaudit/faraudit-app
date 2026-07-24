/* =============================================================================
   v5 Rich Web Report — render engine ("The Gate Brief")
   Ported 1:1 from the Design v5 package (_v5-PORT-READY/src/render-v5.js, 2026-07-05).
   renderRichWebV5(data) → { html, sections:[{id,label,tone}] }

   SUMMARY-FIRST / EVIDENCE-ON-DEMAND: opens as ONE screen (command header — verdict
   word · verbatim rationale as "Bottom line" · the 4-tile executive bento · driver
   one-liners), then a "How this call was reached" reasoning chain, then the evidence
   accordion (Findings · §L · §M · CLIN · Key dates · Provenance), collapsed by default.

   Doctrine preserved 1:1: rationale VERBATIM · tri-state eligibility TOP-LINE only ·
   honest-fail = slate + NO VERDICT + NO CHARGE (v.noCharge flag) · absence rule
   (COMPLETE→one line, INCOMPLETE→omit) · no score / no numeric confidence anywhere.

   F3 consolidation (Brain relay): the executive-bento tiles come from the shared
   scorecardTiles(d) in core.ts — the SAME derivation the two PDF renderers use.
   reasoningSteps + REACHED_INTRO are exported so the PDFs consume the chain verbatim.
   Every interpolated field routes through esc() (stored-XSS safe).
   ============================================================================= */
import type { V4Data, V4Verdict, V4Findings, V4Finding, V4Date, V4Temporal, V4SubmissionL, V4EvalM, V4Clins, V4Provenance, Tone } from "@/lib/v4-report/render";
import { esc, TONE_LABEL, SEVLAB, eligInfo, eyebrowFor, plur, cap, scorecardTiles, splitCaveatRationale, type EligInfo } from "./core";

// AUDIT_V5_SEAL — "Decision Seal" masthead redesign (flag-gated; default-OFF = byte-identical).
const V5_SEAL = process.env.AUDIT_V5_SEAL === "true";

// ── Seal builder — COPY-IDENTICAL to render-pdf.ts (STAMPWORD/DISPO/KICK/SEAL_ICON/
// sealStamp/sealStatus) so web = Executive Brief = Gate Deck 1:1. render-pdf imports
// FROM this file, so we cannot import back (circular) — the maps are duplicated verbatim. ──
const STAMP: Record<string, string> = { go: "CLEARED", caution: "CONDITIONAL", stop: "BLOCKED", slate: "NO VERDICT" };
const SEAL_ICON: Record<string, string> = {
  go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/></svg>',
  caution: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5L21.5 20H2.5z"/><path d="M12 9.6v4.4"/><path d="M12 17h.01"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>',
  slate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
};
const STAMPWORD: Record<string, string> = { BID: "Bid", BID_WITH_CAUTION: "Bid · Caution", NO_BID: "No-Bid", INELIGIBLE: "Ineligible", NEEDS_HUMAN_REVIEW: "Needs Human Review", INCOMPLETE: "Incomplete", OUT_OF_SCOPE: "Out of Scope" };
const DISPO: Record<string, string> = { BID: "CLEARED", BID_WITH_CAUTION: "CONDITIONAL", NO_BID: "DECLINED", INELIGIBLE: "BARRED", NEEDS_HUMAN_REVIEW: "REFERRED", INCOMPLETE: "NOT REACHED", OUT_OF_SCOPE: "NOT APPLICABLE" };
const KICK: Record<string, string> = { BID: "Cleared on the facts read — proceed to proposal", BID_WITH_CAUTION: "Proceed, but clear the gates below first", NO_BID: "Final disposition — a universal defect blocks the field", INELIGIBLE: "Not curable here — team with a certified prime or target full-and-open", NEEDS_HUMAN_REVIEW: "Route to a human reviewer to confirm eligibility", INCOMPLETE: "Provide the missing documents to complete the read", OUT_OF_SCOPE: "No offer to make — market research only" };
// Doctrine §5 — OUT_OF_SCOPE suppresses the eligibility chip (parity with render-pdf.ts coverElig).
const coverElig = (v: V4Verdict): EligInfo => (v.pole === "OUT_OF_SCOPE" ? null : eligInfo(v));
function sealStamp(v: V4Verdict): string {
  const word = STAMPWORD[v.pole] || v.band || "";
  const dispo = DISPO[v.pole] || STAMP[v.tone] || "";
  const wcls = word.length <= 4 ? "xl" : word.length <= 12 ? "lg" : "";
  return `<div class="gseal"><div class="gseal-in">
      <div class="gseal-ico">${SEAL_ICON[v.tone] || SEAL_ICON.slate}</div>
      <div class="gseal-word ${wcls}">${esc(word)}</div>
      <div class="gseal-dispo mono">${esc(dispo)}</div>
      <div class="gseal-wm mono">FARAUDIT · GATE BRIEF</div>
    </div></div>`;
}
function sealStatus(v: V4Verdict): string {
  const e = coverElig(v);
  return `<span class="gchip-tight">${v.noVerdict ? '<b class="mono">NO VERDICT</b><i></i>' : ""}<span class="ek mono">Eligibility</span><em data-e="${e ? e.cls : "na"}">${e ? esc(e.label) : "Not applicable"}</em></span>`;
}

const I: Record<string, string> = {
  go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>',
  caution: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  slate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m6 9 6 6 6-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.8" fill="currentColor" stroke="none"/></svg>',
};

// Offers-due deadline for the command header (Brain Q1: neutral grounded fact — date ·
// local time · timezone, verbatim from the value string; never feeds/colors the verdict).
function offersDue(d: V4Data): V4Date | null {
  const list = d.dates || [];
  return list.find((x) => /(proposal|offer|quote|bid)s?\s+due|response\s+date|closing/i.test(x.label)) || null;
}

// Deadline value = "DATE" or "DATE · TIME (OFFSET)". Split on the first ' · ' so the
// wall-clock cutoff renders on its own line; date-only sources carry no time. (V5_SEAL)
function splitDeadline(value: string): { date: string; time: string } {
  const s = String(value);
  const ix = s.indexOf(" · ");
  return ix >= 0 ? { date: s.slice(0, ix), time: s.slice(ix + 3) } : { date: s, time: "" };
}

// ---- COMMAND HEADER — the first screen -----------------------------------
function commandHeader(d: V4Data): string {
  const v = d.verdict, m = d.masthead, f = d.findings;
  const elig = eligInfo(v);
  const eyebrow = eyebrowFor(v);

  const facts = m.facts || [];
  const naics = facts.find((ft) => /naics/i.test(ft.k));
  const restHTML = facts.filter((ft) => ft !== naics).map((ft) =>
    `<span class="cmd-fact"><b>${esc(ft.k)}</b><span class="cf-v${ft.mono ? " mono" : ""}">${esc(ft.v)}</span></span>`).join("");
  const naicsHTML = naics ? `
      <div class="cmd-naics">
        <span class="cmd-naics-k">${esc(naics.k)}</span>
        <div class="cmd-naics-v mono">${esc(naics.v)}</div>
        ${naics.sub ? `<div class="cmd-naics-sub">${esc(naics.sub)}</div>` : ""}
      </div>` : "";
  const meta = `<div class="cmd-facts">${restHTML}</div>${naicsHTML}`;

  const eligChip = elig
    ? `<span class="cmd-elig ${elig.cls}"><span class="ce-k">Eligibility</span><span class="ce-v">${elig.label}</span></span>` : "";
  const noCharge = v.noCharge ? `<span class="cmd-nocharge">No charge</span>` : "";

  const od = offersDue(d);
  const dl = od && V5_SEAL ? splitDeadline(od.value) : null;
  // Vehicle F3 · masthead deadline reconcile (flag AUDIT_MASTHEAD_DEADLINE_RECONCILE, default-OFF) — the build layer
  // (offerDueFact) sets the offer-due VALUE to the executed SF-30 amended date + a provenance/pending sub (od.sub), but
  // the v5 command-header clock rendered ONLY the value and DROPPED od.sub — so the amendment provenance + reset caveat
  // never reached the served surface (card #735/#736, FA813726R0033: masthead showed the orphan SAM "18 Jul 2026" with no
  // caveat while SF-30 Mod 0001 amended it to 31 Jul; UPDATE 03 signals a further revision). Flag-ON: render od.sub under
  // the clock. Flag-OFF: byte-identical (no caveat node). Data-present-only (never fabricated).
  const deadlineCaveat = (process.env.AUDIT_MASTHEAD_DEADLINE_RECONCILE === "true" && od && od.sub)
    ? `<div class="cmd-clock-caveat">${esc(od.sub)}</div>` : "";
  const clockHTML = !od ? "" : V5_SEAL ? `
      <div class="cmd-clock" title="Solicitation closing — grounded fact read from source; not a schedulability judgment">
        <span class="cmd-clock-ic">${I.clock}</span>
        <span class="cmd-clock-body">
          <span class="cmd-clock-k">${esc(od.label)}</span>
          <span class="cmd-clock-v mono">${esc(dl!.date)}</span>
          ${dl!.time ? `<span class="cmd-clock-time mono">${esc(dl!.time)}</span>` : ""}
        </span>
      </div>${deadlineCaveat}` : `
      <div class="cmd-clock" title="Solicitation closing — grounded fact, not a schedulability judgment">
        <span class="cmd-clock-ic">${I.clock}</span>
        <span class="cmd-clock-k">${esc(od.label)}</span>
        <span class="cmd-clock-v mono">${esc(od.value)}</span>
      </div>${deadlineCaveat}`;

  let drivers = ([] as V4Finding[]).concat(f.p0 || [], f.p1 || []).filter((x) => x.driver === true);
  if (!drivers.length) drivers = ((f.p0 && f.p0.length ? f.p0 : (f.p1 || [])) as V4Finding[]).slice(0, 2);
  drivers = drivers.slice(0, 3);
  const driverHTML = drivers.length ? `
      <div class="cmd-drivers">
        <div class="cmd-drv-h">Why — what drives this call</div>
        ${drivers.map((x) => `<a class="cmd-drv" href="#findings"><span class="cmd-drv-cite mono">${esc(x.cite)}</span><span class="cmd-drv-req">${esc(x.req)}</span></a>`).join("")}
      </div>` : "";

  // F3 — the executive bento comes from the SHARED derivation (core.scorecardTiles).
  const tilesHTML = scorecardTiles(d).map((t) =>
    `<div class="cmd-tile${t.textv ? " is-textv" : ""}" data-tone="${t.tone}"><div class="ct-v">${esc(t.v)}</div><div class="ct-k">${esc(t.k)}</div><div class="ct-sub">${esc(t.sub)}</div></div>`).join("");

  // Bottom line — lede + ranked top-5 self-clearable caveats, remainder grouped (card #612-(3c)).
  // Replaces the ~50-item semicolon wall the rationale dumped inline (redundant with Findings).
  // A non-package rationale returns caveats=[] → the lede IS the whole sentence (byte-identical).
  const CAVEAT_TOP_N = 5;
  const { lede: blLede, caveats: blCaveats } = splitCaveatRationale(v.rationale);
  const blTop = blCaveats.slice(0, CAVEAT_TOP_N);
  const blRest = blCaveats.length - blTop.length;
  const bottomLineBody =
    `<p class="cmd-bl-t">${esc(blLede)}</p>` +
    (blTop.length
      ? `<ul class="cmd-bl-caveats">${blTop.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` +
        (blRest > 0 ? `<p class="cmd-bl-more">+${blRest} more self-clearable item${blRest === 1 ? "" : "s"} — <a href="#findings">see Findings below</a></p>` : "")
      : "");

  if (V5_SEAL) {
    // Record band — Agency (two-tier) · Offers due (two-tier) · Set-aside · NAICS.
    const agencyFact = facts.find((ft) => /agency/i.test(ft.k));
    const setFact = facts.find((ft) => /set.?aside/i.test(ft.k));
    const naicsFact = facts.find((ft) => /naics/i.test(ft.k));
    const AGENCY_SHORT: [RegExp, string][] = [
      [/air force/i, "U.S. Air Force"], [/\barmy\b/i, "U.S. Army"], [/\bnavy\b/i, "U.S. Navy"],
      [/marine/i, "U.S. Marine Corps"], [/space force/i, "U.S. Space Force"], [/coast guard/i, "U.S. Coast Guard"],
      [/veterans|\bVA\b/i, "Dept. of Veterans Affairs"], [/general services|\bGSA\b/i, "U.S. General Services Administration"],
      [/homeland|\bDHS\b/i, "Dept. of Homeland Security"], [/health.*human|\bHHS\b/i, "Dept. of Health & Human Services"],
      [/\benergy\b|\bDOE\b/i, "Dept. of Energy"],
    ];
    const agFull = agencyFact ? agencyFact.v : "—";
    let agMain = agFull, agSub = agencyFact && agencyFact.sub ? agencyFact.sub : "";
    if (!agSub && agMain.indexOf(" · ") > -1) { const parts = agMain.split(" · "); agSub = parts.slice(1).join(" · "); agMain = parts[0]; }
    const agShort = AGENCY_SHORT.find(([re]) => re.test(agFull));
    if (agShort) agMain = agShort[1];
    const bandHTML = `
      <div class="cmd-band">
        <div class="cb-cell"><div class="cb-k mono">Agency</div><div class="cb-v">${esc(agMain)}${agSub ? `<span class="cb-sec">${esc(agSub)}</span>` : ""}</div></div>
        <div class="cb-cell"><div class="cb-k mono">Offers due</div><div class="cb-v mono">${od ? esc(dl!.date) : "—"}${od && dl!.time ? `<span class="cb-sec mono">${esc(dl!.time)}</span>` : ""}</div></div>
        <div class="cb-cell"><div class="cb-k mono">Set-aside</div><div class="cb-v">${setFact ? esc(setFact.v) : "—"}</div></div>
        <div class="cb-cell"><div class="cb-k mono">NAICS</div><div class="cb-v mono">${naicsFact ? esc(naicsFact.v) : "—"}</div></div>
      </div>`;
    return `
    <header class="cmd" id="top" data-sec data-sec-anchor="top" data-tone="${v.tone}"${v.noVerdict ? ' data-noverdict="1"' : ""}>
      <div class="cmd-eyebrow"><span class="cmd-badge">${esc(m.docType)}</span><span class="cmd-sol mono">${esc(m.solicitation)}</span></div>
      <h1 class="cmd-title">${esc(m.title)}</h1>
      ${bandHTML}
      <div class="cmd-stage">
        <div class="cmd-rail">
          ${sealStamp(v)}
          <div class="cmd-rail-status">${sealStatus(v)}${noCharge}</div>
        </div>
        <div class="gv2-cmd">
          <div class="gv2-kick mono">${esc(KICK[v.pole] || eyebrow)}</div>
          <div class="gv2-word">${esc(v.band)}</div>
          <div class="cmd-bl">
            <span class="cmd-bl-k">Bottom line</span>
            ${bottomLineBody}
          </div>
        </div>
      </div>
      ${driverHTML}
      <div class="cmd-tiles">${tilesHTML}</div>
    </header>`;
  }

  return `
    <header class="cmd" id="top" data-sec data-sec-anchor="top" data-tone="${v.tone}"${v.noVerdict ? ' data-noverdict="1"' : ""}>
      <div class="cmd-eyebrow"><span class="cmd-badge">${esc(m.docType)}</span><span class="cmd-sol mono">${esc(m.solicitation)}</span></div>
      <h1 class="cmd-title">${esc(m.title)}</h1>
      <div class="cmd-meta">${meta}</div>
      <div class="cmd-verdict">
        <div class="cmd-declead">
          <div class="cmd-eyebrow-t">${esc(eyebrow)}</div>
          ${clockHTML}
        </div>
        <div class="cmd-vrow">
          <span class="cmd-ico">${I[v.tone] || I.slate}</span>
          <span class="cmd-word">${esc(v.band)}</span>
        </div>
        <div class="cmd-vchips">
          <span class="cmd-stamp mono">${TONE_LABEL[v.tone] || ""}</span>
          ${eligChip}${noCharge}
        </div>
      </div>
      <div class="cmd-decision">
        <div class="cmd-detail">
          <div class="cmd-bl">
            <span class="cmd-bl-k">Bottom line</span>
            ${bottomLineBody}
          </div>
          ${driverHTML}
        </div>
        <div class="cmd-tiles">${tilesHTML}</div>
      </div>
    </header>`;
}

// ---- "How this call was reached" — the reasoning chain (SHARED source) ----
export const REACHED_INTRO =
  "These are the steps the engine walked, in order — not a scorecard. " +
  "Each is a check with a plain outcome, and the verdict is the point the sequence " +
  "arrives at, not a tally of points. No step is weighted; none is scored.";

export interface ReasoningStep {
  tone?: Tone; label: string; outcome: string; detail: string; stamp?: string;
  skip?: boolean; verdict?: boolean; cites?: string[]; findings?: V4Finding[];
}

// Vehicle F · D2 — true-cause NHR narrative (flag AUDIT_NHR_NARRATIVE_TRUE_CAUSE). Each enumerated cause renders its
// OWN true sequence; conflict language lives ONLY under `conflict`. Returns null for an absent/unrecognized cause so
// the caller emits the FAIL-LOUD neutral string + a defect signal — never a fabricated cause.
function nhrCauseNarrative(cause?: string): { label: string; outcome: string; detail: string } | null {
  switch (cause) {
    case "conflict": return { label: "Findings reconciled", outcome: "Cannot be reconciled", detail: "Two grounded findings conflict and the engine will not adjudicate between them. A human must resolve the conflict first, so the sequence stops and no verdict is issued." };
    case "eligibility": return { label: "Eligibility gate", outcome: "Human confirmation required", detail: "A bidder-eligibility gate stated in the solicitation governs award, and the engine cannot confirm your firm's status from the posted record — so the sequence stops for human confirmation rather than guess. The gate(s) are named below." };
    case "coverage": return { label: "Coverage reconciled", outcome: "Not fully grounded", detail: "Referenced binding material could not be fully read or grounded, so a verdict cannot be certified over the partial record. The gap is named below; no verdict is issued." };
    case "primary_indeterminate": return { label: "Base solicitation", outcome: "Not identified", detail: "No uploaded document carries a solicitation form or contract structure, so the engine cannot confirm which document is the solicitation. Human review is required before any verdict." };
    case "verification": return { label: "Verification", outcome: "Not sound", detail: "The findings did not pass adversarial verification, or no decision-bearing finding survived, so the engine will not rest a verdict on an untrustworthy set. Human review is required." };
    default: return null;
  }
}

export function reasoningSteps(d: V4Data): ReasoningStep[] {
  const v = d.verdict, cov = d.coverage, f = d.findings;
  const complete = cov.state === "COMPLETE";
  const p0 = f.p0 || [], p1 = f.p1 || [];
  const elig = eligInfo(v);
  let drivers = ([] as V4Finding[]).concat(p0, p1).filter((x) => x.driver === true);
  if (!drivers.length) drivers = (p0.length ? p0 : p1).slice(0, 2);

  const steps: ReasoningStep[] = [];
  const skip = (label: string, detail: string): ReasoningStep => ({ skip: true, label, outcome: "Not reached", detail });
  const verdictStep = (): ReasoningStep => ({
    verdict: true, tone: v.tone, label: "Verdict", outcome: v.band, stamp: TONE_LABEL[v.tone],
    detail: verdictDetail(v, f, elig, !(v.pole === "NO_BID" || v.pole === "INELIGIBLE")),
  });
  const coreOk = (cov.core || []).filter((c) => c.ok).map((c) => c.k);

  // 01 — COVERAGE. The "partial read → sequence stops, no verdict issued" copy is
  // TERMINAL and belongs ONLY to the genuine INCOMPLETE pole. A committal verdict
  // reached over a flagged section (a sound verifier still produced BID / BID-WITH-
  // CAUTION while §L was flagged for confirmation — LBJ 653570ea) must narrate the
  // FULL chain: the coverage step is honest-but-non-terminal and the sequence
  // continues to blocking → drivers → eligibility → verdict. Keying the terminal
  // branch on cov.state alone told the reader "no verdict is issued" and then
  // printed the BID-WITH-CAUTION verdict two steps later (card #612-(3a)).
  const coverageWithheld = !complete && v.pole === "INCOMPLETE"; // genuine INCOMPLETE — terminal at coverage
  const miss = cov.missing || [];
  let coverageDetail: string;
  if (complete) {
    coverageDetail = `${cov.read} of ${cov.total} documents read in full${coreOk.length ? `; core sections present (${coreOk.join(" · ")})` : ""}. ${cov.read < cov.total ? "The unread documents contain no required section, so the read is sufficient for the decision to rest on it." : "No documents were left unread — the decision rests on the complete record."}`;
  } else if (coverageWithheld) {
    // Vehicle A–E · item C (flag AUDIT_COVERAGE_COUNTER_SPLIT, default-OFF) — state the TRUE read-vs-grounded shape.
    // The legacy copy asserted "partial read cannot certify what it did not see" even when read===total (FA813726
    // e63bd1e7: "9 of 9 documents could be read. A partial read cannot certify…" — internally contradictory: 9/9 is
    // NOT a partial read). When everything posted was read, the sequence stops on GROUNDING/certification, not on an
    // unread doc — say so. Flag-OFF ⇒ the exact legacy string ⇒ byte-identical.
    const allRead = cov.read != null && cov.total != null && cov.read >= cov.total;
    coverageDetail = (process.env.AUDIT_COVERAGE_COUNTER_SPLIT === "true" && allRead)
      ? `All ${cov.total} documents were read; the sequence stops because not all binding content could be grounded/confirmed — no verdict is issued on an unconfirmed read.`
      : `${cov.read} of ${cov.total} documents could be read. A partial read cannot certify what it did not see — the sequence stops here and no verdict is issued.`;
  } else if (v.noVerdict) {
    // NHR / OOS — coverage is stamped incomplete only because a no-verdict pole never
    // shows COMPLETE; the read is NOT what halts the sequence, the next step is.
    coverageDetail = `${cov.read} of ${cov.total} documents read. The read is not what halts the sequence here — see the next step.`;
  } else {
    // committal verdict reached despite a coverage flag. Two INDEPENDENT dimensions can
    // each stamp INCOMPLETE — unread documents (read < total) and/or a section left
    // unconfirmed (cov.missing) — so narrate whichever actually applies rather than
    // asserting "flagged sections" that may not exist (matches coverageSub's tile copy).
    const partialRead = cov.read != null && cov.total != null && cov.read < cov.total;
    const clauses: string[] = [`${cov.read} of ${cov.total} documents read`];
    if (partialRead) clauses.push(`the ${cov.total - cov.read} unread contain no required section relied on for this call`);
    if (miss.length) clauses.push(`${miss.length === 1 ? "section" : "sections"} ${miss.join(" · ")} could not be fully confirmed from the posted set and ${miss.length === 1 ? "is" : "are"} flagged for your confirmation`);
    const caveatTail = (partialRead || miss.length)
      ? ` The decision below still rests on the record that was read — ${miss.length ? (miss.length === 1 ? "that flagged section is a caveat" : "the flagged sections are caveats") : "the unread set is a caveat"}, not a stop.`
      : " The decision below rests on the record that was read.";
    coverageDetail = clauses.join("; ") + "." + caveatTail;
  }
  steps.push({
    tone: complete ? "go" : "slate", label: "Coverage read",
    outcome: complete ? "Sufficient" : "Incomplete",
    detail: coverageDetail,
  });
  if (coverageWithheld) {
    steps.push(skip("Remaining checks", "Blocking conditions, findings and eligibility need a complete read; they were not run."));
    steps.push(verdictStep());
    return steps;
  }

  // 02 — complete + no-verdict poles (NHR reconcile / OUT_OF_SCOPE scope) — terminal here
  if (v.noVerdict) {
    const oos = v.pole === "OUT_OF_SCOPE";
    // Vehicle F · D2 (flag AUDIT_NHR_NARRATIVE_TRUE_CAUSE, default-OFF) — derive the walkthrough from the engine's
    // ENUMERATED cause instead of asserting "findings conflict" on every NHR (21/22 were fabricated). conflict language
    // renders IFF cause==="conflict"; an absent/unknown cause renders a NEUTRAL TRUE string + a defect signal (fail-loud).
    // Flag-OFF (or OOS) ⇒ the exact legacy strings ⇒ byte-identical.
    const trueCause = process.env.AUDIT_NHR_NARRATIVE_TRUE_CAUSE === "true" && !oos;
    if (!trueCause) {
      steps.push({
        tone: "slate", label: oos ? "Scope checked" : "Findings reconciled",
        outcome: oos ? "Outside scope" : "Cannot be reconciled",
        detail: oos
          ? "The notice solicits no offer and confers no basis for award, so a bid decision does not apply. The sequence stops and no verdict is issued."
          : "Two grounded findings conflict and the engine will not adjudicate between them. A human must resolve the conflict first, so the sequence stops and no verdict is issued.",
        cites: oos ? [] : drivers.slice(0, 2).map((x) => x.cite),
      });
      steps.push(skip("Eligibility & verdict", "These need the checks above to resolve; they were not run."));
      steps.push(verdictStep());
      return steps;
    }
    const narr = nhrCauseNarrative(v.noVerdictCause);
    if (!narr) { try { console.error(`[D2 fail-loud] NHR rendered with unrecognized/absent noVerdictCause=${String(v.noVerdictCause)} — neutral string emitted, not a fabricated cause`); } catch { /* logging must never affect render */ } }
    const cause = narr ?? { label: "Sequence halted", outcome: "No verdict recorded", detail: "The sequence stopped before a verdict; the cause was not recorded in this report. Treat this audit as needing human review — this is a reporting gap, not a decision about the solicitation." };
    steps.push({ tone: "slate", label: cause.label, outcome: cause.outcome, detail: cause.detail, cites: drivers.slice(0, 2).map((x) => x.cite) });
    // D3 — on an ELIGIBILITY-cause NHR the gate(s) ARE determined: surface the tier-1/tier-2 conditional instead of a bare skip.
    if (v.noVerdictCause === "eligibility" && drivers.length) {
      steps.push({
        tone: "caution", label: "Eligibility", outcome: "Confirm your firm's status",
        detail: "Tier 1 — if your firm does not clear the gate(s) named above, it is INELIGIBLE and this is a no-bid; the read is otherwise complete for that determination. Tier 2 — if your firm clears them, the record supports proceeding, subject to any pricing/coverage caveats noted. Confirm status before committing bid cost.",
        findings: drivers,
      });
    } else {
      steps.push(skip("Eligibility & verdict", "The cause above halts the sequence before an eligibility or verdict determination."));
    }
    steps.push(verdictStep());
    return steps;
  }

  // 02 — BLOCKING CONDITIONS (binary kill-switches)
  const universal = v.pole === "NO_BID", disq = v.pole === "INELIGIBLE";
  const blockFound = universal || disq;
  steps.push({
    tone: blockFound ? "stop" : "go", label: "Blocking conditions checked",
    outcome: blockFound ? (universal ? "Universal defect found" : "Disqualification found") : "None found",
    detail: blockFound
      ? (universal
        ? "A contradiction in the mandatory terms cannot be satisfied by any offeror — it blocks the solicitation for the whole field, so the sequence routes to No-bid."
        : "A verified eligibility bar disqualifies this offeror from award. It is a condition of award, not proposal quality, so the sequence routes to Ineligible.")
      : "Two pass/fail conditions can stop a bid outright — a universal defect that no offeror could satisfy, and a verified disqualification of this offeror. Neither is present.",
    cites: blockFound && drivers[0] ? [drivers[0].cite] : [],
  });

  // 03 — DRIVER FINDINGS (only on the eligible path; folded into 02 when a block was found)
  if (!blockFound) {
    steps.push(drivers.length
      ? {
        tone: "caution", label: "What drives this call", outcome: plur(drivers.length, "driving finding", "driving findings"),
        detail: "These are the conditions that shaped the call. Each links to its citation and the verbatim text it rests on.",
        findings: drivers,
      }
      : {
        tone: "go", label: "Findings that shape the call", outcome: "No gates to clear",
        detail: "Nothing in the read requires action before you bid — only routine clause flow-downs remain, listed under Findings.",
      });
  }

  // 04 — ELIGIBILITY
  if (elig) {
    steps.push({
      tone: elig.cls === "ok" ? "go" : elig.cls === "no" ? "stop" : "caution",
      label: "Eligibility", outcome: elig.label,
      detail: elig.cls === "ok"
        ? "The offeror is eligible on the facts read."
        : elig.cls === "no"
          ? "A verified bar makes the offeror ineligible for award under this solicitation."
          : "One or more eligibility facts could not be read from the posted documents. Confirm them before committing bid cost — this is a condition of award, not a matter of proposal quality.",
    });
  }

  // 05 — VERDICT
  steps.push(verdictStep());
  return steps;
}

// The verdict-adjacent closer: state-of-play list + the band VERBATIM. Never a tally.
function verdictDetail(v: V4Verdict, f: V4Findings, elig: EligInfo, eligiblePath: boolean): string {
  if (v.noVerdict)
    return "The sequence stopped before a decision could be reached — no verdict is issued"
      + (v.noCharge ? ", and the audit was not charged." : ".");
  if (v.pole === "NO_BID")
    return "The universal defect above cannot be satisfied by any offeror, so it is dispositive for the entire field. The sequence lands on " + v.band + ".";
  if (v.pole === "INELIGIBLE")
    return "The verified eligibility bar is a condition of award, not proposal quality. The sequence lands on " + v.band + ".";
  const gates = (f.p1 || []).length;
  const timeGate = ([] as V4Finding[]).concat(f.p0 || [], f.p1 || []).some((x) => !!x.temporal);
  const s1: string[] = [];
  if (eligiblePath) s1.push("no blocking defect and no verified disqualification");
  s1.push(timeGate ? "a time-bound gate falls inside the response window" : "no time-bound gate");
  const rem: string[] = [];
  if (gates) rem.push(plur(gates, "gate", "gates") + (gates === 1 ? " remains" : " remain") + " to clear");
  if (elig && elig.cls === "nd") rem.push("one eligibility point is not yet confirmed");
  let s2 = rem.length ? cap(rem.join("; ")) + "." : "";
  if (elig && elig.cls === "ok" && !gates && !timeGate) s2 = "Nothing remains to clear.";
  return [cap(s1.join(", ")) + ".", s2, "The sequence lands on " + v.band + "."].filter(Boolean).join(" ");
}

function reachedSection(d: V4Data): string {
  const steps = reasoningSteps(d);
  const rows = steps.map((s, i) => {
    const num = s.skip ? "·" : String(i + 1).padStart(2, "0");
    const cites = (s.cites && s.cites.length)
      ? `<span class="rc-cites">${s.cites.map((c) => `<a class="rc-cite mono" href="#findings">${esc(c)}</a>`).join("")}</span>` : "";
    const finds = (s.findings && s.findings.length)
      ? `<div class="rc-finds">${s.findings.map((x) =>
          `<a class="rc-find" href="#findings"><span class="rc-find-cite mono">${esc(x.cite)}</span><span class="rc-find-req">${esc(x.req)}</span></a>`).join("")}</div>` : "";
    return `<div class="rc-step${s.verdict ? " rc-verdict" : ""}${s.skip ? " rc-skip" : ""}" data-tone="${s.tone || "slate"}">
        <div class="rc-rail"><span class="rc-node mono">${num}</span></div>
        <div class="rc-body">
          <div class="rc-head">
            <span class="rc-label">${esc(s.label)}</span>
            <span class="rc-out"${s.stamp ? ' data-stamp="1"' : ""}>${esc(s.outcome)}${s.stamp ? `<span class="rc-stamp mono">${esc(s.stamp)}</span>` : ""}</span>
          </div>
          <p class="rc-detail">${esc(s.detail)}</p>
          ${finds}${cites}
        </div>
      </div>`;
  }).join("");
  return `
    <section class="rc" id="reached" data-sec data-tone="${d.verdict.tone}">
      <div class="rc-top">
        <h2 class="rc-h">How this call was reached</h2>
        <p class="rc-intro">${REACHED_INTRO}</p>
      </div>
      <div class="rc-steps">${rows}</div>
    </section>`;
}

// ---- disclosure shell (evidence-on-demand) -------------------------------
function disc(o: { id: string; n: string; title: string; summary?: string; body: string; open?: boolean; tone?: string | null }): string {
  return `
    <section class="disc" id="${o.id}" data-sec data-open="${o.open ? "1" : "0"}"${o.tone ? ` data-tone="${o.tone}"` : ""}>
      <button class="disc-top" type="button" aria-expanded="${o.open ? "true" : "false"}" aria-controls="${o.id}-body">
        <span class="disc-n mono">${o.n}</span>
        <span class="disc-title">${o.title}</span>
        <span class="disc-sum">${o.summary || ""}</span>
        <span class="disc-chev" aria-hidden="true">${I.chev}</span>
      </button>
      <div class="disc-body" id="${o.id}-body">${o.body}</div>
    </section>`;
}
function flatRow(id: string, n: string, title: string, summary: string): string {
  return `
    <section class="disc flat" id="${id}" data-sec>
      <div class="disc-top disc-top--flat">
        <span class="disc-n mono">${n}</span>
        <span class="disc-title">${title}</span>
        <span class="disc-sum muted">${esc(summary)}</span>
      </div>
    </section>`;
}
const statusDot = (tone: string): string => `<span class="ds-dot" data-tone="${tone}"></span>`;

// ---- findings -------------------------------------------------------------
function temporal(t: V4Temporal | undefined): string {
  if (!t) return "";
  const exceeds = t.gateExceedsWindow;
  return `<div class="fd-temporal ${exceeds ? "bad" : ""}">
      <span class="fd-t-k">Timing</span>
      <span class="fd-t-m mono">gate <b>${t.gateDays}d</b></span>
      <span class="fd-t-m mono">window <b>${t.windowDays}d</b></span>
      <span class="fd-t-status">${exceeds ? "gate exceeds the window" : "gate falls within the window"}</span></div>`;
}
function findingRow(f: V4Finding, sev: string, open: boolean, nv = false): string {
  // No-verdict pole (NHR / OOS): show-stopper-severity findings render in the
  // calm "blocking condition · needs review" register — graphite chip + warm-
  // amber rail, never the committal-stop red klaxon — and drop the "Decisive
  // finding" label (nothing was decided). Surfaced + cited unchanged. Committal
  // poles are untouched (nv=false). (Design v5 hard-gate remap; doctrine #355/#423/#425.)
  const nvBlock = nv && sev === "p0";
  const dsev = nvBlock ? "review" : sev;
  const sevLabel = nvBlock ? "Blocking condition · needs review" : (SEVLAB[sev as keyof typeof SEVLAB] || "");
  return `
    <article class="fd" data-sev="${dsev}"${open ? ' data-open="1"' : ""}>
      <button class="fd-top" type="button" aria-expanded="${open ? "true" : "false"}">
        <span class="fd-sev" data-sev="${dsev}">${sevLabel}</span>
        <div class="fd-mid">
          ${f.driver && !nv ? `<span class="fd-drives">${I.spark || ""}Decisive finding</span>` : ""}
          <span class="fd-req">${esc(f.req)}</span>
        </div>
        <span class="fd-cite mono">${esc(f.cite)}</span>
        <span class="fd-chev" aria-hidden="true">${I.chev}</span>
      </button>
      <div class="fd-body">
        ${f.excerpt ? `<blockquote class="fd-ex">${esc(f.excerpt)}<cite>Found in — ${esc(f.cite)}</cite></blockquote>` : ""}
        ${temporal(f.temporal)}
        ${f.curability ? `<div class="fd-cure"><span class="fd-cure-k">Clears when</span><span>${esc(f.curability)}</span></div>` : ""}
      </div>
    </article>`;
}
function group(list: V4Finding[] | undefined, sev: string, title: string, complete: boolean, nv = false): string {
  const nvBlock = nv && sev === "p0";
  const gsev = nvBlock ? "review" : sev;
  const gtitle = nvBlock ? "Blocking conditions · needs review" : title;
  if (!list || !list.length) {
    if (!complete) return "";
    return `<div class="fg"><div class="fg-h" data-sev="${gsev}">${gtitle}<span class="fg-c mono">0</span></div>
        <div class="fg-items"><p class="fg-none">None identified in the documents read.</p></div></div>`;
  }
  const ordered = [...list].sort((a, b) => (b.driver === true ? 1 : 0) - (a.driver === true ? 1 : 0));
  const rows = ordered.map((f) => findingRow(f, sev, sev === "p0" || f.driver === true, nv)).join("");
  return `<div class="fg"><div class="fg-h" data-sev="${gsev}">${gtitle}<span class="fg-c mono">${list.length}</span></div><div class="fg-items">${rows}</div></div>`;
}
function findingsBody(fd: V4Findings, complete: boolean, nv = false): string {
  const groups = [
    group(fd.p0, "p0", "Show-stoppers", complete, nv),
    group(fd.p1, "p1", "Gates to clear", complete, nv),
    group(fd.p2, "p2", "Advisories", complete, nv),
  ].filter(Boolean).join("");
  const sat = (fd.satisfied && fd.satisfied.length)
    ? `<div class="fg fg-sat"><div class="fg-h" data-sev="ok">Satisfied · grounded facts<span class="fg-c mono">${fd.satisfied.length}</span></div>
         <div class="fg-items"><div class="sat-list">${fd.satisfied.map((f) => `<div class="sat"><span class="sat-dot"></span><span class="sat-req">${esc(f.req)}</span><span class="sat-cite mono">${esc(f.cite)}</span></div>`).join("")}</div></div></div>`
    : "";
  if (!complete && !groups && !sat) return "";
  return `<p class="disc-note">Every finding carries its citation and the verbatim text it rests on.</p>${groups}${sat}`;
}
function findingsSummary(fd: V4Findings, nv = false): string {
  const p0 = (fd.p0 || []).length, p1 = (fd.p1 || []).length, p2 = (fd.p2 || []).length;
  // No-verdict pole never renders the red "stop" summary — p0 surfaces as a calm
  // amber "blocking conditions · needs review", coherent with the "Not determined"
  // scorecard aggregate. (Design v5 hard-gate remap.)
  const tone = nv ? (p0 || p1 ? "caution" : "slate") : (p0 ? "stop" : (p1 ? "caution" : "go"));
  if (!p0 && !p1 && !p2) return statusDot(nv ? "slate" : "go") + "No findings in the documents read";
  const seg: string[] = [];
  if (p0) seg.push(nv ? `<b>${plur(p0, "blocking condition", "blocking conditions")}</b> · needs review` : `<b>${plur(p0, "show-stopper", "show-stoppers")}</b>`);
  seg.push(plur(p1, "gate", "gates") + " to clear");
  if (p2) seg.push(plur(p2, "advisory", "advisories"));
  return statusDot(tone) + seg.join(" · ");
}

// ---- section bodies (inner html only) ------------------------------------
type SubmissionLGrounded = V4SubmissionL & { provision?: string };
function submissionLBody(s: SubmissionLGrounded): string {
  const rows = s.rows.map((r) => {
    const p = splitMethod(r.req);
    return `<div class="lx-row">
        <span class="lx-vol mono">${esc(r.vol)}</span>
        <div class="lx-b">
          <div class="lx-req"><b>${esc(p.head)}</b>${p.tail ? ` — ${esc(p.tail)}` : ""}</div>
          ${r.condition ? `<div class="lx-cond">${esc(r.condition)}</div>` : ""}
        </div>
        <span class="lx-cite mono">${esc(r.cite)}</span>
      </div>`;
  }).join("");
  return `${s.lead ? `<p class="sec-lead">${esc(s.lead)}</p>` : ""}
      ${s.provision ? `<p class="lx-gov"><span class="lx-gov-k">Governed by</span> <span class="lx-gov-v mono">${esc(s.provision)}</span></p>` : ""}
      <div class="lx-list">${rows}</div>`;
}
export function splitMethod(basis: string): { head: string; tail: string } {
  const m = String(basis || "").split(/\s+—\s+/);
  return { head: m[0] || "", tail: m.slice(1).join(" — ") };
}
function evalMSummary(e: V4EvalM): string {
  const head = splitMethod(e.basis).head;
  return `<b>${esc(head)}</b><span class="sum-sep">·</span>${plur(e.factors.length, "factor", "factors")}`;
}
function evalMBody(e: V4EvalM): string {
  const sp = splitMethod(e.basis);
  const ladder = e.factors.map((f, i) => {
    const mm = String(f.name).match(/^Factor\s+(\d+)\s*[—-]\s*(.+)$/);
    const rank = mm ? mm[1] : String(i + 1);
    const title = mm ? mm[2] : f.name;
    return `<div class="mx-f${i === 0 ? " lead" : ""}">
        <span class="mx-rank mono">${esc(rank)}</span>
        <div class="mx-f-b">
          <div class="mx-f-name">${esc(title)}${i === 0 ? '<span class="mx-most">Most important</span>' : ""}</div>
          <div class="mx-f-basis">${esc(f.basis)}</div>
        </div>
        <span class="mx-cite mono">${esc(f.cite)}</span>
      </div>`;
  }).join("");
  return `
      <div class="mx-award">
        <span class="mx-award-k">Basis of award</span>
        <div class="mx-award-method">${esc(sp.head)}</div>
        ${sp.tail ? `<p class="mx-award-tail"><span class="mx-award-dash">—</span>${esc(sp.tail)}</p>` : ""}
      </div>
      <div class="mx-h">Evaluation factors — in the Government’s stated order of importance</div>
      <div class="mx-ladder">${ladder}</div>
      <p class="sec-foot">No weights, no total, no score — the Government did not publish one, and neither do we.</p>`;
}
function clinsBody(c: V4Clins): string {
  const rows = c.rows.map((r) => `<tr><td class="cx-clin mono">${esc(r.clin)}</td><td class="cx-title">${esc(r.title)}</td>
      <td><span class="cx-type mono">${esc(r.type)}</span></td><td class="cx-qty mono">${esc(r.qtyUnit)}</td><td class="cx-period">${esc(r.period)}</td></tr>`).join("");
  return `${c.lead ? `<p class="sec-lead">${esc(c.lead)}</p>` : ""}
      <table class="grid grid-clin"><thead><tr><th>CLIN</th><th>Title</th><th>Type</th><th>Qty / unit</th><th>Period</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function datesBody(list: V4Date[]): string {
  const items = list.map((d) => {
    const parts = String(d.value).split(" · ");
    const main = esc(parts[0]);
    const sub = parts.length > 1 ? `<span class="kd-t mono">${esc(parts.slice(1).join(" · "))}</span>` : "";
    return `<div class="kd ${d.kind === "gate" ? "gate" : ""}">
      <div class="kd-tick"></div><div class="kd-l">${esc(d.label)}</div><div class="kd-v mono">${main}${sub}</div></div>`;
  }).join("");
  return `<div class="kd-track" style="--kd-n:${list.length}">${items}</div>`;
}
function provenanceBody(p: V4Provenance, cov: { state?: string; solicitation?: string }): string {
  const man = p.manifest.map((m) =>
    `<li class="pv-f"><span class="pv-r pv-${m.read}">${m.read === "full" ? "Read in full" : m.read === "indexed" ? "Indexed" : "Not read"}</span><span class="pv-n mono">${esc(m.name)}</span></li>`).join("");
  const ad = String(p.auditDate || "");
  const dotIx = ad.indexOf(" · ");
  const adMain = dotIx >= 0 ? ad.slice(0, dotIx) : ad;
  const adSub = dotIx >= 0 ? ad.slice(dotIx + 3) : "";
  const auditVal = adSub
    ? `<span class="pv-v mono">${esc(adMain)}</span><span class="pv-sub mono">${esc(adSub)}</span>`
    : `<span class="pv-v mono">${esc(adMain)}</span>`;
  return `<p class="disc-note">The defensibility layer — what was read, and when. Carry it to the gate review.</p>
      <div class="pv-grid">
        <div class="pv-meta">
          <div class="pv-m"><span class="pv-k">Solicitation</span><span class="pv-v mono">${esc(cov.solicitation || "")}</span></div>
          <div class="pv-m"><span class="pv-k">Audited</span>${auditVal}</div>
          <div class="pv-m"><span class="pv-k">Coverage</span><span class="pv-v">${esc(cov.state)}</span></div>
        </div>
        <ul class="pv-man">${man}</ul>
      </div>`;
}

// ---- assemble -------------------------------------------------------------
export interface V5RenderResult { html: string; sections: { id: string; label: string; tone?: Tone }[]; }
export function renderRichWebV5(d: V4Data): V5RenderResult {
  const complete = d.coverage.state === "COMPLETE";
  const parts: string[] = [], sections: { id: string; label: string; tone?: Tone }[] = [];
  let seq = 0; const nn = () => String(++seq).padStart(2, "0");

  // Tier 1 — the decision (always open)
  parts.push(commandHeader(d));
  sections.push({ id: "top", label: "Decision", tone: d.verdict.tone });

  // Tier 1.5 — how this call was reached (always-visible reasoning chain; export-safe)
  parts.push(reachedSection(d));
  sections.push({ id: "reached", label: "How this call was reached" });

  // Evidence lead
  parts.push(`
    <div class="ev-lead" id="evidence">
      <div class="ev-text">
        <h2 class="ev-h">The evidence</h2>
        <p class="ev-p">The engine read the solicitation and made the call above. Expand any layer for the citation, the verbatim text, and what was read — everything needed to defend it at the gate review.</p>
      </div>
      <button class="ev-toggle" type="button">Expand all</button>
    </div>`);

  // Tier 2 — evidence accordion (collapsed by default; findings auto-opens on show-stoppers)
  const nvPole = d.verdict.noVerdict === true;
  const p0 = (d.findings.p0 || []).length;
  const fBody = findingsBody(d.findings, complete, nvPole);
  if (fBody) {
    parts.push(disc({ id: "findings", n: nn(), title: "Findings", summary: findingsSummary(d.findings, nvPole),
      body: fBody, open: p0 > 0, tone: p0 ? (nvPole ? "caution" : "stop") : null }));
    sections.push({ id: "findings", label: "Findings" });
  }

  // §L (absence-aware)
  if (d.submissionL && d.submissionL.grounded === false) {
    if (complete) { parts.push(flatRow("sec-l", nn(), "Section L · Submission", "Not applicable — no separate proposal volumes")); sections.push({ id: "sec-l", label: "§L Submission" }); }
  } else if (d.submissionL) {
    parts.push(disc({ id: "sec-l", n: nn(), title: "Section L · Submission", summary: plur(d.submissionL.rows.length, "submission volume", "submission volumes"), body: submissionLBody(d.submissionL) }));
    sections.push({ id: "sec-l", label: "§L Submission" });
  }

  // §M
  if (d.evalM && d.evalM.grounded === false) {
    if (complete) { parts.push(flatRow("sec-m", nn(), "Section M · Evaluation", "Not applicable — no source-selection factors")); sections.push({ id: "sec-m", label: "§M Evaluation" }); }
  } else if (d.evalM) {
    parts.push(disc({ id: "sec-m", n: nn(), title: "Section M · Evaluation", summary: evalMSummary(d.evalM), body: evalMBody(d.evalM) }));
    sections.push({ id: "sec-m", label: "§M Evaluation" });
  }

  // CLIN
  if (d.clins && d.clins.grounded === false) {
    if (complete) { parts.push(flatRow("clins", nn(), "CLIN structure", "Not applicable — no CLIN structure published")); sections.push({ id: "clins", label: "CLIN structure" }); }
  } else if (d.clins) {
    parts.push(disc({ id: "clins", n: nn(), title: "CLIN structure", summary: plur(d.clins.rows.length, "line item", "line items"), body: clinsBody(d.clins) }));
    sections.push({ id: "clins", label: "CLIN structure" });
  }

  // Key dates — summary surfaces the gate/closing date
  if (d.dates && d.dates.length) {
    const g = d.dates.find((x) => x.kind === "gate") || d.dates[d.dates.length - 1];
    const dsum = g ? `${esc(g.label)} <span class="sum-sep">·</span> <b>${esc(g.value)}</b>` : plur(d.dates.length, "milestone", "milestones");
    parts.push(disc({ id: "dates", n: nn(), title: "Key dates", summary: dsum, body: datesBody(d.dates) }));
    sections.push({ id: "dates", label: "Key dates" });
  }

  // Provenance
  const cov = d.coverage || ({} as V4Data["coverage"]);
  const pvsum = `${(cov.read != null && cov.total != null) ? cov.read + "/" + cov.total + " documents read" : (d.provenance.manifest || []).length + " documents"} · ${(cov.state || "").toLowerCase()}`;
  parts.push(disc({ id: "provenance", n: nn(), title: "Provenance", summary: pvsum,
    body: provenanceBody(d.provenance, { state: cov.state, solicitation: d.masthead.solicitation }) }));
  sections.push({ id: "provenance", label: "Provenance" });

  return { html: parts.join("\n"), sections };
}
