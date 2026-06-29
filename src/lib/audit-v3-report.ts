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

import { disposeFinding } from "./audit-decide";
import type { Decision } from "./audit-decide";

/** Compact, persistable finding — the unit the report renders. `disposition` is
 *  the derived bucket (show-stopper / gate / met) so the renderer needs no
 *  engine logic. */
export interface FindingLite {
  requirement: string;
  citation: string;
  excerpt?: string;
  disposition: "disqualifying" | "gate_to_clear" | "met" | "dropped";
}

/** The agentic report payload persisted to compliance_json.v3 and consumed by
 *  the report + PDF routes. Self-contained: everything the renderer needs. */
export interface V3ReportPayload {
  verdict: string;
  eligible: boolean | null;
  reason: string;
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
  rawFindings: Array<{ requirement: string; citation: string; excerpt?: string; kind?: string; controllability?: string }>,
  generatedAt?: string,
): V3ReportPayload {
  const lite = (f: { requirement: string; citation: string; excerpt?: string; kind?: string; controllability?: string }): FindingLite => ({
    requirement: f.requirement,
    citation: f.citation,
    excerpt: f.excerpt,
    // disposeFinding only needs kind + controllability.
    disposition: disposeFinding({ kind: f.kind, controllability: f.controllability } as never),
  });
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

interface VerdictStyle { label: string; sub: string; bg: string; fg: string; }
function verdictStyle(v: string): VerdictStyle {
  switch (v) {
    case "BID":                return { label: "BID",                sub: "Eligible — pursue this opportunity",                        bg: "#0f5132", fg: "#d1e7dd" };
    case "BID_WITH_CAUTION":   return { label: "BID WITH CAUTION",   sub: "Eligible — pursue, but clear the flagged gates first",       bg: "#664d03", fg: "#fff3cd" };
    case "NO_BID":             return { label: "NO BID",             sub: "A non-curable bar makes this unwinnable for any bidder",     bg: "#842029", fg: "#f8d7da" };
    case "INELIGIBLE":         return { label: "INELIGIBLE",         sub: "Your firm provably fails a structural eligibility bar",      bg: "#842029", fg: "#f8d7da" };
    case "NEEDS_HUMAN_REVIEW": return { label: "NEEDS HUMAN REVIEW", sub: "Findings conflict — a human must adjudicate before bidding", bg: "#41464b", fg: "#e2e3e5" };
    case "INCOMPLETE":         return { label: "INCOMPLETE — HONEST FAIL", sub: "Not all binding content could be read & grounded — no verdict, no charge", bg: "#41464b", fg: "#e2e3e5" };
    default:                   return { label: escapeHtml(v),        sub: "",                                                          bg: "#41464b", fg: "#e2e3e5" };
  }
}

function findingRow(f: FindingLite): string {
  const excerpt = f.excerpt && f.excerpt.trim()
    ? `<div class="ex">“${escapeHtml(f.excerpt.trim().slice(0, 420))}”</div>` : "";
  return `<div class="f">
    <div class="f-req">${escapeHtml(f.requirement)}</div>
    <div class="f-cite">${escapeHtml(f.citation)}</div>
    ${excerpt}
  </div>`;
}

function group(title: string, note: string, rows: FindingLite[], cls = ""): string {
  if (!rows.length) return "";
  return `<section class="grp ${cls}"><h2>${escapeHtml(title)} <span class="count">${rows.length}</span></h2>
    <p class="grp-note">${escapeHtml(note)}</p>${rows.map(findingRow).join("\n")}</section>`;
}

/** Render the full board-room-grade agentic customer report (web + PDF). */
export function renderV3Report(payload: V3ReportPayload, meta: V3ReportMeta): string {
  const vs = verdictStyle(payload.verdict);
  const gates = payload.findings.filter((f) => f.disposition === "gate_to_clear");
  const met = payload.findings.filter((f) => f.disposition === "met");
  const inlineStoppers = payload.findings.filter((f) => f.disposition === "disqualifying");
  // showStoppers is the verdict-driver set; fall back to any disqualifying findings.
  const stoppers = payload.showStoppers.length ? payload.showStoppers : inlineStoppers;

  // Document-manifest reconciliation banner — the customer-facing fail-safe for
  // "all files fetched." A COMPLETE package is confirmed in green; a PARTIAL one is
  // flagged loudly (named missing files) directly under the verdict, never silent.
  const d = payload.documents;
  let docsBanner = "";
  if (d) {
    // Gate on `=== false` (not `!d.reconciled`): a row persisted before `reconciled`
    // existed has it undefined — that must fall through to the complete/partial
    // branches, NOT show a false "not confirmed" warning on an already-complete audit.
    if (d.reconciled === false) {
      // Manifest-assembly failed → single-document fallback. We cannot claim the full
      // set was read, so we say so loudly rather than render a silent "complete."
      docsBanner = `<div class="docs warn"><b>⚠ Document set not confirmed.</b> We read ${d.read} document${d.read === 1 ? "" : "s"}, but could not reconcile against SAM's posted manifest — the agency may have posted more. Verify the complete package on SAM.gov before bidding.</div>`;
    } else if (d.complete) {
      docsBanner = `<div class="docs ok">✓ Retrieved and read every document the agency posted to SAM.gov (${d.posted} file${d.posted === 1 ? "" : "s"}).</div>`;
    } else {
      docsBanner = `<div class="docs warn"><b>⚠ Partial package — read ${d.read} of ${d.posted} document${d.posted === 1 ? "" : "s"} the agency posted to SAM.gov.</b>${d.missing.length ? ` Could not retrieve: ${d.missing.map((m) => escapeHtml(m.name)).join("; ")}.` : ""}${d.note ? ` ${escapeHtml(d.note)}` : ""} This verdict reflects only the documents we could read — add the missing files for a complete audit.</div>`;
    }
  }

  // Core-section presence disclosure — a core UCF section ABSENT from the package
  // was not analyzed and the verdict does not reflect it. Surface it as loudly as
  // the document banner so it can never be silently invisible (panel blocker).
  const coreMissing = payload.coverage.coreMissing ?? [];
  const CORE_LABEL: Record<string, string> = { C: "§C Statement of Work / specifications", L: "§L Instructions to offerors", M: "§M Evaluation factors" };
  const coreBanner = coreMissing.length
    ? `<div class="docs warn"><b>⚠ Core section${coreMissing.length === 1 ? "" : "s"} not found in the posted package:</b> ${coreMissing.map((k) => escapeHtml(CORE_LABEL[k] || `§${k}`)).join("; ")}. ${coreMissing.length === 1 ? "It was" : "They were"} not analyzed — this verdict does not reflect ${coreMissing.length === 1 ? "it" : "them"}. Confirm whether the agency posted ${coreMissing.length === 1 ? "this section" : "these sections"} on SAM.gov.</div>`
    : "";

  const coveredSet = new Set(payload.coverage.covered);
  const coverageChips = payload.coverage.required.map((s) => {
    const ok = coveredSet.has(s);
    return `<span class="chip ${ok ? "ok" : "miss"}">§${escapeHtml(s)} ${ok ? "✓" : "✕"}</span>`;
  }).join(" ");
  // "Complete" requires BOTH: every present binding section grounded AND no core
  // UCF section absent from the package (a missing §M is not "complete" coverage).
  const coverageComplete = payload.coverage.missing.length === 0 && coreMissing.length === 0;

  const metaRows = [
    ["Solicitation", meta.solicitationNumber],
    ["Title", meta.title],
    ["Agency", meta.agency],
    ["NAICS", meta.naicsCode],
    ["Set-aside", meta.setAside],
    ["Response deadline", meta.responseDeadline],
  ].filter(([, v]) => v != null && String(v).trim())
   .map(([k, v]) => `<div class="m"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FARaudit · ${escapeHtml(meta.solicitationNumber ?? "Agentic Verdict")}</title>
<style>
  :root { --ink:#111418; --muted:#5b6470; --line:#e3e7ec; --bg:#f6f8fa; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--bg); }
  .wrap { max-width:860px; margin:0 auto; padding:32px 24px 80px; }
  .brand { font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); font-weight:600; }
  .verdict { margin:14px 0 22px; border-radius:14px; padding:26px 28px; background:${vs.bg}; color:${vs.fg}; }
  .verdict .v { font-size:34px; font-weight:800; letter-spacing:.01em; }
  .verdict .s { margin-top:6px; font-size:15px; opacity:.92; }
  .reason { background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin-bottom:18px; }
  .reason b { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:4px; }
  dl.meta { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin-bottom:18px; }
  dl.meta .m { display:flex; flex-direction:column; }
  dl.meta dt { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
  dl.meta dd { margin:2px 0 0; font-weight:600; }
  .docs { border-radius:12px; padding:13px 16px; margin-bottom:16px; font-size:13.5px; line-height:1.5; }
  .docs.ok { background:#d1e7dd; color:#0f5132; border:1px solid #b6dfc7; }
  .docs.warn { background:#f8d7da; color:#842029; border:1px solid #f1c2c7; }
  .docs b { font-weight:800; }
  .cov { background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin-bottom:24px; }
  .cov h3 { margin:0 0 4px; font-size:14px; }
  .cov .state { font-size:13px; font-weight:700; }
  .cov .state.ok { color:#0f5132; } .cov .state.no { color:#842029; }
  .chip { display:inline-block; font-size:12px; font-weight:600; border-radius:20px; padding:3px 10px; margin:4px 2px 0; }
  .chip.ok { background:#d1e7dd; color:#0f5132; } .chip.miss { background:#f8d7da; color:#842029; }
  section.grp { margin:22px 0; }
  section.grp h2 { font-size:17px; margin:0 0 2px; display:flex; align-items:center; gap:8px; }
  section.grp.ss h2 { color:#842029; }
  .count { font-size:12px; font-weight:700; background:#eceff3; color:var(--muted); border-radius:20px; padding:1px 9px; }
  .grp-note { margin:0 0 12px; color:var(--muted); font-size:13px; }
  .f { background:#fff; border:1px solid var(--line); border-left:3px solid #c9d2db; border-radius:8px; padding:12px 14px; margin-bottom:8px; }
  section.grp.ss .f { border-left-color:#842029; }
  .f-req { font-weight:600; }
  .f-cite { font-size:12px; color:var(--muted); margin-top:3px; }
  .ex { margin-top:8px; font-size:13px; color:#384049; background:var(--bg); border-radius:6px; padding:8px 10px; font-style:italic; }
  footer { margin-top:40px; padding-top:16px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
  .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
  .topbar a { font-size:13px; font-weight:600; color:var(--muted); text-decoration:none; }
  .topbar a:hover { color:var(--ink); }
  @media print { .topbar a { display:none; } }
</style></head><body><div class="wrap">
  <div class="topbar"><div class="brand">FARaudit · Agentic Verification Engine</div><a href="/audit">← Back to audits</a></div>
  <div class="verdict"><div class="v">${escapeHtml(vs.label)}</div><div class="s">${escapeHtml(vs.sub)}</div></div>
  ${docsBanner}
  ${coreBanner}
  ${metaRows ? `<dl class="meta">${metaRows}</dl>` : ""}
  <div class="reason"><b>Verdict basis</b>${escapeHtml(payload.reason)}</div>
  <div class="cov"><h3>Coverage <span class="state ${coverageComplete ? "ok" : "no"}">${coverageComplete ? "COMPLETE" : "INCOMPLETE"}</span></h3>
    <div>${coverageChips || '<span class="chip miss">no binding sections detected</span>'}</div>
    ${payload.coverage.missing.length ? `<p class="grp-note" style="margin-top:8px">Unread / ungrounded: ${payload.coverage.missing.map((s) => "§" + escapeHtml(s)).join(", ")} — the engine refuses a confident verdict over content it did not ground.</p>` : ""}
  </div>
  ${group("⛔ Show-stopper bars", "These are the verdict drivers — the firm provably fails, or no bidder can comply.", stoppers, "ss")}
  ${group("Gates to clear", "Bidder-controllable requirements — the work of putting in a compliant bid.", gates)}
  ${group("Already satisfied", "Requirements the package shows are met.", met)}
  <footer>Verdict derived deterministically by FARaudit's agentic engine (graduated · 6/6 gold). Facts (NAICS · set-aside · deadline) are authoritative from SAM.gov; the verdict is a gate, not advice.${payload.generatedAt ? " Generated " + escapeHtml(payload.generatedAt) + "." : ""}</footer>
</div></body></html>`;
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
  });
}
