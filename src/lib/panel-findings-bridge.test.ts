// $0 REGRESSION for the PANEL→FINDINGS BRIDGE (card #523, P2a) — the moat-critical seam.
// Run: npx tsx src/lib/panel-findings-bridge.test.ts
//
// Doctrine (recon #523, permanent): the panel is a FINDINGS PRODUCER. Only VERIFIED claims cross into
// VerdictInputs.findings (2b); deriveVerdict stays the SOLE authority. A VERIFIED *unmet* hard gate fails
// CLOSED to human review (bidder_cannot_move + curableInWindow UNDEFINED) — never a blind INELIGIBLE/NO_BID.
// A residual risk is advisory (bidder_controls) — never a bar. UNVERIFIABLE/REFUTED/unmapped facts are dropped.
import { panelFindingsToTyped, foldPanelReason, type PanelStructuredInput, type VerifierState } from "./panel-findings-bridge";
import type { PanelistOutput } from "./agentic-panel-runner";
import { deriveVerdict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;

const lens = (over: Partial<PanelistOutput> = {}): PanelistOutput => ({
  lens: "ex_ko", verdict: "BID", fit_score: 70, confidence: "high",
  named_hard_gates: [], risks: [], contrarian_finding: "", ...over,
});
const P = (key: string, name: string, output: PanelistOutput | null) => ({ key, name, output });
const refMap = (entries: Array<[string, VerifierState]>): Map<string, { state: VerifierState; evidence: string }> =>
  new Map(entries.map(([r, s]) => [r, { state: s, evidence: "" }]));

// ── 1. VERIFIED unmet hard gate → fail-closed to NHR ────────────────────────────────
{
  const panelists = [P("ex_ko", "Ex-KO", lens({
    named_hard_gates: [{ gate: "SDVOSB set-aside — firm must hold SDVOSB status", met: false, citation: "52.219-27", excerpt: "This acquisition is a SDVOSB set-aside." }],
  }))];
  const stateByRef = refMap([["ex_ko:G1", "VERIFIED"]]);
  const fs = panelFindingsToTyped({ panelists, stateByRef });
  assert(fs.length === 1, "one VERIFIED gate → one finding");
  assert(fs[0].controllability === "bidder_cannot_move", "unmet gate → bidder_cannot_move");
  assert(fs[0].curableInWindow === undefined, "unmet gate → curableInWindow UNDEFINED (fail-closed signal)");
  assert(fs[0].grounded === true && fs[0].kind === "eligibility_bar", "grounded eligibility_bar");
  const d = deriveVerdict({ ...base, findings: fs });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `unmet VERIFIED gate routes deriveVerdict → NHR (got ${d.verdict})`);
}

// ── 2. VERIFIED MET hard gate → already_satisfied, non-blocking ──────────────────────
{
  const panelists = [P("ex_ko", "Ex-KO", lens({
    named_hard_gates: [{ gate: "SAM registration active", met: true, citation: "52.204-7", excerpt: "Offeror shall be registered in SAM." }],
  }))];
  const fs = panelFindingsToTyped({ panelists, stateByRef: refMap([["ex_ko:G1", "VERIFIED"]]) });
  assert(fs[0].controllability === "already_satisfied", "met gate → already_satisfied");
  const d = deriveVerdict({ ...base, findings: fs });
  assert(d.verdict !== "NEEDS_HUMAN_REVIEW" && d.verdict !== "NO_BID" && d.verdict !== "INELIGIBLE",
    `met VERIFIED gate does NOT bar (got ${d.verdict})`);
}

// ── 3. VERIFIED risk → advisory bidder_controls, never a bar ─────────────────────────
{
  const panelists = [P("pricing_analyst", "Pricing", lens({
    risks: [{ risk: "Wage determination not attached", severity: "P1", citation: "SCA", excerpt: "A wage determination applies to this effort." }],
  }))];
  const fs = panelFindingsToTyped({ panelists, stateByRef: refMap([["pricing_analyst:R1", "VERIFIED"]]) });
  assert(fs.length === 1 && fs[0].controllability === "bidder_controls" && fs[0].kind === "other", "risk → bidder_controls/other");
  assert(fs[0].severity === "P1", "risk severity carried");
  const d = deriveVerdict({ ...base, findings: fs });
  assert(d.verdict !== "NO_BID" && d.verdict !== "INELIGIBLE" && d.verdict !== "NEEDS_HUMAN_REVIEW",
    `a VERIFIED risk never bars (got ${d.verdict})`);
}

// ── 4. UNVERIFIABLE / REFUTED / unmapped never become facts (2b) ─────────────────────
{
  const panelists = [P("ex_ko", "Ex-KO", lens({
    named_hard_gates: [
      { gate: "unverifiable gate", met: false, citation: "x", excerpt: "e1" }, // G1 UNVERIFIABLE
      { gate: "refuted gate", met: false, citation: "y", excerpt: "e2" },      // G2 REFUTED
      { gate: "unmapped gate", met: false, citation: "z", excerpt: "e3" },     // G3 absent from map
    ],
  }))];
  const stateByRef = refMap([["ex_ko:G1", "UNVERIFIABLE"], ["ex_ko:G2", "REFUTED"]]);
  const fs = panelFindingsToTyped({ panelists, stateByRef });
  assert(fs.length === 0, "UNVERIFIABLE + REFUTED + unmapped → zero facts (2b)");
}

// ── 5. null lens output + empty-excerpt VERIFIED gate are skipped ─────────────────────
{
  const panelists = [
    P("ex_ko", "Ex-KO", null),
    P("pricing_analyst", "Pricing", lens({
      named_hard_gates: [{ gate: "no-excerpt gate", met: false, citation: "c", excerpt: "   " }],
    })),
  ];
  const fs = panelFindingsToTyped({ panelists, stateByRef: refMap([["pricing_analyst:G1", "VERIFIED"]]) });
  assert(fs.length === 0, "null lens + blank-excerpt VERIFIED gate → skipped");
}

// ── 6. ref indexing (G/R, 1-based, per-lens) is exact ────────────────────────────────
{
  const panelists = [P("cap", "Capture", lens({
    named_hard_gates: [
      { gate: "g1", met: true, citation: "a", excerpt: "x1" },
      { gate: "g2", met: true, citation: "b", excerpt: "x2" },
    ],
    risks: [{ risk: "r1", severity: "P2", citation: "c", excerpt: "y1" }],
  }))];
  // only G2 + R1 VERIFIED → G1 dropped, proving 1-based per-slot mapping
  const fs = panelFindingsToTyped({ panelists, stateByRef: refMap([["cap:G2", "VERIFIED"], ["cap:R1", "VERIFIED"]]) });
  const ids = fs.map((f: TypedFinding) => f.id).sort();
  assert(fs.length === 2 && ids[0] === "panel:cap:G2" && ids[1] === "panel:cap:R1", `ref indexing exact (got ${ids.join(",")})`);
}

// ── 7. foldPanelReason (P2d) — derived reason authoritative, dedup, never overrides ──
{
  const derived = "No non-curable bars found; the firm can compete.";
  // fresh narrative → appended after the derived reason, under the Expert panel: clause
  const folded = foldPanelReason(derived, "The wage determination should be confirmed before pricing.");
  assert(folded.startsWith(derived), "derived reason stays FIRST (authoritative)");
  assert(folded.includes("Expert panel:") && folded.includes("wage determination"), "fresh panel narrative appended");
  // duplicate narrative → nothing appended (reason-dedup)
  const dup = foldPanelReason(derived, "No non-curable bars found.");
  assert(dup === derived, "duplicate panel narrative → derived reason unchanged (dedup)");
  // empty panel rationale → derived unchanged
  assert(foldPanelReason(derived, "") === derived, "empty panel rationale → derived unchanged");
  // bounded — a runaway rationale is capped
  const huge = foldPanelReason("Base.", "x".repeat(50) + ". " + "y ".repeat(400) + ".");
  assert(huge.length < 500, "folded reason is bounded (maxAdd cap)");
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
