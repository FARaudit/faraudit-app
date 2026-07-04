/* =============================================================================
   v4 Rich Web Report — render engine (Direction B "The Instrument")
   Ported 1:1 from design source render.js (card 225 / v4-report-B-2026-07-04).
   renderRichWeb(data) → { html, sections:[{id,label,tone}] }
   Structure only; theming lives in report.css (gated by html[data-dir="B"]).
   Absence doctrine: section grounded:false → COMPLETE coverage renders ONE honest
   absence line; INCOMPLETE coverage omits the section entirely.
   Every interpolated field is routed through esc() (stored-XSS safe — the persisted
   fields carry attacker-influenceable text: doc names, excerpts, agency).
   ============================================================================= */

export type Tone = "go" | "caution" | "stop" | "slate";
export type Pole =
  | "BID" | "BID_WITH_CAUTION" | "NO_BID" | "INELIGIBLE"
  | "NEEDS_HUMAN_REVIEW" | "INCOMPLETE" | "OUT_OF_SCOPE";

export interface V4Fact { k: string; v: string; sub?: string; mono?: boolean; extracted?: boolean; }
export interface V4Masthead { docType: string; solicitation: string; title: string; facts: V4Fact[]; }
export interface V4Verdict {
  pole: Pole; band: string; tone: Tone; noVerdict?: boolean; noCharge?: boolean;
  eligible?: boolean | null; rationale: string;
}
export interface V4Coverage {
  state: "COMPLETE" | "INCOMPLETE"; lead: string; read: number; indexed: number; total: number;
  core?: { k: string; ok: boolean }[]; missing?: string[]; unreadable?: string[];
}
export interface V4Temporal { gateDays: number | null; windowDays: number | null; gateExceedsWindow: boolean; }
export interface V4Finding { req: string; cite: string; excerpt?: string; curability?: string; temporal?: V4Temporal; driver?: boolean; }
export interface V4Findings { p0: V4Finding[]; p1: V4Finding[]; p2: V4Finding[]; satisfied?: { req: string; cite: string }[]; }
export interface V4Grounded<T> { grounded: boolean; } // { grounded:false } sentinel or the full derived shape
export interface V4SubmissionL { grounded: true; lead?: string; rows: { vol: string; req: string; condition: string; cite: string }[]; }
export interface V4EvalM { grounded: true; basis: string; factors: { name: string; basis: string; cite: string }[]; }
export interface V4Clins { grounded: true; lead?: string; rows: { clin: string; title: string; type: string; qtyUnit: string; period: string }[]; }
export interface V4Date { label: string; value: string; kind?: "gate" | string; }
export interface V4Provenance { auditDate: string; engine: string; manifest: { name: string; read: "full" | "indexed" | "unread" }[]; }
export interface V4Data {
  shell?: { auditId?: string };
  masthead: V4Masthead;
  verdict: V4Verdict;
  coverage: V4Coverage;
  findings: V4Findings;
  submissionL: V4SubmissionL | { grounded: false };
  evalM: V4EvalM | { grounded: false };
  clins: V4Clins | { grounded: false };
  dates: V4Date[];
  provenance: V4Provenance;
}
export interface V4Section { id: string; label: string; tone?: Tone; }

const esc = (s: unknown): string => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const I: Record<string, string> = {
  go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>',
  caution: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  slate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/></svg>',
};
const TONE_LABEL: Record<string, string> = { go: "CLEARED", caution: "CONDITIONAL", stop: "BLOCKED", slate: "NO VERDICT" };

function masthead(m: V4Masthead): string {
  const facts = m.facts.map((f) => `
      <div class="mf-row">
        <div class="mf-k">${esc(f.k)}</div>
        <div class="mf-v ${f.mono ? "mono" : ""}"><span class="mf-val">${esc(f.v)}</span>${f.sub ? `<span class="mf-sub">${esc(f.sub)}</span>` : ""}
          ${f.extracted ? '<span class="mf-tag">Extracted</span>' : ""}</div>
      </div>`).join("");
  return `
    <header class="mast" data-sec-anchor="top">
      <div class="mast-l">
        <div class="mast-eyebrow"><span class="mast-badge">${esc(m.docType)}</span>
          <span class="mast-sol mono">${esc(m.solicitation)}</span></div>
        <h1 class="mast-title">${esc(m.title)}</h1>
        <div class="mast-facts">${facts}</div>
      </div>
    </header>`;
}

// Top-line eligibility chip — ON the verdict band (Brain P1-B: eligibility is ONE persisted value per audit).
// Brain port note #1: OUT_OF_SCOPE suppresses the chip as an EXPLICIT POLE RULE, not a key-absence side effect
// (the persisted row ALWAYS carries the nullable `eligible`, so key-presence would wrongly render "Not determined"
// on a Sources Sought). INCOMPLETE + NHR keep "Not determined"; OUT_OF_SCOPE alone suppresses.
function bandElig(v: V4Verdict): string {
  if (v.pole === "OUT_OF_SCOPE") return "";
  let cls: string, label: string;
  if (v.eligible === true) { cls = "ok"; label = "Eligible"; }
  else if (v.eligible === false) { cls = "no"; label = "Ineligible"; }
  else { cls = "nd"; label = "Not determined"; }
  return `<span class="vd-elig ${cls}"><span class="ve-k">Eligibility</span><span class="ve-v">${label}</span></span>`;
}

function verdict(v: V4Verdict, meta: { auditId?: string; auditDate?: string; coverage?: V4Coverage }): string {
  const eyebrow = v.noVerdict
    ? `<span class="vd-eyebrow-t">No verdict — human adjudication</span>`
    : `<span class="vd-eyebrow-t">Gate assessment</span>`;
  const charge = v.noCharge ? `<span class="vd-nocharge">No charge</span>` : "";
  const m = meta || {};
  const cov = m.coverage || ({} as V4Coverage);
  const pct = cov.total ? Math.round((cov.read / cov.total) * 100) : null;
  const readout = `
          <aside class="vd-readout mono" aria-hidden="true">
            <div class="vdr-row"><span class="vdr-k">Assessment</span><span class="vdr-v">${esc(m.auditId || "—")}</span></div>
            <div class="vdr-row"><span class="vdr-k">Evaluated</span><span class="vdr-v">${esc(m.auditDate || "—")}</span></div>
            <div class="vdr-row"><span class="vdr-k">Coverage</span><span class="vdr-v">${pct == null ? "—" : pct + "%"}<span class="vdr-sub">${cov.total ? " · " + cov.read + "/" + cov.total + " docs" : ""}</span></span></div>
          </aside>`;
  return `
    <section class="sec vd-sec" id="verdict" data-sec data-tone="${esc(v.tone)}"${v.noVerdict ? ' data-noverdict="1"' : ""}>
      <div class="vd-band">
        <div class="vd-spine" aria-hidden="true"></div>
        <div class="vd-main">
          <div class="vd-eyebrow"><span class="vd-ico">${I[v.tone] || I.slate}</span>${eyebrow}${charge}</div>
          <div class="vd-word-row">
            <div class="vd-word">${esc(v.band)}</div>
            <div class="vd-stamp mono">${TONE_LABEL[v.tone] || ""}</div>
            ${bandElig(v)}
          </div>
          <p class="vd-rationale">${esc(v.rationale)}</p>
        </div>${readout}
      </div>
    </section>`;
}

function coverage(c: V4Coverage): string {
  const pct = c.total ? Math.round((c.read / c.total) * 100) : 0;
  const core = (c.core || []).map((x) =>
    `<span class="cov-core ${x.ok ? "ok" : "no"}"><span class="cc-k mono">${esc(x.k)}</span>${x.ok ? "present" : "missing"}</span>`).join("");
  const missing = (c.missing || []).length
    ? `<div class="cov-flag"><span class="cf-h">Core section missing</span><ul>${c.missing!.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const unread = (c.unreadable || []).length
    ? `<div class="cov-flag"><span class="cf-h">Could not be parsed (${c.unreadable!.length})</span><ul>${c.unreadable!.map((x) => `<li class="mono">${esc(x)}</li>`).join("")}</ul></div>` : "";
  return `
    <section class="sec" id="coverage" data-sec>
      <div class="sec-head"><span class="sec-n mono">01</span><h2>Coverage</h2>
        <span class="sec-state ${c.state === "COMPLETE" ? "ok" : "part"}">${esc(c.state)}</span></div>
      <p class="sec-lead">${esc(c.lead)}</p>
      <div class="cov-bar"><div class="cov-fill" data-pct="${pct}" style="--pct:${pct}%"></div>
        <div class="cov-legend"><b class="mono">${c.read}</b> read in full · <b class="mono">${c.indexed}</b> indexed · of <b class="mono">${c.total}</b> documents</div></div>
      ${core ? `<div class="cov-core-row">${core}</div>` : ""}
      ${missing}${unread}
    </section>`;
}

function temporal(t?: V4Temporal): string {
  if (!t) return "";
  const exceeds = t.gateExceedsWindow;
  return `<div class="find-temporal ${exceeds ? "bad" : ""}">
      <span class="ft-k">Timing evidence</span>
      <span class="ft-v mono">gate ${esc(t.gateDays)}d</span><span class="ft-sep">·</span>
      <span class="ft-v mono">window ${esc(t.windowDays)}d</span><span class="ft-sep">·</span>
      <span class="ft-verdict">${exceeds ? "gate exceeds the window" : "gate falls within the window"}</span>
    </div>`;
}
const SEVLAB: Record<string, string> = { p0: "Stop", p1: "Critical", p2: "Advisory" };
function findingRow(f: V4Finding, sev: string, open: boolean): string {
  return `
    <article class="find" data-sev="${sev}"${open ? ' data-open="1"' : ""}>
      <button class="find-top" type="button" aria-expanded="${open ? "true" : "false"}">
        <span class="find-num" aria-hidden="true"></span>
        <span class="find-dot" aria-hidden="true"></span>
        <span class="find-sevtag" aria-hidden="true"><b>${sev.toUpperCase()}</b><i>${SEVLAB[sev] || ""}</i></span>
        <span class="find-req">${esc(f.req)}</span>
        <span class="find-side"><span class="find-cite mono">${esc(f.cite)}</span>
          <span class="find-chev" aria-hidden="true">${I.chev}</span></span>
      </button>
      <div class="find-body">
        ${f.excerpt ? `<blockquote class="find-excerpt">${esc(f.excerpt)}<cite class="src">Found in — ${esc(f.cite)}</cite></blockquote>` : ""}
        ${temporal(f.temporal)}
        ${f.curability ? `<div class="find-cure"><span class="fc-k">Clears when</span><span class="fc-v">${esc(f.curability)}</span></div>` : ""}
      </div>
    </article>`;
}
function findingGroup(list: V4Finding[] | undefined, sev: string, title: string, complete: boolean, defaultOpen: boolean): string {
  if (!list || !list.length) {
    if (!complete) return ""; // INCOMPLETE → never claim none
    return `<div class="fgroup fg-${sev}"><div class="fg-h"><span class="fg-mk"></span>${title}<span class="fg-cnt mono">0</span></div>
        <p class="fg-none">None identified in the documents read.</p></div>`;
  }
  const rows = list.map((f) => findingRow(f, sev, defaultOpen || f.driver === true)).join("");
  return `<div class="fgroup fg-${sev}"><div class="fg-h"><span class="fg-mk"></span>${title}<span class="fg-cnt mono">${list.length}</span></div>${rows}</div>`;
}
function findings(fd: V4Findings, complete: boolean): string {
  const groups = [
    findingGroup(fd.p0, "p0", "Show-stoppers", complete, true),
    findingGroup(fd.p1, "p1", "Gates", complete, false),
    findingGroup(fd.p2, "p2", "Advisories", complete, false),
  ].filter(Boolean).join("");
  const sat = (fd.satisfied && fd.satisfied.length)
    ? `<div class="fgroup fg-ok"><div class="fg-h"><span class="fg-mk"></span>Satisfied · grounded facts<span class="fg-cnt mono">${fd.satisfied.length}</span></div>
         ${fd.satisfied.map((f) => `<div class="sat-row"><span class="sat-dot"></span><span class="sat-req">${esc(f.req)}</span><span class="sat-cite mono">${esc(f.cite)}</span></div>`).join("")}</div>`
    : "";
  return `
    <section class="sec" id="findings" data-sec>
      <div class="sec-head"><span class="sec-n mono">02</span><h2>Findings</h2>
        <span class="sec-note">Every finding carries its citation and the verbatim text it rests on.</span></div>
      ${groups}${sat}
    </section>`;
}

function optional(section: { grounded: boolean } | undefined, coverageState: string, id: string, n: string, title: string, absenceLine: string, renderFn: () => string): { html: string; present: boolean } {
  if (section && section.grounded === false) {
    if (coverageState === "COMPLETE") {
      return { html: `<section class="sec" id="${id}" data-sec>
          <div class="sec-head"><span class="sec-n mono">${n}</span><h2>${title}</h2></div>
          <p class="sec-absence">${esc(absenceLine)}</p></section>`, present: true };
    }
    return { html: "", present: false }; // INCOMPLETE → omit
  }
  return { html: renderFn(), present: true };
}

function submissionL(s: V4SubmissionL): string {
  const rows = s.rows.map((r) => `
      <tr><td class="sl-vol mono">${esc(r.vol)}</td>
      <td class="sl-req">${esc(r.req)}<span class="sl-cond">${esc(r.condition)}</span></td>
      <td class="sl-cite mono">${esc(r.cite)}</td></tr>`).join("");
  return `<section class="sec" id="sec-l" data-sec>
      <div class="sec-head"><span class="sec-n mono">03</span><h2>Section L · Submission</h2></div>
      ${s.lead ? `<p class="sec-lead">${esc(s.lead)}</p>` : ""}
      <table class="grid-table sl-table"><thead><tr><th>Volume</th><th>What must be submitted</th><th>Cite</th></tr></thead>
      <tbody>${rows}</tbody></table></section>`;
}
function evalM(e: V4EvalM): string {
  const rows = e.factors.map((f) => `
      <tr><td class="em-name">${esc(f.name)}</td>
      <td class="em-basis">${esc(f.basis)}</td>
      <td class="em-cite mono">${esc(f.cite)}</td></tr>`).join("");
  return `<section class="sec" id="sec-m" data-sec>
      <div class="sec-head"><span class="sec-n mono">04</span><h2>Section M · Evaluation</h2></div>
      <p class="sec-lead">${esc(e.basis)}</p>
      <table class="grid-table em-table"><thead><tr><th>Factor (descending importance)</th><th>How it is evaluated</th><th>Cite</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="sec-foot">No weights, no total, no score — the Government did not publish one, and neither do we.</p></section>`;
}
function clins(c: V4Clins): string {
  const rows = c.rows.map((r) => `
      <tr><td class="cl-n mono">${esc(r.clin)}</td><td class="cl-t">${esc(r.title)}</td>
      <td class="cl-type mono">${esc(r.type)}</td><td class="cl-qty mono">${esc(r.qtyUnit)}</td>
      <td class="cl-per">${esc(r.period)}</td></tr>`).join("");
  return `<section class="sec" id="clins" data-sec>
      <div class="sec-head"><span class="sec-n mono">05</span><h2>CLIN structure</h2></div>
      ${c.lead ? `<p class="sec-lead">${esc(c.lead)}</p>` : ""}
      <table class="grid-table cl-table"><thead><tr><th>CLIN</th><th>Title</th><th>Type</th><th>Qty / unit</th><th>Period</th></tr></thead>
      <tbody>${rows}</tbody></table></section>`;
}
function dates(list: V4Date[]): string {
  const items = list.map((d) => `
      <div class="kd-item ${d.kind === "gate" ? "gate" : ""}">
        <div class="kd-tick" aria-hidden="true"></div>
        <div class="kd-label">${esc(d.label)}</div>
        <div class="kd-value mono">${esc(d.value)}</div>
      </div>`).join("");
  return `<section class="sec" id="dates" data-sec>
      <div class="sec-head"><span class="sec-n mono">06</span><h2>Key dates</h2></div>
      <div class="kd-track">${items}</div></section>`;
}
function provenance(p: V4Provenance, cov: { state: string; solicitation?: string }): string {
  const man = p.manifest.map((m) =>
    `<li class="pv-file"><span class="pv-read pv-${m.read}">${m.read === "full" ? "Read in full" : m.read === "indexed" ? "Indexed" : "Not read"}</span><span class="pv-name mono">${esc(m.name)}</span></li>`).join("");
  return `<section class="sec pv-sec" id="provenance" data-sec>
      <div class="sec-head"><span class="sec-n mono">07</span><h2>Provenance</h2>
        <span class="sec-note">The defensibility layer — what was read, and when.</span></div>
      <div class="pv-grid">
        <div class="pv-meta">
          <div class="pv-mrow"><span class="pv-k">Solicitation</span><span class="pv-v mono">${esc(cov.solicitation || "")}</span></div>
          <div class="pv-mrow"><span class="pv-k">Audited</span><span class="pv-v mono">${esc(p.auditDate)}</span></div>
          <div class="pv-mrow"><span class="pv-k">Coverage</span><span class="pv-v">${esc(cov.state)}</span></div>
          <div class="pv-mrow"><span class="pv-k">Engine</span><span class="pv-v">${esc(p.engine)}</span></div>
        </div>
        <ul class="pv-manifest">${man}</ul>
      </div></section>`;
}

export function renderRichWeb(d: V4Data): { html: string; sections: V4Section[] } {
  const complete = d.coverage.state === "COMPLETE";
  const parts: string[] = [];
  const sections: V4Section[] = [];
  const add = (html: string, id?: string, label?: string, tone?: Tone) => { parts.push(html); if (id && label) sections.push({ id, label, tone }); };

  add(masthead(d.masthead));
  add(verdict(d.verdict, { auditId: (d.shell && d.shell.auditId) || d.masthead.solicitation, auditDate: d.provenance && d.provenance.auditDate, coverage: d.coverage }), "verdict", "Verdict", d.verdict.tone);
  add(coverage(d.coverage), "coverage", "Coverage");
  add(findings(d.findings, complete), "findings", "Findings");

  const L = optional(d.submissionL, d.coverage.state, "sec-l", "03", "Section L · Submission",
    "No Section L submission structure applies — this instrument does not impose separate proposal volumes.", () => submissionL(d.submissionL as V4SubmissionL));
  if (L.present) { parts.push(L.html); sections.push({ id: "sec-l", label: "§L Submission" }); }

  const M = optional(d.evalM, d.coverage.state, "sec-m", "04", "Section M · Evaluation",
    "No Section M evaluation structure applies — this instrument carries no source-selection factors.", () => evalM(d.evalM as V4EvalM));
  if (M.present) { parts.push(M.html); sections.push({ id: "sec-m", label: "§M Evaluation" }); }

  const C = optional(d.clins, d.coverage.state, "clins", "05", "CLIN structure",
    "No CLIN structure was published with this instrument.", () => clins(d.clins as V4Clins));
  if (C.present) { parts.push(C.html); sections.push({ id: "clins", label: "CLIN structure" }); }

  add(dates(d.dates), "dates", "Key dates");
  add(provenance(d.provenance, { state: d.coverage.state, solicitation: d.masthead.solicitation }), "provenance", "Provenance");

  return { html: parts.join("\n"), sections };
}
