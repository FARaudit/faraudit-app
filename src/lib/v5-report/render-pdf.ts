/* =============================================================================
   v5 Executive Brief (PDF) — DOCUMENT renderer
   Ported 1:1 from the Design v5 package (_v5-PORT-READY/src/render-pdf.js,
   2026-07-05). Re-lays the SAME grounded audit data + the SAME Brain-approved
   reasoning chain as the web report (render.ts) as a typeset executive memo —
   portrait Letter, print-native, ink-light.

   SINGLE-SOURCE CONTRACT (port spec §1 + §6.1 — this is what makes "ship the web
   view + two PDFs" safe):
     · reasoning chain  → reasoningSteps() / REACHED_INTRO  (render.ts, verbatim)
     · exec quad (F3)   → scorecardTiles()                   (core.ts, verbatim)
     · verdict/elig/tone → eligInfo / TONE_LABEL / eyebrowFor (core.ts)
     · basis-of-award split → splitMethod                    (render.ts)
   Nothing here re-authors reasoning wording, re-derives the verdict, or computes
   a score. `v.rationale` renders VERBATIM. A doctrine change lands in ONE place
   and every surface inherits it.

   TWO KNOWN presentation deltas vs the pre-F3 static mock (flagged for Design
   Gate-2 QA — they are the F3 consolidation itself, not regressions):
     1. Coverage tile shows "NN%" (scorecardTiles) vs the mock's "read / total".
     2. On OUT_OF_SCOPE (no eligibility) the 4th tile is "Advisories" (p2 count)
        vs the mock's "Eligibility · Not applicable" — doctrine §5 suppresses the
        eligibility chip on OUT_OF_SCOPE, so the advisory count is the honest tile.
   ============================================================================= */
import { esc, hasCol, eligInfo, TONE_LABEL, eyebrowFor, scorecardTiles, splitCaveatRationale, type EligInfo } from "@/lib/v5-report/core";

// Bottom line — lede + ranked top-5 self-clearable caveats, remainder grouped (card #612-(3c)).
// SHARED logic (splitCaveatRationale) with the web + deck surfaces so the Executive Brief PDF
// never dumps the ~50-item semicolon wall; only the wrapper HTML/classes differ per surface.
function bottomLinePdf(rationale: unknown): string {
  const { lede, caveats } = splitCaveatRationale(rationale);
  const top = caveats.slice(0, 5);
  const rest = caveats.length - top.length;
  return `<div class="bl-t">${esc(lede)}</div>` +
    (top.length
      ? `<ul class="bl-caveats">${top.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` +
        (rest > 0 ? `<div class="bl-more">+${rest} more self-clearable item${rest === 1 ? "" : "s"} — see Findings</div>` : "")
      : "");
}
import { reasoningSteps, REACHED_INTRO, splitMethod } from "@/lib/v5-report/render";
import { REPORT_PDF_CSS, REPORT_PDF_SEAL_CSS } from "@/lib/v5-report/styles-pdf";
import { FONTS_CSS } from "@/lib/v5-report/fonts";
import { DOC_PAGE_JS } from "@/lib/v5-report/doc-page";
import { buildV4Data } from "@/lib/v4-report/build-data";
import type { V4Data, V4Verdict, V4Finding } from "@/lib/v4-report/render";
import { isEnvOn } from "@/lib/env-flags";

// The "representative sample" flag is a Design-mock-only affordance (watermark +
// review banner). Production buildV4Data never sets it, so prod briefs are clean.
type WithRep = V4Data & { rep?: boolean };
const isRep = (d: V4Data): boolean => Boolean((d as WithRep).rep);

// Manifest read-state → human label (presentation-only; the engine emits full/indexed/unread).
const READLABEL: Record<string, string> = { full: "Read in full", indexed: "Indexed", unread: "Not read", none: "Not read" };

// Cover eligibility chip: doctrine §5 — OUT_OF_SCOPE suppresses the eligibility chip entirely.
const coverElig = (v: V4Verdict): EligInfo => (v.pole === "OUT_OF_SCOPE" ? null : eligInfo(v));

// ── AUDIT_V5_SEAL — "Decision Seal" verdict box (flag-gated; default-OFF byte-identical) ──
const V5_SEAL = isEnvOn(process.env.AUDIT_V5_SEAL);
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
// NOTE: bottom line renders VERBATIM prose (parity with the deck). The numbered
// bullet-chip treatment (split on the engine's (1)/(2) enumerators, not sentence
// periods) is a Design-spec'd fast-follow — deferred, see card.

// ---- COVER ------------------------------------------------------------------
function cover(d: V4Data): string {
  const v = d.verdict, m = d.masthead, tone = v.tone;
  const elig = coverElig(v);
  const sol = m.solicitation || "—";
  const eyebrow = eyebrowFor(v); // shared: "Gate decision" | "No verdict — …"

  const chips: string[] = [];
  chips.push(`<span class="gv-chip stamp">${esc(TONE_LABEL[tone])}</span>`);
  if (elig) chips.push(`<span class="gv-chip elig" data-e="${elig.cls}"><span class="k">Eligibility</span><span class="v">${esc(elig.label)}</span></span>`);
  if (v.noCharge) chips.push(`<span class="gv-chip nocharge">No charge</span>`);

  const ids = (m.facts || []).map((f) => `
      <div class="gb-id">
        <span class="id-k">${esc(f.k)}</span>
        <span class="id-v${f.mono ? " mono" : ""}">${esc(f.v)}</span>
        ${f.sub ? `<span class="id-sub">${esc(f.sub)}</span>` : ""}
      </div>`).join("");

  const dates = (d.dates || []).slice(0, 4).map((x) => {
    const parts = String(x.value).split(" · ");
    return `<div class="gb-cd${x.kind === "gate" ? " gate" : ""}">
        <div class="cd-k">${esc(x.label)}</div>
        <div class="cd-v">${esc(parts[0])}${parts.length > 1 ? " · " + esc(parts.slice(1).join(" · ")) : ""}</div>
      </div>`;
  }).join("");

  const audited = (d.provenance && d.provenance.auditDate) || "—";
  const rep = isRep(d);

  return `
    <section class="gb-cover${rep ? " is-rep" : ""}">
      <div class="gb-cv-banner">
        <span class="cv-eyebrow"><span class="cv-idx mono">DOC·01</span>Bid / No-Bid Gate Verification</span>
        <span class="cv-class mono">Decision-grade · Traceable to source</span>
      </div>
      <div class="gb-cv-sol">
        <div class="cs-mast"><span class="cs-badge">${esc(m.docType || "SOLICITATION")}</span><span class="cs-num mono">${esc(sol)}</span></div>
        <div class="cs-title">${esc(m.title || "")}</div>
      </div>

      ${V5_SEAL ? `<div class="gb-verdict gv2" data-tone="${tone}"${v.noVerdict ? ' data-noverdict="1"' : ""}>
        ${sealStamp(v)}
        <div class="gv2-cmd">
          <div class="gv2-kick mono">${esc(KICK[v.pole] || eyebrow)}</div>
          <div class="gv2-word">${esc(v.band)}</div>
          ${sealStatus(v)}
        </div>
      </div>` : `<div class="gb-verdict" data-tone="${tone}"${v.noVerdict ? ' data-noverdict="1"' : ""}>
        <div class="gv-lead"><span class="gv-eb"><span class="gv-dot"></span>${esc(eyebrow)}</span>${v.noVerdict ? '<span class="live nv"><span class="live-d"></span>NO VERDICT</span>' : '<span class="live"><span class="live-d"></span>VERIFIED</span>'}</div>
        <div class="gv-word">${esc(v.band)}</div>
        <div class="gv-chips">${chips.join("")}</div>
      </div>`}

      <div class="gb-bl">
        <div class="bl-k">Bottom line</div>
        ${bottomLinePdf(v.rationale)}
      </div>

      ${ids ? `<div class="gb-idgrid gb-dcgrid">${ids}</div>` : ""}
      ${dates ? `<div class="gb-cv-dates">${dates}</div>` : ""}
      ${rep ? `<div class="gb-rep"><b>Representative sample —</b> illustrative solicitation data for design review. Never ships.</div>` : ""}

      <div class="gb-cv-foot">
        <div><span class="cf-k">Audited</span><br>${esc(audited)}</div>
        <div class="cf-rep">${rep
          ? "Representative sample — not for distribution. Watermarked review artifact."
          : "Confidential — auditable gate-review artifact. Distribution per offeror policy."}</div>
      </div>
    </section>`;
}

// ---- exec at-a-glance (F3 — SHARED scorecardTiles, drift-proof) --------------
function execGrid(d: V4Data): string {
  const cells = scorecardTiles(d).map((t) =>
    `<div class="gb-ex" data-tone="${t.tone}"><div class="ex-v${t.textv ? " textv" : ""}">${esc(t.v)}</div><div class="ex-k">${esc(t.k)}</div><div class="ex-sub">${esc(t.sub)}</div></div>`).join("");
  return `<div class="gb-exec">${cells}</div>`;
}

// ---- reasoning chain (Brain-approved steps — SHARED, typeset) ----------------
function reasoning(d: V4Data): string {
  const steps = reasoningSteps(d);
  const rows = steps.map((s, i) => {
    const num = s.skip ? "·" : String(i + 1).padStart(2, "0");
    const finds = (s.findings || []).map((fn) =>
      `<div class="gb-rc-find"><span class="rf-req">${esc(fn.req)}</span><span class="gb-rc-cite">${esc(fn.cite)}</span></div>`).join("");
    const cites = (s.cites && s.cites.length) ? `<span class="gb-rc-cite">${s.cites.map(esc).join(" · ")}</span>` : "";
    return `
        <div class="gb-rc-step${s.verdict ? " verdict" : ""}" data-tone="${s.tone || "slate"}">
          <div class="gb-rc-n">${num}</div>
          <div class="gb-rc-b">
            <div class="gb-rc-k">${esc(s.label)}</div>
            <div class="gb-rc-out">${esc(s.outcome)}</div>
            <div class="gb-rc-d">${esc(s.detail)}</div>
            ${finds}${cites}
          </div>
        </div>`;
  }).join("");
  return `<p class="gb-lead">${esc(REACHED_INTRO)}</p><div class="gb-rc">${rows}</div>`;
}

function decision(d: V4Data): string {
  return `
    <section class="gb-sec">
      <div class="gb-sec-h"><span class="gb-sec-n">01</span><span class="gb-sec-t">The decision</span></div>
      <div class="gb-sub">At a glance</div>
      ${execGrid(d)}
      <div class="gb-sub">How this call was reached</div>
      ${reasoning(d)}
    </section>`;
}

// ---- findings ---------------------------------------------------------------
function findingRow(fn: V4Finding, sev: "p0" | "p1" | "p2", nv = false): string {
  // No-verdict pole: p0 renders as calm "Blocking condition · needs review"
  // (graphite chip + warm-amber rail), never red Show-stopper. (Design v5 gate)
  const nvBlock = nv && sev === "p0";
  const dsev = nvBlock ? "review" : sev;
  const label = nvBlock ? "Blocking condition · needs review" : (sev === "p0" ? "Show-stopper" : sev === "p1" ? "Gate" : "Advisory");
  return `
      <div class="gb-fd"${nvBlock ? ' data-sev="review"' : ""}>
        <div class="gb-fd-top">
          <span class="gb-fd-sev" data-sev="${dsev}">${label}</span>
          <span class="gb-fd-cite mono">${esc(fn.cite)}</span>
        </div>
        <p class="gb-fd-req">${esc(fn.req)}</p>
        ${fn.excerpt ? `<p class="gb-fd-ex">${esc(fn.excerpt)}</p>` : ""}
        ${fn.curability ? `<div class="gb-fd-clear"><span class="cl-k">Clears when</span><span>${esc(fn.curability)}</span></div>` : ""}
      </div>`;
}
function findings(d: V4Data): string {
  const f = d.findings || ({} as V4Data["findings"]), complete = d.coverage.state === "COMPLETE";
  const nv = d.verdict.noVerdict === true;
  const p0 = f.p0 || [], p1 = f.p1 || [], p2 = f.p2 || [];
  if (!complete && !p0.length && !p1.length && !p2.length) return ""; // incomplete-empty: omit (absence rule §2)
  const groups: string[] = [];
  // No-verdict pole: p0 group renders calm (graphite + amber), relabeled — matches the deck's calm register. (Design v5 gate)
  const p0sev = nv ? "review" : "p0";
  const p0title = nv ? "Blocking conditions · needs review" : "Show-stoppers";
  groups.push(`<div class="gb-fg"><div class="gb-fg-h" data-sev="${p0sev}"><span class="fh-sq"></span>${p0title}<span class="fh-c">${p0.length}</span></div>${p0.length ? p0.map((x) => findingRow(x, "p0", nv)).join("") : '<div class="gb-none">None identified in the documents read.</div>'}</div>`);
  if (p1.length) groups.push(`<div class="gb-fg"><div class="gb-fg-h" data-sev="p1"><span class="fh-sq"></span>Gates to clear<span class="fh-c">${p1.length}</span></div>${p1.map((x) => findingRow(x, "p1")).join("")}</div>`);
  if (p2.length) groups.push(`<div class="gb-fg"><div class="gb-fg-h" data-sev="p2"><span class="fh-sq"></span>Advisories<span class="fh-c">${p2.length}</span></div>${p2.map((x) => findingRow(x, "p2")).join("")}</div>`);
  return `<div class="gb-sub">Findings</div><p class="gb-lead">Every finding carries its citation and the verbatim text it rests on.</p>${groups.join("")}`;
}

// ---- L / M / CLIN / dates ---------------------------------------------------
function submissionL(d: V4Data): string {
  const s = d.submissionL;
  if (!s.grounded) return "";
  const provision = (s as { provision?: string }).provision; // optional in the data contract
  const showVol = hasCol(s.rows, (r) => r.vol);   // REPORT-TRUTH #3 — drop the column the engine never typed
  const rows = s.rows.map((r) => {
    const p = splitMethod(r.req);
    return `<tr>${showVol ? `<td class="c-vol">${esc(r.vol)}</td>` : ""}<td><span class="c-strong">${esc(p.head)}</span>${p.tail ? " — " + esc(p.tail) : ""}${r.condition ? `<div class="c-sub">${esc(r.condition)}</div>` : ""}</td><td class="c-mono">${esc(r.cite)}</td></tr>`;
  }).join("");
  return `<div class="gb-sub">Section L · Submission ${provision ? `<span class="gs-cite">${esc(provision)}</span>` : ""}</div>
      ${s.lead ? `<p class="gb-lead">${esc(s.lead)}</p>` : ""}
      <table class="gb-table"><thead><tr>${showVol ? "<th>Volume</th>" : ""}<th>Requirement &amp; condition</th><th>Cite</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function evalM(d: V4Data): string {
  const e = d.evalM;
  if (!e.grounded) return "";
  const sp = splitMethod(e.basis || "");
  const rows = (e.factors || []).map((f, i) => {
    const mm = /^(Factor\s*\d+)\s*—\s*(.+)$/.exec(f.name || "");
    const rank = mm ? mm[1] : String(i + 1), title = mm ? mm[2] : f.name;
    return `<tr><td class="c-mono">${esc(rank)}</td><td><span class="c-strong">${esc(title)}</span>${i === 0 ? ' <span class="c-sub">· most important</span>' : ""}</td><td>${esc(f.basis)}</td><td class="c-mono">${esc(f.cite)}</td></tr>`;
  }).join("");
  return `<div class="gb-sub">Section M · Evaluation</div>
      <div class="gb-award"><div class="aw-k">Basis of award</div><div class="aw-v">${esc(sp.head)}</div>${sp.tail ? `<p class="aw-tail">— ${esc(sp.tail)}</p>` : ""}</div>
      <table class="gb-table"><thead><tr><th>Rank</th><th>Factor</th><th>How it is evaluated</th><th>Cite</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="gb-mnote">No weights, points, or numeric score are published — the order of importance above is the Government's stated basis, read straight from Section M.</p>`;
}
function clins(d: V4Data): string {
  const c = d.clins;
  if (!c.grounded) return "";
  // REPORT-TRUTH #3 — same compute-or-absent rule as the web renderer; the PDF must not print columns the web drops.
  const sh = { clin: hasCol(c.rows, (r) => r.clin), type: hasCol(c.rows, (r) => r.type), qty: hasCol(c.rows, (r) => r.qtyUnit), per: hasCol(c.rows, (r) => r.period) };
  const rows = c.rows.map((r) => `<tr>${sh.clin ? `<td class="c-vol">${esc(r.clin)}</td>` : ""}<td class="c-strong">${esc(r.title)}</td>${sh.type ? `<td class="c-mono">${esc(r.type)}</td>` : ""}${sh.qty ? `<td class="c-mono">${esc(r.qtyUnit)}</td>` : ""}${sh.per ? `<td class="c-mono">${esc(r.period)}</td>` : ""}</tr>`).join("");
  return `<div class="gb-sub">CLIN structure</div>${c.lead ? `<p class="gb-lead">${esc(c.lead)}</p>` : ""}
      <table class="gb-table"><thead><tr><th>CLIN</th><th>Title</th><th>Type</th><th>Qty / unit</th><th>Period</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function keyDates(d: V4Data): string {
  if (!d.dates || !d.dates.length) return "";
  const rows = d.dates.map((x) => `<tr><td class="c-strong">${esc(x.label)}${x.kind === "gate" ? ' <span class="c-sub">· gate</span>' : ""}</td><td class="c-mono">${esc(x.value)}</td></tr>`).join("");
  return `<div class="gb-sub">Key dates</div><table class="gb-table"><thead><tr><th>Milestone</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function evidence(d: V4Data): string {
  const body = [findings(d), submissionL(d), evalM(d), clins(d), keyDates(d)].filter(Boolean).join("");
  if (!body) return "";
  return `<section class="gb-sec">
      <div class="gb-sec-h"><span class="gb-sec-n">02</span><span class="gb-sec-t">The evidence</span></div>
      ${body}
    </section>`;
}

// ---- provenance -------------------------------------------------------------
function provenance(d: V4Data): string {
  const p = d.provenance, cov = d.coverage, m = d.masthead;
  const man = (p.manifest || []).map((x) =>
    `<li><span class="m-r" data-r="${x.read}">${esc(READLABEL[x.read] || x.read)}</span><span class="m-n">${esc(x.name)}</span></li>`).join("");
  return `<section class="gb-sec">
      <div class="gb-sec-h"><span class="gb-sec-n">03</span><span class="gb-sec-t">Provenance</span></div>
      <div class="gb-idgrid" style="grid-template-columns:1fr 1fr 1fr;margin-top:0">
        <div class="gb-id"><span class="id-k">Solicitation</span><span class="id-v mono">${esc(m.solicitation || "—")}</span></div>
        <div class="gb-id"><span class="id-k">Audited</span><span class="id-v">${esc(p.auditDate || "—")}</span></div>
        <div class="gb-id"><span class="id-k">Coverage</span><span class="id-v">${esc(cov.state || "—")}${(cov.read != null && cov.total != null) ? ` · ${cov.read}/${cov.total} read` : ""}</span></div>
      </div>
      <div class="gb-sub">Documents read</div>
      <ul class="gb-man">${man}</ul>
      <p class="gb-defense">This manifest is the defensibility layer for the gate review: it records exactly which documents the engine read, indexed, or could not reach, so the decision above can be traced to its sources.</p>
    </section>`;
}

// ---- assemble ---------------------------------------------------------------
/** The Executive Brief BODY — running header/footer slots + cover + the three
 *  sections. Direct children of <doc-page>; slot="header"/"footer" repeat per page. */
export function renderExecBriefBodyV5(d: V4Data): string {
  const v = d.verdict, sol = d.masthead.solicitation || "—", rep = isRep(d);
  const head = `<div slot="header" class="gb-head">
      <span class="gh-mark"><span class="wm-a">FAR</span><span class="wm-b">audit</span><span class="wm-dot"></span> <span class="gh-tagline">Gate Brief</span></span>
      <span class="gh-r"><span class="gh-sol">${esc(sol)}</span><span class="gh-tag" data-tone="${v.tone}">${esc(v.band)}</span></span>
    </div>`;
  const foot = `<div slot="footer" class="gb-foot">
      <span>${rep ? "Representative sample — not for distribution" : "Confidential — auditable gate-review artifact"}</span>
      <span class="gf-brand">FARaudit · faraudit.com</span>
      <span class="gf-sol">${esc(sol)}</span>
    </div>`;
  return head + foot + cover(d) + decision(d) + evidence(d) + provenance(d);
}

/** Full standalone Executive Brief HTML document (portrait Letter), self-contained
 *  for headless-Chromium PDF capture: REPORT_PDF_CSS + the <doc-page> shell inlined. */
export function renderExecBriefDocV5(d: V4Data): string {
  const sol = esc(d.masthead.solicitation || d.shell?.auditId || "—");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FARaudit · Executive Brief · ${sol}</title>
<style>${FONTS_CSS}</style>
<style>${REPORT_PDF_CSS}</style>${V5_SEAL ? `\n<style>${REPORT_PDF_SEAL_CSS}</style>` : ""}
<style>doc-page:not(:defined){visibility:hidden}</style>
</head>
<body>
<doc-page size="letter" margin="0.75in">${renderExecBriefBodyV5(d)}</doc-page>
<script>${DOC_PAGE_JS}</script>
</body>
</html>`;
}

/** Entry from a persisted audit row (mirrors renderV5ReportFromRow): buildV4Data → doc. */
export function renderExecBriefV5(audit: Record<string, unknown>): string {
  return renderExecBriefDocV5(buildV4Data(audit));
}
