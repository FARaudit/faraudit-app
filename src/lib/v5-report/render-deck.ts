/* =============================================================================
   v5 Gate Deck (PDF) — DECK renderer (landscape, one idea per slide)
   Ported 1:1 from the Design v5 package (_v5-PORT-READY/src/render-deck.js,
   2026-07-05). Re-lays the SAME grounded audit data + the SAME Brain-approved
   reasoning chain as the web report (render.ts) and the Executive Brief
   (render-pdf.ts) as a boardroom deck: cover · decision · scorecard · drivers ·
   reasoning · gates · evaluation · response · provenance.

   SINGLE-SOURCE CONTRACT (port spec §1/§6.1) — identical to the Executive Brief:
     · reasoning chain  → reasoningSteps() / REACHED_INTRO  (render.ts, verbatim)
     · scorecard quad (F3) → scorecardTiles()               (core.ts, verbatim)
     · verdict/elig/tone/eyebrow → eligInfo / TONE_LABEL / eyebrowFor (core.ts)
     · basis-of-award split → splitMethod                   (render.ts)
   No score, no engine version; rationale VERBATIM; absence rule (empty
   drivers/gates/§M/§L/reasoning slides are omitted, never shown empty);
   OUT_OF_SCOPE §5 eligibility suppression.

   Same two known presentation deltas vs the pre-F3 static mock as the Executive
   Brief (scorecard coverage "NN%"; OUT_OF_SCOPE 4th tile "Advisories") — the F3
   consolidation itself, flagged for Design Gate-2 QA.

   PRINT HOST: slides render in the mock's own `.scrollmode` (light DOM); @page +
   1-slide/page pagination live in REPORT_DECK_CSS. No presenter/editor runtime.
   ============================================================================= */
import { esc, eligInfo, TONE_LABEL, eyebrowFor, scorecardTiles, splitCaveatRationale, type EligInfo } from "@/lib/v5-report/core";
import { reasoningSteps, REACHED_INTRO, splitMethod } from "@/lib/v5-report/render";

// Bottom line — lede + ranked top-5 self-clearable caveats, remainder grouped (card #612-(3c)).
// SHARED logic with the web + Executive Brief surfaces so the Gate Deck never dumps the wall.
function bottomLineDeck(rationale: unknown): string {
  const { lede, caveats } = splitCaveatRationale(rationale);
  const top = caveats.slice(0, 5);
  const rest = caveats.length - top.length;
  return `<div class="bl-t">${esc(lede)}</div>` +
    (top.length
      ? `<ul class="bl-caveats">${top.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` +
        (rest > 0 ? `<div class="bl-more">+${rest} more self-clearable item${rest === 1 ? "" : "s"} — see Findings</div>` : "")
      : "");
}
import { REPORT_DECK_CSS, REPORT_DECK_SEAL_CSS } from "@/lib/v5-report/styles-deck";
import { FONTS_CSS } from "@/lib/v5-report/fonts";
import { buildV4Data } from "@/lib/v4-report/build-data";
import type { V4Data, V4Verdict, V4SubmissionL, V4EvalM, V4Finding } from "@/lib/v4-report/render";

type WithRep = V4Data & { rep?: boolean };
const isRep = (d: V4Data): boolean => Boolean((d as WithRep).rep);
const READLABEL: Record<string, string> = { full: "Read in full", indexed: "Indexed", unread: "Not read", none: "Not read" };
// doctrine §5 — OUT_OF_SCOPE suppresses the eligibility chip entirely.
const coverElig = (v: V4Verdict): EligInfo => (v.pole === "OUT_OF_SCOPE" ? null : eligInfo(v));

// verdict tone icons — same family as the web command band (FARaudit signature)
const ICON: Record<string, string> = {
  go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>',
  caution: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  slate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
};

// ── AUDIT_V5_SEAL — "Decision Seal" verdict box (flag-gated; default-OFF byte-identical) ──
const V5_SEAL = process.env.AUDIT_V5_SEAL === "true";
const SEAL_ICON: Record<string, string> = {
  go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/></svg>',
  caution: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5L21.5 20H2.5z"/><path d="M12 9.6v4.4"/><path d="M12 17h.01"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>',
  slate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
};
const STAMPWORD: Record<string, string> = { BID: "Bid", BID_WITH_CAUTION: "Bid · Caution", NO_BID: "No-Bid", INELIGIBLE: "Ineligible", NEEDS_HUMAN_REVIEW: "Needs Human Review", INCOMPLETE: "Incomplete", OUT_OF_SCOPE: "Out of Scope" };
const DISPO: Record<string, string> = { BID: "CLEARED", BID_WITH_CAUTION: "CONDITIONAL", NO_BID: "DECLINED", INELIGIBLE: "BARRED", NEEDS_HUMAN_REVIEW: "REFERRED", INCOMPLETE: "NOT REACHED", OUT_OF_SCOPE: "NOT APPLICABLE" };
const KICK: Record<string, string> = { BID: "Cleared on the facts read — proceed to proposal", BID_WITH_CAUTION: "Proceed, but clear the gates below first", NO_BID: "Final disposition — a universal defect blocks the field", INELIGIBLE: "Not curable here — team with a certified prime or target full-and-open", NEEDS_HUMAN_REVIEW: "Route to a human reviewer to confirm eligibility", INCOMPLETE: "Provide the missing documents to complete the read", OUT_OF_SCOPE: "No offer to make — market research only" };
function sealStamp(v: V4Verdict): string {
  const word = STAMPWORD[v.pole] || v.band || "";
  const dispo = DISPO[v.pole] || "";
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

const WM = `<span class="wm"><span class="wm-a">FAR</span><span class="wm-b">audit</span><span class="wm-dot"></span></span>`;
// "VERIFIED" live pill — STATE-AWARE: only a committal audit is "verified"; an honest-fail must not claim it.
const livePill = (v: V4Verdict): string =>
  v.noVerdict
    ? `<span class="live nv"><span class="live-d"></span>NO VERDICT</span>`
    : `<span class="live"><span class="live-d"></span>VERIFIED</span>`;

interface Slide { tone: string; label: string; body: string; }

// running slide chrome — brand FRAME on the skirts
function chrome(d: V4Data, sectionLabel: string) {
  const sol = d.masthead.solicitation || "—";
  return {
    top: `<div class="sl-top"><span class="st-l">${WM}<span class="st-tag">Federal Contract Intelligence</span></span><span class="st-r mono">${esc(sol)}</span></div>`,
    wm: `<div class="sl-mark"><span>${isRep(d) ? "REVIEW — NOT FOR DISTRIBUTION" : "FARAUDIT"}</span></div>`,
    bot: (n: number, total: number) => `<div class="sl-bot"><span class="sb-l"><b>FARaudit</b> · faraudit.com</span><span class="sb-n mono">${esc(sectionLabel)} &nbsp;·&nbsp; ${String(n).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span></div>`,
  };
}

// ---- S1 · COVER — defense-grade document-control masthead + verdict readout --
function coverSlide(d: V4Data): Slide {
  const v = d.verdict, m = d.masthead, tone = v.tone, elig = coverElig(v);
  const f = d.findings, cov = d.coverage;
  const p0 = (f.p0 || []).length, p1 = (f.p1 || []).length;
  const dcFacts = (m.facts || []).slice(0, 5).map((x) =>
    `<div class="dc"><span class="dc-k mono">${esc(x.k)}</span><span class="dc-v">${esc(x.v)}</span></div>`).join("");
  const audited = (d.provenance && d.provenance.auditDate) || "—";
  const offers = (d.dates || []).find((x) => /proposal|offer|closing|bid due|response/i.test(x.label))
    || (d.dates || []).find((x) => x.kind === "gate");
  const chips: string[] = [];
  if (!v.noVerdict) chips.push(`<span class="cvc-stamp" data-tone="${tone}">${esc(TONE_LABEL[tone])}</span>`);
  if (elig) chips.push(`<span class="cvc-elig" data-e="${elig.cls}">Eligibility · ${esc(elig.label)}</span>`);
  if (v.noCharge) chips.push(`<span class="cvc-elig nocharge">No charge</span>`);
  const nv = v.noVerdict;
  const rows: [string, string, string][] = [
    ["Show-stoppers", nv ? "Not determined" : (p0 ? String(p0) : "None found"), nv ? "nd" : (p0 ? "stop" : "")],
    ["Gates to clear", nv ? "Not determined" : (p1 ? String(p1) : "None"), nv ? "nd" : (p1 ? "caution" : "")],
    ["Coverage", (cov.read != null && cov.total != null) ? `${cov.read} / ${cov.total} · ${(cov.state || "").toLowerCase()}` : (cov.state || "—"), ""],
  ];
  if (offers) rows.push(["Offers due", offers.value, "gate"]);
  const rowHTML = rows.map(([k, val, t]) => `<div class="cvc-row"><span class="cvc-k mono">${esc(k)}</span><span class="cvc-v mono${t ? " t-" + t : ""}">${esc(val)}</span></div>`).join("");
  return {
    tone, label: "Cover",
    body: `<div class="cv2">
        <div class="cv2-banner">
          <span class="cv2-eyebrow"><span class="cv2-idx mono">DOC·01</span>Bid / No-Bid Gate Verification</span>
          <span class="cv2-class mono">Decision-grade &nbsp;·&nbsp; Traceable to source</span>
        </div>
        <div class="cv2-grid">
          <div class="cv2-lead">
            <div class="cv2-mast"><span class="cv-badge">${esc(m.docType || "SOLICITATION")}</span><span class="cv-sol mono">${esc(m.solicitation || "—")}</span></div>
            <div class="cv2-title">${esc(m.title || "")}</div>
            <div class="cv2-thesis">A bid/no-bid call you can take into <b>any room</b> — every finding cited to the solicitation, no score to game.</div>
            <div class="cv2-dc">${dcFacts}<div class="dc"><span class="dc-k mono">Audited</span><span class="dc-v mono">${esc(audited)}</span></div></div>
          </div>
          <div class="cv-console" data-tone="${tone}">
            <div class="cvc-head">${livePill(v)}<span class="cvc-run mono">RUN · ${esc((m.solicitation || "—").replace(/[^A-Z0-9]/gi, "").slice(-8) || "AUDIT")}</span></div>
            <div class="cvc-lab mono">Gate decision</div>
            <div class="cvc-word" data-tone="${tone}">${esc(v.band)}</div>
            <div class="cvc-chips">${chips.join("")}</div>
            <div class="cvc-rule"></div>
            <div class="cvc-facts">${rowHTML}</div>
          </div>
        </div>
        <span class="rm rm-tl"></span><span class="rm rm-tr"></span><span class="rm rm-bl"></span><span class="rm rm-br"></span>
      </div>`,
  };
}

// ---- S2 · THE DECISION ------------------------------------------------------
function decisionSlide(d: V4Data): Slide {
  const v = d.verdict, tone = v.tone, elig = coverElig(v);
  const eyebrow = eyebrowFor(v); // shared: "Gate decision" | "No verdict — …"
  const chips: string[] = [];
  if (!v.noVerdict) chips.push(`<span class="vd-chip">${esc(TONE_LABEL[tone])}</span>`);
  if (elig) chips.push(`<span class="vd-chip elig" data-e="${elig.cls}"><span class="k">Eligibility</span><span class="v">${esc(elig.label)}</span></span>`);
  if (v.noCharge) chips.push(`<span class="vd-chip nocharge">No charge</span>`);
  const gates = (d.dates || []).filter((x) => /due|visit|question|closing|award/i.test(x.label)).slice(0, 3);
  const gateHTML = gates.map((x) => `<div class="vd-f${x.kind === "gate" ? " gate" : ""}"><div class="vf-k">${esc(x.label)}</div><div class="vf-v">${esc(x.value)}</div></div>`).join("");
  return {
    tone, label: "Decision",
    body: `<div class="vd-body">
        ${V5_SEAL ? `<div class="vd-plate gv2" data-tone="${tone}">
          ${sealStamp(v)}
          <div class="gv2-cmd">
            <div class="gv2-kick mono">${esc(KICK[v.pole] || eyebrow)}</div>
            <div class="gv2-word">${esc(v.band)}</div>
            ${sealStatus(v)}
          </div>
        </div>` : `<div class="vd-plate">
          <div class="vd-lead"><div class="sl-eyebrow"><span class="eb-dot"></span>${esc(eyebrow)}</div>${livePill(v)}</div>
          <div class="vd-vrow"><span class="vd-ico">${ICON[tone] || ICON.slate}</span><span class="vd-word">${esc(v.band)}</span></div>
          <div class="vd-chips">${chips.join("")}</div>
        </div>`}
        <div class="vd-bl"><div class="bl-k">Bottom line</div>${bottomLineDeck(v.rationale)}</div>
        ${gateHTML ? `<div class="vd-facts">${gateHTML}</div>` : ""}
      </div>`,
  };
}

// ---- S3 · AT A GLANCE (quad — SHARED scorecardTiles, F3 drift-proof) ---------
function glanceSlide(d: V4Data): Slide {
  const cells = scorecardTiles(d).map((t) =>
    `<div class="qd" data-tone="${t.tone}"><div class="qd-v${t.textv ? " textv" : ""}">${esc(t.v)}</div><div class="qd-k">${esc(t.k)}</div><div class="qd-sub">${esc(t.sub)}</div></div>`).join("");
  return {
    tone: d.verdict.tone, label: "Scorecard",
    body: `<div class="sl-eyebrow"><span class="eb-dot"></span>The scorecard</div>
      <div class="sl-title">At a glance</div>
      <div class="quad">${cells}</div>`,
  };
}

// ---- S4 · WHAT DRIVES THIS CALL ---------------------------------------------
function driversSlide(d: V4Data): Slide | null {
  if (d.verdict.noVerdict) return null; // no call was reached → nothing "drives" it (honest-fail)
  const f = d.findings;
  const drivers = ([] as V4Finding[]).concat(f.p0 || [], f.p1 || []).filter((x) => x.driver === true);
  if (!drivers.length) return null; // nothing drives it → omit (absence rule)
  const shown = drivers.slice(0, 3);
  const more = drivers.length - shown.length;
  const rows = shown.map((x, i) => `
      <div class="drv">
        <div class="drv-n">${String(i + 1).padStart(2, "0")}</div>
        <div class="drv-b">
          <div class="drv-req">${esc(x.req)}</div>
          ${x.curability ? `<div class="drv-why">${esc(x.curability)}</div>` : ""}
        </div>
        <div class="drv-cite">${esc(x.cite)}</div>
      </div>`).join("");
  return {
    tone: d.verdict.tone, label: "Drivers",
    body: `<div class="sl-eyebrow"><span class="eb-dot"></span>Why — what drives this call</div>
      <div class="sl-title">The conditions that shaped the call</div>
      <div class="drv-list">${rows}${more > 0 ? `<div class="drv-why" style="text-align:center">+ ${more} more in the gates that follow</div>` : ""}</div>`,
  };
}

// ---- S5 · HOW THIS CALL WAS REACHED (flow — SHARED reasoning chain) ----------
function reachedSlide(d: V4Data): Slide {
  const steps = reasoningSteps(d);
  let closer = "";
  const nodes = steps.map((s, i) => {
    const filled = s.verdict ? " filled" : "";
    const skip = s.skip ? " skip" : "";
    const mark = s.verdict ? "✓" : s.skip ? "·" : String(i + 1).padStart(2, "0");
    if (s.verdict) closer = s.detail;
    return `<div class="fn${filled}${skip}" data-tone="${s.tone || "slate"}">
        <div class="fn-dot">${mark}</div>
        <div class="fn-k">${esc(s.label)}</div>
        <div class="fn-out">${esc(s.outcome)}</div>
      </div>`;
  }).join("");
  return {
    tone: d.verdict.tone, label: "Reasoning",
    body: `<div class="sl-eyehead"><div class="sl-eyebrow"><span class="eb-dot"></span>How this call was reached</div>${livePill(d.verdict)}</div>
      <div class="sl-title">The sequence, not a score</div>
      <div class="rc-intro">${esc(REACHED_INTRO)}</div>
      <div class="flow">${nodes}</div>
      ${closer ? `<div class="rc-closer"><div class="cl-k">Where it lands</div><div class="cl-t">${esc(closer)}</div></div>` : ""}`,
  };
}

// ---- S6 · GATES TO CLEAR ----------------------------------------------------
function gatesSlide(d: V4Data): Slide | null {
  if (d.verdict.noVerdict) return null; // a partial/halted read cannot enumerate gates "to clear" (honest-fail)
  const f = d.findings;
  const p0 = f.p0 || [], p1 = f.p1 || [];
  const list: [string, V4Finding][] = ([] as [string, V4Finding][]).concat(
    p0.map((x) => ["p0", x] as [string, V4Finding]), p1.map((x) => ["p1", x] as [string, V4Finding]));
  if (!list.length) return null; // absence rule
  const shown = list.slice(0, 4);
  const rows = shown.map(([sev, x]) => `
      <div class="gt">
        <span class="gt-sev" data-sev="${sev}">${sev === "p0" ? "Show-stopper" : "Gate"}</span>
        <div class="gt-b">
          <div class="gt-req">${esc(x.req)}</div>
          ${x.curability ? `<div class="gt-clear"><span class="cl-k">Clears when</span><span>${esc(x.curability)}</span></div>` : ""}
        </div>
        <div class="gt-cite">${esc(x.cite)}</div>
      </div>`).join("");
  const more = list.length - shown.length;
  const stops = p0.length;
  return {
    tone: stops ? "stop" : "caution", label: stops ? "Show-stoppers" : "Gates",
    body: `<div class="sl-eyebrow"><span class="eb-dot"></span>${stops ? "Show-stoppers — must clear before bid" : "Gates to clear before you submit"}</div>
      <div class="sl-title">${stops ? "What blocks the bid" : "What must be true to win"}</div>
      <div class="gates">${rows}${more > 0 ? `<div class="gt-cite" style="text-align:center">+ ${more} more in the full record</div>` : ""}</div>`,
  };
}

// ---- S7 · HOW WE WIN — EVALUATION (§M) --------------------------------------
function winSlide(d: V4Data): Slide | null {
  const e = d.evalM;
  if (!e.grounded) return null; // absence rule
  const em: V4EvalM = e;
  const sp = splitMethod(em.basis || "");
  const rows = (em.factors || []).map((f, i) => {
    const mm = /^(Factor\s*\d+)\s*—\s*(.+)$/.exec(f.name || "");
    const rank = mm ? mm[1].replace(/Factor\s*/, "") : String(i + 1), title = mm ? mm[2] : f.name;
    return `<div class="wf${i === 0 ? " lead" : ""}">
        <div class="wf-r">${esc(rank)}</div>
        <div><div class="wf-n">${esc(title)}${i === 0 ? '<span class="most">Most important</span>' : ""}</div><div class="wf-b">${esc(f.basis)}</div></div>
        <div class="wf-cite">${esc(f.cite)}</div>
      </div>`;
  }).join("");
  return {
    tone: d.verdict.tone, label: "Evaluation",
    body: `<div class="sl-eyebrow"><span class="eb-dot"></span>How we win · Section M</div>
      <div class="win-award"><div class="aw-k">Basis of award</div><div class="aw-v">${esc(sp.head)}</div>${sp.tail ? `<div class="aw-tail">— ${esc(sp.tail)}</div>` : ""}</div>
      <div class="win-factors">${rows}</div>
      <div class="win-note">No weights, points, or numeric score are published — the order above is the Government's stated basis, read straight from Section M.</div>`,
  };
}

// ---- S8 · WHAT IT TAKES & WHEN (§L + dates) ---------------------------------
function takesSlide(d: V4Data): Slide | null {
  const sl: V4SubmissionL | null = d.submissionL.grounded ? d.submissionL : null;
  const hasL = sl ? (sl.rows || []).length : 0;
  const hasDates = (d.dates || []).length;
  if (!hasL && !hasDates) return null;
  const vols = hasL && sl ? sl.rows.map((r) => {
    const p = splitMethod(r.req);
    return `<div class="vol">${r.vol !== undefined ? `<div class="vol-v">${esc(r.vol)}</div>` : ""}<div class="vol-b"><div class="vb-t">${esc(p.head)}</div>${r.condition ? `<div class="vb-c">${esc(r.condition)}</div>` : ""}</div></div>`;
  }).join("") : '<div class="vb-c">Submission volumes were not resolved on this read.</div>';
  const tl = hasDates ? d.dates.map((x) => `<div class="tl-item${x.kind === "gate" ? " gate" : ""}"><div class="tl-dot"></div><div><div class="tl-l">${esc(x.label)}</div><div class="tl-v">${esc(x.value)}</div></div></div>`).join("") : "";
  return {
    tone: d.verdict.tone, label: "Response",
    body: `<div class="sl-eyebrow"><span class="eb-dot"></span>What it takes to respond</div>
      <div class="sl-title">Effort &amp; deadlines</div>
      <div class="takes">
        <div><div class="takes-h">Submission — Section L</div>${vols}</div>
        <div><div class="takes-h">Key dates</div><div class="tl">${tl}</div></div>
      </div>`,
  };
}

// ---- S9 · PROVENANCE --------------------------------------------------------
function provenanceSlide(d: V4Data): Slide {
  const p = d.provenance, cov = d.coverage;
  const man = (p.manifest || []).map((x) => `<div class="pv-f"><span class="pv-r" data-r="${x.read}">${esc(READLABEL[x.read] || x.read)}</span><span class="pv-n">${esc(x.name)}</span></div>`).join("");
  return {
    tone: d.verdict.tone, label: "Provenance",
    body: `<div class="sl-eyehead"><div class="sl-eyebrow"><span class="eb-dot"></span>What the engine read</div>${livePill(d.verdict)}</div>
      <div class="sl-title">Provenance &amp; defensibility</div>
      <div class="pv">
        <div class="pv-man">${man}</div>
        <div class="pv-side">
          <div class="ps-k">Audited</div><div class="ps-v">${esc(p.auditDate || "—")}</div>
          <div class="ps-k">Coverage</div><div class="ps-v">${esc(cov.state || "—")}${(cov.read != null && cov.total != null) ? ` · ${cov.read}/${cov.total} read` : ""}</div>
          <div class="pv-defense">This manifest is the defensibility layer for the gate review — it records exactly which documents the engine read, indexed, or could not reach, so the decision traces to its sources.</div>
        </div>
      </div>`,
  };
}

// ---- assemble ---------------------------------------------------------------
/** The Gate Deck BODY — the ordered <section class="sl"> slides (empty slides
 *  omitted by the absence rule), each wrapped with running chrome + n/total. */
export function renderGateDeckBodyV5(d: V4Data): string {
  const slides = [
    coverSlide(d), decisionSlide(d), glanceSlide(d), driversSlide(d),
    reachedSlide(d), gatesSlide(d), winSlide(d), takesSlide(d), provenanceSlide(d),
  ].filter((s): s is Slide => Boolean(s));
  const total = slides.length;
  return slides.map((s, i) => {
    const c = chrome(d, s.label);
    return `<section class="sl" data-tone="${s.tone}" data-screen-label="${String(i + 1).padStart(2, "0")} ${esc(s.label)}">
        ${c.top}
        ${c.wm}
        <div class="sl-body">${s.body}</div>
        ${c.bot(i + 1, total)}
      </section>`;
  }).join("\n");
}

/** Full standalone Gate Deck HTML document (landscape 1280×720), self-contained
 *  for headless-Chromium capture: REPORT_DECK_CSS + slides in the light-DOM
 *  .scrollmode host (@page paginates one slide per landscape page at print). */
export function renderGateDeckDocV5(d: V4Data): string {
  const sol = esc(d.masthead.solicitation || d.shell?.auditId || "—");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FARaudit · Gate Deck · ${sol}</title>
<style>${FONTS_CSS}</style>
<style>${REPORT_DECK_CSS}</style>${V5_SEAL ? `\n<style>${REPORT_DECK_SEAL_CSS}</style>` : ""}
</head>
<body>
<div class="scrollmode">${renderGateDeckBodyV5(d)}</div>
</body>
</html>`;
}

/** Entry from a persisted audit row (mirrors renderV5ReportFromRow): buildV4Data → deck. */
export function renderGateDeckV5(audit: Record<string, unknown>): string {
  return renderGateDeckDocV5(buildV4Data(audit));
}
