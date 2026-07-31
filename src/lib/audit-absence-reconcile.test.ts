// $0 regression lock for REPORT-TRUTH #7 — absence claims reconciled against the run's own ledger.
// Run: npx tsx src/lib/audit-absence-reconcile.test.ts
//
// Both surviving AUTO-Fs from the 583df921 Gauntlet are one root, named by the contracts-attorney seat and upheld by
// the red-team: "UNVERIFIED ABSENCE is emitted per-lens and never reconciled against the run's own provenance ledger."
// REPORT-TRUTH #2 WRAPPED these claims; wrapping a false statement does not make it true. This CHECKS them.
//
// THE DANGEROUS DIRECTION IS OVER-REFUTING. Wrongly refuting a TRUE absence claim deletes a real warning from a
// customer's report — worse than the defect. Section 2 exists to hold that line and is the reason the match is narrow.
export {};

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`  ✗ ${l}`); } };

// A source with three real document regions, in the engine's own assembled format.
const SRC = [
  "==== DOCUMENT: Solicitation - W9123826QA032.pdf ====",
  "Section B - Supplies or Services", "0001 Moving and Edging", "x".repeat(400),
  "==== DOCUMENT: PWS KO Appropved - 20260720.pdf ====",
  "The contractor shall mow, edge and maintain the grounds.", "y".repeat(400),
  "==== DOCUMENT: WAGE DETERMINATIONS - 20260513.pdf ====",
  "Wage Determination No.: 2015-5631", "11090 - Gardener 27.19", "z".repeat(400),
].join("\n");

(async () => {
  const { reconcileAbsenceClaims } = await import("./audit-absence-reconcile");
  const PROV = new Set(["Solicitation - W9123826QA032.pdf", "PWS KO Appropved - 20260720.pdf"]); // the WD produced nothing
  const run = (reqs: string[], setAside?: string | null) =>
    reconcileAbsenceClaims(reqs.map((r, i) => ({ id: `f#${i}`, requirement: r })), SRC, PROV, setAside);

  // ---- 1. THE THREE REAL AUTO-F CLAIMS (verbatim from run 583df921) --------------------------------------------
  const PWS = "PWS (Attachment 0001) is referenced but not provided in the assigned source — specific technical, staffing, and performance requirements are unknown";
  const WD = "Wage Determination (Attachment 0002) is referenced but not reproduced — SCA wage rates for the applicable labor categories and locality are unknown";
  const SA = "NAICS 561730 applies to all CLINs. Set-aside type is not stated in Section B";

  const r1 = run([PWS, WD, SA], "SBA");
  ok("all three are refuted", r1.refuted.length === 3);
  ok("PWS → present AND analyzed", r1.refuted[0].kind === "present_and_analyzed" && r1.refuted[0].doc === "PWS KO Appropved - 20260720.pdf");
  ok("WD → present but NOT analyzed (it produced no finding)", r1.refuted[1].kind === "present_not_analyzed");
  ok("set-aside → refuted from the run's own resolved value", r1.refuted[2].doc === "set-aside:SBA");

  const [pws, wd, sa] = r1.findings.map((f) => f.requirement ?? "");
  ok("PWS text no longer says it was not provided", !/not provided/i.test(pws) && /IS in the analyzed source/.test(pws));
  ok("WD text distinguishes unanalyzed from missing", /It is not missing; it is unanalyzed/.test(wd));
  ok("WD text tells the reader to read it directly", /Read it directly/.test(wd));
  ok("set-aside text names the resolved value", /resolved to SBA/.test(sa));
  ok("the original analysis is PRESERVED, not deleted", pws.includes("staffing") && wd.includes("SCA wage rates") && sa.includes("NAICS 561730"));

  // ---- 1b. THE TWO FIXES MUST NOT CONTRADICT EACH OTHER --------------------------------------------------------
  // REPORT-TRUTH #2 appends "(this audit did not locate it; absence was not verified…)" to every absence claim. Once
  // #7 has PROVEN the document IS in the source, that caveat is FALSE — two of our own fixes disagreeing inside one
  // sentence. Found by rendering the real run with both flags on.
  const WITH_2 = `UNVERIFIED ABSENCE — PWS (Attachment 0001) is referenced but not provided in the assigned source — staffing requirements are unknown (this audit did not locate it; absence was not verified against the source — confirm directly in the solicitation)`;
  const r1b = run([WITH_2], "SBA");
  ok("#7 refutes a claim already wrapped by #2", r1b.refuted.length === 1);
  ok("#2's now-false caveat is stripped", !/did not locate it/i.test(r1b.findings[0].requirement ?? ""));
  ok("…while the real consequence survives", /staffing requirements are unknown/.test(r1b.findings[0].requirement ?? ""));

  // ---- 2. FALSIFICATION — THE DANGEROUS DIRECTION --------------------------------------------------------------
  // A GENUINELY absent document must keep its warning. If this leg fails, the gate is deleting real warnings.
  const TRUE_ABSENCE = [
    "Attachment 0005 Drawings is referenced but not provided in the assigned source",
    "The QASP is referenced but not attached to this solicitation",
    "Exhibit C pricing workbook is not included in the posted package",
  ];
  for (const t of TRUE_ABSENCE) {
    const r = run([t], "SBA");
    ok(`TRUE absence kept intact: "${t.slice(0, 44)}…"`, r.refuted.length === 0 && r.findings[0].requirement === t);
  }

  // A CONTENT-absence claim is not this gate's business — refuting it from region presence would be wrong.
  const CONTENT = [
    "The period of performance is not stated anywhere in the solicitation",
    "Evaluation weightings are not specified in the provided sections",
    "The IGCE is not provided to offerors",
  ];
  for (const c of CONTENT) {
    const r = run([c], "SBA");
    ok(`content-absence untouched: "${c.slice(0, 44)}…"`, r.refuted.length === 0);
  }

  // No resolved set-aside ⇒ the set-aside claim may well be TRUE ⇒ must not be refuted.
  ok("set-aside claim untouched when the run resolved none", run([SA], null).refuted.length === 0);
  ok("set-aside claim untouched when the value is empty", run([SA], "").refuted.length === 0);

  // Token adjacency: a document named FAR from the predicate must not trigger a refutation.
  const FAR_APART = "The PWS describes mowing, edging, weeding, pruning, fertilizing and preventive maintenance across the base year and all four option periods, and a separate bonding certificate is not provided";
  ok("a doc token far from the predicate does not refute", run([FAR_APART], "SBA").refuted.length === 0);

  // ---- 2b. THE CONNECTIVE SLOT IS QUANTIFIED, NOT ENUMERATED (REPORT-TRUTH #8) --------------------------------
  // v1 permitted exactly one interjection, `referenced\s+but`. Live run 61aaaa95 wrote "is LISTED BUT not
  // reproduced" and the false PWS claim shipped — the defect walked through the rule written to stop it. These
  // lock the shape: no single connective may be load-bearing. Mutation-checked (narrowing the slot back to the v1
  // literal must turn this section red).
  const CONNECTIVES = ["", "referenced but", "listed but", "cited but", "named but", "mentioned but",
                       "identified but", "listed, but", "referenced yet", "listed though", "identified however",
                       "incorporated by reference but", "identified in the notice but"];
  const missed = CONNECTIVES.filter((c) =>
    run([`PWS (Attachment 0001) is ${c ? c + " " : ""}not reproduced in the source`], "SBA").refuted.length !== 1);
  ok(`every connective phrasing is refuted (missed: ${JSON.stringify(missed)})`, missed.length === 0);
  ok("the live 61aaaa95 phrasing specifically", run(["PWS (Attachment 0001) is listed but not reproduced in the source — SOW obligations are unknown"], "SBA").refuted.length === 1);

  // ---- 2c. PROXIMITY IS NOT SUBJECT POSITION ------------------------------------------------------------------
  // Each names the PWS (present) then asserts absence of a DIFFERENT document in a coordinate clause. Refuting any
  // of them would delete a possibly-true warning about that other document. v1 checked only that the token sat
  // within 60 characters of the predicate and leaked 4 of these 5. Mutation-checked.
  const SECOND_SUBJECT = [
    "The PWS is complete and the drawings are not provided in the source.",
    "PWS (Attachment 0001) is present, but the past performance questionnaire is not attached.",
    "The PWS is thorough although the site visit details are not furnished.",
    "PWS is analyzed; the pricing schedule is not included.",
    "The PWS is in the source. The drawings are not provided.",
  ];
  const leaked = SECOND_SUBJECT.filter((s) => run([s], "SBA").refuted.length > 0);
  ok(`a coordinate clause's subject owns its own predicate (leaked: ${leaked.length})`, leaked.length === 0);
  // …and the guard must not cost the true positive: a parenthetical is not a second subject.
  ok("a parenthetical between subject and predicate still refutes",
     run(["PWS (Attachment 0001) is listed but not reproduced in the source"], "SBA").refuted.length === 1);

  // ---- 3. STRUCTURAL ------------------------------------------------------------------------------------------
  ok("no regions ⇒ untouched", reconcileAbsenceClaims([{ id: "a", requirement: PWS }], "", PROV, "SBA").refuted.length === 0);
  ok("empty findings ⇒ no crash", reconcileAbsenceClaims([], SRC, PROV, "SBA").findings.length === 0);
  ok("input array is not mutated", (() => { const arr = [{ id: "a", requirement: PWS }]; reconcileAbsenceClaims(arr, SRC, PROV, "SBA"); return arr[0].requirement === PWS; })());
  ok("untouched findings returned by reference", (() => { const arr = [{ id: "a", requirement: "A perfectly ordinary finding." }]; return reconcileAbsenceClaims(arr, SRC, PROV, "SBA").findings[0] === arr[0]; })());

  // Idempotence — a second pass must not re-wrap an already-corrected finding.
  const once = run([PWS], "SBA").findings[0].requirement!;
  const twice = reconcileAbsenceClaims([{ id: "a", requirement: once }], SRC, PROV, "SBA");
  ok("running twice changes nothing", twice.refuted.length === 0 && twice.findings[0].requirement === once);

  console.log(`\nREPORT-TRUTH #7 · absence reconciled against the ledger: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
