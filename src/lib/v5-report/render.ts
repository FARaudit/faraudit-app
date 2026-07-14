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
import { esc, TONE_LABEL, SEVLAB, eligInfo, eyebrowFor, plur, cap, scorecardTiles, type EligInfo } from "./core";

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
  const clockHTML = od ? `
      <div class="cmd-clock" title="Solicitation closing — grounded fact, not a schedulability judgment">
        <span class="cmd-clock-ic">${I.clock}</span>
        <span class="cmd-clock-k">${esc(od.label)}</span>
        <span class="cmd-clock-v mono">${esc(od.value)}</span>
      </div>` : "";

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
            <p class="cmd-bl-t">${esc(v.rationale)}</p>
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

  // 01 — COVERAGE
  steps.push({
    tone: complete ? "go" : "slate", label: "Coverage read",
    outcome: complete ? "Sufficient" : "Incomplete",
    detail: complete
      ? `${cov.read} of ${cov.total} documents read in full${coreOk.length ? `; core sections present (${coreOk.join(" · ")})` : ""}. ${cov.read < cov.total ? "The unread documents contain no required section, so the read is sufficient for the decision to rest on it." : "No documents were left unread — the decision rests on the complete record."}`
      : `${cov.read} of ${cov.total} documents could be read. A partial read cannot certify what it did not see — the sequence stops here and no verdict is issued.`,
  });
  if (!complete) { // INCOMPLETE — terminal at coverage
    steps.push(skip("Remaining checks", "Blocking conditions, findings and eligibility need a complete read; they were not run."));
    steps.push(verdictStep());
    return steps;
  }

  // 02 — complete + no-verdict poles (NHR reconcile / OUT_OF_SCOPE scope) — terminal here
  if (v.noVerdict) {
    const oos = v.pole === "OUT_OF_SCOPE";
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
