// Adversarial probe for reconcileAbsenceClaims / assertsDocAbsent.
// Goal: find inputs where the function REWRITES a claim about a document that is
// actually genuinely absent (i.e. a DIFFERENT, non-present attachment sharing a
// generic name with a present one) — the severe/dangerous failure direction.

import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";

function section(title: string) {
  console.log("\n" + "=".repeat(80));
  console.log(title);
  console.log("=".repeat(80));
}

function run(label: string, findings: { id: string; requirement: string }[], fullSource: string, provenanceDocs: Set<string>, resolvedSetAside?: string | null) {
  section(label);
  const res = reconcileAbsenceClaims(findings, fullSource, provenanceDocs, resolvedSetAside);
  for (const f of res.findings) {
    console.log(`[${f.id}] requirement =>\n  ${f.requirement}`);
  }
  console.log(`refuted count: ${res.refuted.length}`);
  for (const r of res.refuted) {
    console.log(`  refuted: id=${r.id} doc=${r.doc} kind=${r.kind}`);
    console.log(`    before: ${r.before}`);
    console.log(`    after:  ${r.after}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// CASE 1: Two attachments share the same generic document name but different
// attachment numbers. Attachment 0002 (Wage Determination) IS present in the
// source. Attachment 0009 (a DIFFERENT wage determination, e.g. for a
// different labor category / site) is genuinely NOT in the source at all.
// The finding correctly flags Attachment 0009 as absent. Does the reconciler
// wrongly "correct" it using the presence of the unrelated Attachment 0002?
// ---------------------------------------------------------------------------
{
  const fullSource = `
==== DOCUMENT: WAGE DETERMINATIONS - 20260513.pdf ====
This is the full body of Wage Determination (Attachment 0002), covering the
janitorial labor category at the primary site. Rates: SCA WD 2015-4281 Rev 23.
Occupation code 11150, Guard I, rate $19.87/hr plus health & welfare.
`.trim();

  const findings = [
    {
      id: "F-100",
      requirement:
        "Wage Determination (Attachment 0009) is referenced but not provided in the assigned source — rates for the electrical labor category at the annex site are unknown and cannot be priced.",
    },
  ];

  const res = run(
    "CASE 1: generic-name collision across attachment numbers (0002 present / 0009 genuinely absent)",
    findings,
    fullSource,
    new Set(["WAGE DETERMINATIONS - 20260513.pdf"]), // provenanceDocs: this doc DID produce grounded findings
  );

  const f = res.findings[0];
  const wronglyRefuted = f.requirement.startsWith("CORRECTED —") || f.requirement.startsWith("NOT ANALYZED —");
  console.log(`\n>>> CASE 1 VERDICT: ${wronglyRefuted ? "BUG — wrongly rewrote a claim about a genuinely absent attachment" : "safe — claim left alone"}`);
}

// ---------------------------------------------------------------------------
// CASE 2: Same pattern with PWS. "PWS (Attachment 0001)" is present. A finding
// claims a DIFFERENT attachment, "PWS Appendix D (Attachment 0015)", covering
// a separate scope addendum, is absent — and it genuinely is (no region for
// it exists in fullSource).
// ---------------------------------------------------------------------------
{
  const fullSource = `
==== DOCUMENT: PWS KO Appropved - 20260720.pdf ====
Performance Work Statement. Section 1: Scope. The contractor shall provide
base operations support at the primary installation as described herein.
`.trim();

  const findings = [
    {
      id: "F-101",
      requirement:
        "PWS (Attachment 0015) is referenced but not provided in the assigned source — the scope addendum for the annex facility is unknown, so labor mix for that site cannot be estimated.",
    },
  ];

  const res = run(
    "CASE 2: PWS generic-name collision (Attachment 0001 present / Attachment 0015 genuinely absent)",
    findings,
    fullSource,
    new Set(["PWS KO Appropved - 20260720.pdf"]),
  );

  const f = res.findings[0];
  const wronglyRefuted = f.requirement.startsWith("CORRECTED —") || f.requirement.startsWith("NOT ANALYZED —");
  console.log(`\n>>> CASE 2 VERDICT: ${wronglyRefuted ? "BUG — wrongly rewrote a claim about a genuinely absent attachment" : "safe — claim left alone"}`);
}

// ---------------------------------------------------------------------------
// CASE 3: Baseline sanity check — the TRUE positive the module is designed for
// (claim about the SAME attachment that IS present). Should be refuted. Just
// confirms the harness/regex actually fires so Cases 1/2 are meaningful.
// ---------------------------------------------------------------------------
{
  const fullSource = `
==== DOCUMENT: WAGE DETERMINATIONS - 20260513.pdf ====
This is the full body of Wage Determination (Attachment 0002). Rates included.
`.trim();

  const findings = [
    {
      id: "F-102",
      requirement:
        "Wage Determination (Attachment 0002) is referenced but not provided in the assigned source — rates are unknown.",
    },
  ];

  run("CASE 3 (baseline true-positive): claim about the SAME present attachment", findings, fullSource, new Set(["WAGE DETERMINATIONS - 20260513.pdf"]));
}
