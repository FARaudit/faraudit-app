// PHASE 3 UNIT 3 — CHECKBOX-STATE FIDELITY GATE ($0 suite, Brain card #551 design C, flag AUDIT_CHECKBOX_STATE_FIDELITY).
// Driver: seq-2 dccce793 rendered "☒ 52.219-14 (checked in Section I)" while source is "☐ 52.219-14" — a fabricated
// checkbox state. Design C (non-destructive): correct the ☒/checked framing to the true ☐, re-attribute to a
// VERIFIED-PRESENT basis, KEEP the obligation at severity. Fail-toward-keep; box-state is NOT a suppression authority.
// FOUR-DIRECTION probe set (Brain #551) + the Unit-3/Unit-4 boundary statement.
// Run: npx tsx src/lib/checkbox-state-fidelity.test.ts
import { applyCheckboxStateFidelity, parseCheckboxMatrix } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";
import { isEnvOn } from "./env-flags";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_CHECKBOX_STATE_FIDELITY;
  if (on) process.env.AUDIT_CHECKBOX_STATE_FIDELITY = "true"; else delete process.env.AUDIT_CHECKBOX_STATE_FIDELITY;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_CHECKBOX_STATE_FIDELITY; else process.env.AUDIT_CHECKBOX_STATE_FIDELITY = prev; }
};
const base = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: "x", citation: "x", excerpt: "x", kind: "other", controllability: "bidder_controls", grounded: true, lens: "test", ...o,
});
const isCorrected = (f: TypedFinding) => f.checkboxCorrected === true && /checkbox-state correction/.test(f.citation) && /UNCHECKED \(☐\)/.test(f.citation);

// A faithful slice of the real dccce793 Section-I matrix + the Q&A that affirms 52.219-14.
const SRC = [
  "6. Is subcontracting permitted? What percentage must the prime self-perform under FAR",
  "52.219-14 for this Total Small Business Set-Aside service contract?",
  "Yes, Services (except construction), it will not pay more than 50 percent of the amount paid by the Government",
  "for contract performance to subcontractors that are not similarly situated entities.",
  "SECTION I — CONTRACT CLAUSES",
  "☐ 52.219-8 Utilization of Small Business Concerns (Nov 2025)",
  "☐ 52.219-14 Limitations on Subcontracting (Nov 2025)",
  "☒ 52.219-33 Nonmanufacturer Rule (Nov 2025)",
  "☒ 52.222-3 Convict Labor (June 2003)",
].join("\n");

console.log("── parseCheckboxMatrix — authoritative ☐/☒ map from the source ──");
const M = parseCheckboxMatrix(SRC);
assert(M.get("52.219-14") === "unchecked", "52.219-14 → unchecked (L 'M☐ 52.219-14')");
assert(M.get("52.219-33") === "checked", "52.219-33 → checked (☒)");
assert(M.get("52.219-8") === "unchecked", "52.219-8 → unchecked (☐)");
assert(M.get("52.222-3") === "checked", "52.222-3 → checked (☒)");
assert(!M.has("52.999-99"), "a clause absent from the matrix is not in the map");

// The real #10 shape: contracts_attorney asserts the 52.219-14 limit, citation frames it as clause-list-incorporated.
const f10 = (): TypedFinding => base({
  requirement: "Limitations on Subcontracting (FAR 52.219-14 language): Prime may not pay more than 50% to non-similarly-situated subcontractors.",
  citation: "Solicitation Q&A / clause list referencing 52.219-14", kind: "eligibility_bar", controllability: "bidder_controls", severity: "P1",
  excerpt: "it will not pay more than 50 percent of the amount paid by the Government", lens: "contracts_attorney",
});

console.log("\n── P1 — flag OFF ⇒ byte-identical (fabricated ☒ framing survives) ──");
withFlag(false, () => {
  const inp = [f10()];
  const out = applyCheckboxStateFidelity(inp, SRC, { enabled: isEnvOn(process.env.AUDIT_CHECKBOX_STATE_FIDELITY) });
  assert(out === inp && out[0] === inp[0], "OFF: same refs — the un-fixed fabricated 'clause list' framing stands");
});

console.log("\n── DIRECTION 1 — ☐-unchecked clause framed as checked ⇒ CORRECT provenance, KEEP obligation at severity ──");
withFlag(true, () => {
  const [f] = applyCheckboxStateFidelity([f10()], SRC, { enabled: true });
  assert(isCorrected(f), "corrected: citation APPENDS the true ☐/UNCHECKED note (original text preserved for downstream guards — R2 #1)");
  assert(/grounded in the solicitation text/.test(f.citation) && !/affirms/.test(f.citation), "re-attributed to the finding's OWN grounded excerpt (verified-present anchor) — never claims the body 'affirms' (R1 #1)");
  assert(f.kind === "eligibility_bar" && f.controllability === "bidder_controls" && f.severity === "P1", "obligation KEPT at severity/typing (P1 eligibility_bar bidder_controls) — box-state is NOT a suppression authority");
  assert(f.excerpt === "it will not pay more than 50 percent of the amount paid by the Government", "the grounded obligation excerpt is preserved");
});

console.log("\n── DIRECTION 2 — a genuinely ☒-checked clause is NOT corrected ──");
withFlag(true, () => {
  const checked = base({ requirement: "Nonmanufacturer Rule 52.219-33 applies.", citation: "Section I clause list, 52.219-33 checked", kind: "clause_flowdown", controllability: "bidder_controls", severity: "P2" });
  const inp = [checked];
  const out = applyCheckboxStateFidelity(inp, SRC, { enabled: true });
  assert(out === inp && out[0] === inp[0], "☒ 52.219-33: NOT corrected — the box is genuinely checked (no false ☐ claim)");
});

console.log("\n── DIRECTION 3 — clause ABSENT from the matrix (only in prose/Q&A) ⇒ NOT corrected (never fabricate a ☐) ──");
withFlag(true, () => {
  const prose = base({ requirement: "FAR 52.222-41 Service Contract Act obligations apply per Section I clause list.", citation: "clause list referencing 52.222-41", kind: "clause_flowdown", controllability: "bidder_controls", severity: "P1" });
  const inp = [prose];
  const out = applyCheckboxStateFidelity(inp, SRC, { enabled: true });
  assert(out === inp && out[0] === inp[0], "52.222-41 (absent from the matrix): LEFT INTACT — the gate never asserts ☐ for a clause it can't find in the matrix (fail-toward-keep)");
});

console.log("\n── DIRECTION 4 — AMBIGUOUS box state (clause appears BOTH ☐ and ☒) ⇒ NOT corrected ──");
withFlag(true, () => {
  const ambigSrc = SRC + "\n☒ 52.219-14 Limitations on Subcontracting (alt matrix)";
  const M2 = parseCheckboxMatrix(ambigSrc);
  assert(M2.get("52.219-14") === "checked", "both-states clause resolves to checked (☒ present ⇒ never 'unchecked') — ambiguity fails toward keep");
  const inp = [f10()];
  const out = applyCheckboxStateFidelity(inp, ambigSrc, { enabled: true });
  assert(out === inp && out[0] === inp[0], "ambiguous ☐/☒: finding LEFT INTACT — no correction on an unresolvable box state");
});

console.log("\n── UNIT-3/UNIT-4 BOUNDARY (Brain #551) — a fabricated SECTION/structure is Unit 4's domain, NOT touched here ──");
withFlag(true, () => {
  // A finding invents a section that does not exist ("Section B") for a clause absent from any real matrix. Unit 3 acts
  // ONLY on a clause with a legible ☐ in a REAL Section-I matrix — a fabricated STRUCTURE is a different defect class.
  const fabricatedStructure = base({ requirement: "52.204-7 SAM registration required per the clause list.", citation: "checked in Section B (invented heading)", kind: "eligibility_bar", controllability: "bidder_controls", severity: "P0" });
  const inp = [fabricatedStructure];
  const out = applyCheckboxStateFidelity(inp, SRC, { enabled: true });
  assert(out === inp && out[0] === inp[0], "BOUNDARY: 52.204-7 is not in the ☐-matrix → Unit 3 does NOT fire; a fabricated 'Section B' structural assertion is Unit 4's fabricated-structural-assertion guard, not this gate");
});

console.log("\n── P-extra — no over-fire: a finding NOT framing its ☐ clause as checked is left alone (only fabricated framing is corrected) ──");
withFlag(true, () => {
  const honest = base({ requirement: "52.219-14 may apply; confirm.", citation: "solicitation body text 52.219-14", kind: "other", controllability: "bidder_controls", severity: "P2" });
  const inp = [honest];
  const out = applyCheckboxStateFidelity(inp, SRC, { enabled: true });
  assert(out === inp && out[0] === inp[0], "a ☐-clause finding that does NOT frame it as checked/incorporated is left byte-identical (nothing fabricated to correct)");
});

// ══ GAUNTLET R1 REMEDIATION PROBES ══
console.log("\n── P-R1#1 — basis NEVER claims the body 'affirms' (contradicting body must not become a false 'affirms') ──");
withFlag(true, () => {
  const contra = SRC + "\nNote: 52.219-14 does NOT apply to this acquisition.";
  const [f] = applyCheckboxStateFidelity([f10()], contra, { enabled: true });
  assert(isCorrected(f) && /grounded in the solicitation text/.test(f.citation) && !/affirms/.test(f.citation),
    "basis anchors to the finding's grounded excerpt, never asserts the body 'affirms' — safe even when the body contradicts (R1 #1 closed)");
});

console.log("\n── P-R1#2 — asymmetric parse: a table-pipe-prefixed ☒ line is caught ⇒ clause resolves CHECKED (no fabricated ☐) ──");
withFlag(true, () => {
  // A genuinely-checked clause whose ☒ line is prefixed by a table border, PLUS a stray ☐ row for the same clause.
  const tableSrc = "| ☒ 52.219-6 Notice of Total Small Business Set-Aside (Nov 2025)\n☐ 52.219-6 (reserved duplicate row)";
  const M2 = parseCheckboxMatrix(tableSrc);
  assert(M2.get("52.219-6") === "checked", "the pipe-prefixed ☒ line IS parsed → both-states dedup fires → CHECKED wins (fabricated ☐ closed)");
  const bar = base({ requirement: "52.219-6 set-aside applies per the clause list.", citation: "clause list 52.219-6 checked", kind: "eligibility_bar", controllability: "bidder_cannot_move", severity: "P0" });
  const inp = [bar];
  assert(applyCheckboxStateFidelity(inp, tableSrc, { enabled: true })[0] === inp[0], "a genuinely-checked clause is NOT false-corrected to ☐ (no fabrication)");
});

console.log("\n── P-R1#4 — mixed citation (unchecked clause cross-ref BEFORE the real checked subject) ⇒ NOT corrected ──");
withFlag(true, () => {
  // Citation names 52.219-14 (☐) first, but the finding's real subject is 52.219-33 (☒). Positional-first would mis-grab 52.219-14.
  const mixed = base({ requirement: "Per the 52.219-14 cross-reference, 52.219-33 is checked and applies.", citation: "52.219-14 cross-ref; subject 52.219-33 checked in Section I", kind: "clause_flowdown", controllability: "bidder_controls", severity: "P2" });
  const inp = [mixed];
  const out = applyCheckboxStateFidelity(inp, SRC, { enabled: true });
  assert(out === inp && out[0] === inp[0], "mixed ☐+☒ co-cited: LEFT INTACT — corrects only when exactly ONE matrix clause is present and it's ☐ (R1 #4 closed)");
});

// ══ GAUNTLET R2 REMEDIATION PROBE ══
console.log("\n── P-R2#1 — APPEND preserves downstream-keyed provenance ('incorporated by reference') → no fabricated conflict ──");
withFlag(true, () => {
  // A ☐ pool-definer clause with a legit by-reference marking + checked-framing. The gate must NOT delete the by-ref
  // phrase that card #534's isByReferenceMarkingOnly / detectSetAsideConflict key on (else it fabricates a set-aside conflict).
  const src2 = "SECTION I — CONTRACT CLAUSES\n☐ 52.219-3 Notice of HUBZone Set-Aside (Nov 2025)\n☒ 52.219-33 Nonmanufacturer Rule (Nov 2025)";
  const byref = base({ requirement: "52.219-3 HUBZone provisions.", citation: "52.219-3 incorporated by reference in the clause list, checked", kind: "clause_flowdown", controllability: "bidder_controls", severity: "P2" });
  const [f] = applyCheckboxStateFidelity([byref], src2, { enabled: true });
  assert(f.checkboxCorrected === true, "the ☐ 52.219-3 finding IS corrected (framing present)");
  assert(/incorporated by reference/i.test(f.citation), "APPEND preserved 'incorporated by reference' — downstream card #534 guard still fires → no fabricated set-aside conflict (R2 #1 closed)");
  assert(/UNCHECKED \(☐\)/.test(f.citation), "and the true ☐ correction is appended");
});

// ══ GAUNTLET R3 REMEDIATION PROBES (asymmetric parse-miss → a caught ☐ must never outvote a missed same-clause ☒) ══
console.log("\n── P-R3#1 — a CHECKED ☒ row is caught however wide its lead-in/gap ⇒ both-states dedup keeps CHECKED ──");
{
  const cases: Array<[string, string]> = [
    ["wide outline prefix", "(a)(1)(iii)(B) ☒ 52.219-6 Notice of Total Small Business Set-Aside\n☐ 52.219-6 (reserved — see Alternate I)"],
    ["wide glyph→clause gap", "☒        52.219-6 Notice of Total Small Business Set-Aside\n☐ 52.219-6 (reserved dup)"],
    ["line-wrap glyph↔clause", "☒\n52.219-6 Notice of Total Small Business Set-Aside\n☐ 52.219-6 (reserved dup)"],
    ["table-pipe border", "| ☒ | 52.219-6 Notice of Total Small Business Set-Aside |\n☐ 52.219-6 (dup)"],
  ];
  for (const [label, src] of cases) {
    assert(parseCheckboxMatrix(src).get("52.219-6") === "checked", `${label}: ☒ row caught → 52.219-6 resolves CHECKED (no fabricated ☐)`);
  }
}
console.log("\n── P-R3#1b — the genuinely-checked clause is NOT false-corrected to ☐ (fabrication direction closed) ──");
withFlag(true, () => {
  const src = "(a)(1)(iii)(B) ☒ 52.219-6 Notice of Total Small Business Set-Aside\n☐ 52.219-6 (reserved — see Alternate I)";
  const bar = base({ requirement: "52.219-6 total small business set-aside applies.", citation: "52.219-6 checked in the Section I clause list", kind: "eligibility_bar", controllability: "bidder_cannot_move", severity: "P0" });
  const inp = [bar];
  assert(applyCheckboxStateFidelity(inp, src, { enabled: true })[0] === inp[0], "genuinely-checked 52.219-6 LEFT INTACT — no appended false ☐ (R3 #1 closed)");
});
console.log("\n── P-R3#1c — multi-clause row: each clause gets ITS OWN governing glyph (no inheritance) ──");
{
  const M = parseCheckboxMatrix("☒ 52.219-6 Set-Aside ☐ 52.219-7 Alt");
  assert(M.get("52.219-6") === "checked" && M.get("52.219-7") === "unchecked", "☒ 52.219-6 … ☐ 52.219-7 → 6=checked, 7=unchecked (nearest-glyph, no clause between)");
  assert(parseCheckboxMatrix("☒ 52.219-6 Set-Aside 52.219-7 Alt").get("52.219-7") === undefined, "a clause with a clause-number between it and the glyph → absent (never inherits the prior clause's ☒)");
}

// ══ GAUNTLET R4 REMEDIATION PROBES (live-record fabrication: Alternate-of form + checkbox-after-label) ══
console.log("\n── P-R4#1 (P0, LIVE) — '☐ Alternate I of <clause>' does NOT mark the BASE clause unchecked ──");
{
  const alt = "52.240-91 Security Prohibitions and Exclusions (Nov 2025)\n☐ Alternate I (Nov 2025) of 52.240-91\n52.244-6 Subcontracts for Commercial Products (Nov 2025)";
  assert(parseCheckboxMatrix(alt).get("52.240-91") === undefined, "the ☐ governs 'Alternate I', NOT base 52.240-91 — words ('Alternate','of') between glyph and clause reject the row (R4 BREAK 1 closed)");
}
withFlag(true, () => {
  const alt = "52.240-91 Security Prohibitions and Exclusions (Nov 2025)\n☐ Alternate I (Nov 2025) of 52.240-91";
  const inc = base({ requirement: "Security Prohibitions and Exclusions (52.240-91) is incorporated by reference.", citation: "Section I, 52.240-91 Security Prohibitions and Exclusions (Nov 2025)", kind: "other", controllability: "bidder_controls", severity: "P2" });
  const inp = [inc];
  assert(applyCheckboxStateFidelity(inp, alt, { enabled: true })[0] === inp[0], "an incorporated-by-reference 52.240-91 finding is NOT false-corrected to ☐ (no live-record fabrication)");
});

console.log("\n── P-R4#2 (P0) — checkbox-AFTER-label layout: the end-of-line glyph does NOT wrap onto the next clause ──");
{
  const afterLabel = "52.100-1 First Clause ☒\n52.100-2 Second Clause incorporated";
  const M = parseCheckboxMatrix(afterLabel);
  assert(M.get("52.100-2") === undefined, "the ☒ ending 52.100-1's row does NOT wrap-join down to 52.100-2 (wrap fires only on a glyph-ONLY row — R4 BREAK 2 closed)");
}
withFlag(true, () => {
  const src = "52.500-1 Alpha ☐\n52.500-2 Beta incorporated by reference";
  const inc = base({ requirement: "52.500-2 Beta is incorporated by reference.", citation: "Section I, 52.500-2 Beta", kind: "other", controllability: "bidder_controls", severity: "P2" });
  const inp = [inc];
  assert(applyCheckboxStateFidelity(inp, src, { enabled: true })[0] === inp[0], "a prose/after-label glyph does NOT fabricate a ☐ correction on the next incorporated clause");
});

console.log("\n── P-R4#3 (regression) — a GENUINE glyph-only wrap still resolves, and a direct ☐<clause> still marks unchecked ──");
{
  assert(parseCheckboxMatrix("☒\n52.219-6 Notice of Total Small Business Set-Aside").get("52.219-6") === "checked", "a genuinely-stranded glyph-only ☒ row wrap-joins to its clause (checked)");
  assert(parseCheckboxMatrix("☐ 52.219-14 Limitations on Subcontracting").get("52.219-14") === "unchecked", "a direct '☐ <clause>' matrix row still marks unchecked (the real 52.219-14 case)");
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILED`} — checkbox-state-fidelity`);
process.exit(failures === 0 ? 0 : 1);
