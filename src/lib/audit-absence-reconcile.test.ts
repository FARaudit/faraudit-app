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

  // ---- 1b. THE SET-ASIDE ARM MUST FIT THE RENDERER TOO (adversarial round 3, 2026-08-04) ----------------------
  // The doc arm calls fitToRender; the SET-ASIDE arm never did. The report renders `requirement` through
  // truncateOnWord(..., 400) (_view-model.ts:2165), so a longer correction was persisted whole and silently shaved
  // ON THE PAGE — measured at 593 persisted vs 395 rendered, dropping 198 characters of the preserved analysis.
  // That is precisely the divergence the fitToRender comment claims to have closed, left open on one of two arms.
  // The correction's own base is ~222 chars, so the budget always falls in the appended analysis: the correction
  // survives intact and only the tail shortens, which is the right priority order.
  const LONG_SA = "NAICS 561730 applies to all CLINs and the size standard governs joint-venture eligibility. "
    + "Set-aside type is not stated in Section B. "
    + "The bidder must confirm its size status under the assigned code before pricing, because an oversize prime "
    + "cannot cure the defect after award and the contracting officer may find the offer ineligible on that basis "
    + "alone; subcontracting limitations under FAR 52.219-14 then apply to the whole period of performance.";
  const saLong = run([LONG_SA], "Total Small Business Set-Aside").findings[0].requirement ?? "";
  ok("set-aside correction fits the renderer's 400-char budget",
     saLong.length <= 400);
  ok("...and the correction itself survives — only the appended analysis is shortened",
     /resolved to Total Small Business Set-Aside/.test(saLong) && /qualifies under it/.test(saLong));
  ok("truncation is on a word boundary with an ellipsis, never mid-word",
     saLong.length < 400 ? true : /…$/.test(saLong));

  // ---- 1c. THE BUDGET MUST STAY IN STEP WITH THE RENDERER --------------------------------------------------
  // The module's comment says "Keep in step with the renderer" and nothing enforced it, which is how one arm drifted
  // in the first place. `truncateOnWord` is not exported, so this asserts the two facts a probe would otherwise have
  // to assume — read from the renderer's REAL source, not from a copy of its rule that would share its premise:
  //   (a) the call site that renders `requirement` still passes 400, matching RENDER_BUDGET;
  //   (b) truncateOnWord still returns the string UNCHANGED at or under the budget.
  // Together those make "persisted ≤ 400" a proof that rendered === persisted. If either changes, this fails here
  // rather than silently shaving a customer's report again.
  const { RENDER_BUDGET } = await import("./audit-absence-reconcile");
  const VM = (await import("node:fs")).readFileSync("src/app/audit/[id]/_view-model.ts", "utf8");
  // Call sites are ENUMERATED, not named — there are two that render a requirement and a hand-picked one would go
  // stale the moment a third appears. Zero found is a FAILURE, never a silent pass.
  const sites = VM.split("\n")
    .filter((l) => /truncateOnWord\(/.test(l) && /requirement|rawReq/i.test(l))
    .map((l) => Number(l.match(/,\s*(\d+)\s*\)/)?.[1]))
    .filter((n) => Number.isFinite(n));
  ok(`renderer requirement call sites found (${sites.length})`, sites.length >= 2);
  ok(`every requirement budget (${sites.join(", ")}) matches RENDER_BUDGET (${RENDER_BUDGET})`,
     sites.length > 0 && sites.every((n) => n === RENDER_BUDGET));
  ok("truncateOnWord still returns the string unchanged at or under the budget",
     /if \(str\.length <= max\) return str;/.test(VM));

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

  // ---- 2d. ADVERSARIAL P0 (2026-07-31) — the token is NOT the thing being claimed absent -----------------------
  // Two shapes where the doc token is the nearest noun and the claim is nonetheless about something else. Refuting
  // either DELETES A TRUE WARNING about a document that really is missing — the dangerous direction, and the exact
  // failure this module exists to prevent, inverted.
  ok("modifier object does not refute (\"Appendix C to the PWS is not attached\")",
     run(["Appendix C to the PWS is not attached — the inspection checklist is unavailable to bidders."], "SBA").refuted.length === 0);
  ok("coordinated subject does not refute (three artifacts, one matched)",
     run(["The PWS, the QASP and the bonding certificate are not provided — pricing cannot be built."], "SBA").refuted.length === 0);
  ok("a conjunction alone is enough to stand down",
     run(["The PWS and the bonding certificate are not provided."], "SBA").refuted.length === 0);
  // ...and none of that costs the true positive, which has a parenthetical rather than a modifier or a list.
  ok("the real PWS claim still refutes", run([PWS], "SBA").refuted.length === 1);

  // ---- 2e. ADVERSARIAL ROUND-3 VECTOR 2 (2026-08-04) — A DOCUMENT'S IDENTITY CAN BE ITS NUMBER ------------------
  // The residue test asked only `/[A-Za-z]/`, so digits counted as "nothing else". The corpus holds three distinct
  // Wage Determination files whose token sets are IDENTICAL (["wage","determination"]) — for a WD the revision
  // number IS the identity, and it was exactly what the test discarded. So a claim about WD 15-5110 was refuted by
  // the presence of an unrelated WD, deleting a true warning on the document at the centre of this whole arc.
  // Failure direction is the dangerous one, and it reproduced on unmutated production bytes (run 61aaaa95).
  ok("a DIFFERENT wage determination does not refute (identity is the number, not the words)",
     run(["Wage Determination 15-5110 is not provided in the assigned source."], "SBA").refuted.length === 0);
  ok("a different solicitation number does not refute",
     run(["Solicitation W9123826QA099 is not provided."], "SBA").refuted.length === 0);
  // The banked true positives carry their identifier inside a PARENTHETICAL, which is stripped before the residue
  // test — so tightening the alphabet cannot cost them. Asserted, not assumed:
  ok("the real WD claim still refutes (identifier is parenthetical)", run([WD], "SBA").refuted.length === 1);

  // ---- 2f. ADVERSARIAL ROUND-3 VECTOR 1 (2026-08-04) — NAMING A TOKEN IS NOT IDENTIFYING A DOCUMENT -----------
  // A region's tokens include ordinary head nouns, so a bare "The register is not provided" matched
  // ATT12_Submittal Register.pdf and "The narrative is not attached" matched ATT11_260007_Design Narrative.pdf —
  // refuting an underspecified claim against whichever file happened to share a word, DELETING A TRUE WARNING.
  // Reproduced on real posted data (run 496a9a21 / FA813726R0033).
  //
  // Token COMPLETENESS is not available as the discriminator: the red-team executed it and it destroys 2 of the 4
  // banked true positives, because real filenames carry tokens no lens writes ("Appropved", "ATT10_", "Raytheon").
  // What all 4 true positives carry and no break does is an EXPLICIT IDENTIFIER, so that is the allowlist.
  const V1 = "==== DOCUMENT: ATT12_Submittal Register.pdf ====\nSubmittal register.\n" + "q".repeat(400)
           + "\n==== DOCUMENT: ATT11_260007_Design Narrative.pdf ====\nDesign narrative.\n" + "r".repeat(400);
  const v1run = (req: string) =>
    reconcileAbsenceClaims([{ id: "a", requirement: req }], V1, new Set(["ATT12_Submittal Register.pdf"]), null).refuted.length;
  ok("bare head noun does not refute (\"The register is not provided\")", v1run("The register is not provided.") === 0);
  ok("bare head noun does not refute (\"The narrative is not attached\")", v1run("The narrative is not attached.") === 0);
  ok("bare head noun does not refute (\"The design is not provided\")", v1run("The design is not provided.") === 0);
  ok("an explicit identifier still refutes", v1run("Submittal Register (Attachment 12) is not provided.") === 1);
  // THE FALSE NEGATIVE THIS DELIBERATELY ACCEPTS, pinned as CURRENT BEHAVIOUR rather than as correct: a claim that
  // names the document plainly and truly, with no identifier, is now left standing. That is the SAFE direction —
  // a false claim survives instead of a true warning being deleted — but it is a real cost and must not be
  // discovered by surprise later. Marginal cost on the banked corpus is zero (refuted set byte-identical, 5/5).
  ok("KNOWN FALSE NEGATIVE: an unidentified claim is left standing, by design", v1run("The register is not provided in the source.") === 0);

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
