// $0 regression lock for THE SECOND AXIS — spec-bulk targeting + batched extraction.
// Run: npx tsx src/lib/audit-doc-extraction-batched.test.ts
//
// SUBJECT: the production `selectExtractionTargets`, `runCoverageExtraction`, `isSpecBulk`.
//
// THE TWO RISKS THIS LOCKS.
//   • CONCURRENCY CHANGING THE RESULT. The pass was a strictly serial loop; making it concurrent is a
//     reproducibility hazard, because a rewrite that assembles output in COMPLETION order gives a
//     different answer under load than it does on a quiet machine — and it would pass any test that
//     resolved its stubs instantly. So the stubs below resolve in DELIBERATELY REVERSED order and the
//     output is asserted identical to the serial run.
//   • FAILURE DIRECTION. One document that throws must cost only its own coverage. A concurrent rewrite
//     reaching for Promise.all over the raw promises would discard every other document's spans on a
//     single rejection — silently, and only when something actually failed.
import { selectExtractionTargets, runCoverageExtraction, MIN_SPAN_CHARS } from "./audit-doc-extraction";
import { isSpecBulk, SPEC_BULK_WHY } from "./audit-doc-ownership";
import type { DocExtract } from "./agentic-map";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

const SPAN_A = "The contractor shall submit a mix design for approval before paving begins here.";
const SPAN_B = "Storm drainage utilities shall be installed to the lines and grades shown on plans.";
const SPAN_C = "Laborers must be paid the rate listed for El Paso County under this determination.";
const R = (name: string, text: string, isPrimary = false) => ({ name, text, isPrimary });

const REGIONS = [
  R("Solicitation.pdf", "Primary body.", true),
  R("Attachment N - UFGS 32 12 16 Hot-Mix Asphalt.pdf", `${SPAN_A} Spec prose.`),
  R("Attachment N - UFGS 33 40 00 Storm Drainage Utilities.pdf", `${SPAN_B} Spec prose.`),
  R("Wage Determination TX20260293.pdf", `${SPAN_C} Rate tables.`),
  R("Attachment E - DD1354 Form.pdf", "A form with fields to complete before award of the contract."),
];
const isBinding = () => true;
const isReadable = (t: string) => t.length > 0;

// esbuild targets cjs here — no top-level await. Everything async lives in main().
(async () => {
  console.log("── the spec-bulk predicate selects the specification class and nothing else");
  {
    ok("a UFGS spec is spec-bulk", isSpecBulk("Attachment N - UFGS 32 12 16 Hot-Mix Asphalt.pdf"));
    ok("a DOT spec is spec-bulk", isSpecBulk("Attachment L - NMDOT Spec.pdf"));
    ok("⛔ a wage determination is NOT", !isSpecBulk("Wage Determination TX20260293.pdf"));
    ok("⛔ a mandatory form is NOT", !isSpecBulk("Attachment E - DD1354 Form.pdf"));
    ok("⛔ an unmatched name is NOT", !isSpecBulk("A0001.pdf"));
    ok("the predicate keys on the ownership rule, not a second regex", SPEC_BULK_WHY.includes("technical specification"));
  }

  console.log("── restrictTo narrows the target set; absent, the set is unchanged");
  {
    const all = selectExtractionTargets(REGIONS, isBinding, isReadable);
    const bulk = selectExtractionTargets(REGIONS, isBinding, isReadable, isSpecBulk);
    ok("unrestricted selects every readable binding non-primary doc (4)", all.length === 4);
    ok("restricted selects only the 2 specs", bulk.length === 2 && bulk.every((t) => t.name.includes("UFGS")));
    ok("the primary is never a target either way", !all.some((t) => t.name === "Solicitation.pdf"));
  }

  // Stub extractor: resolves in REVERSED order, so completion order is the opposite of input order.
  const mk = (order: string[]) => {
    const seen: string[] = [];
    const mapOne = async (name: string, text: string): Promise<DocExtract> => {
      seen.push(name);
      const delay = (order.length - order.indexOf(name)) * 12;   // later inputs finish FIRST
      await new Promise((r) => setTimeout(r, delay));
      if (name.includes("BOOM")) throw new Error("extractor exploded");
      const span = text.split(" Spec prose.")[0] || text;
      // The REAL shape: verifySpans reads performanceRequirements[].text and stamps extract.docName.
      // A stub with the wrong field names would make every assertion below pass for the wrong reason.
      return { docName: name, performanceRequirements: [{ text: span }] } as unknown as DocExtract;
    };
    return { mapOne, seen };
  };

  console.log("── ⛔ CONCURRENCY CHANGES THE SCHEDULE, NEVER THE RESULT");
  {
    const targets = selectExtractionTargets(REGIONS, isBinding, isReadable);
    const names = targets.map((t) => t.name);
    const serial = await runCoverageExtraction(targets, mk(names).mapOne, { concurrency: 1 });
    const wide = await runCoverageExtraction(targets, mk(names).mapOne, { concurrency: 4 });
    const dflt = await runCoverageExtraction(targets, mk(names).mapOne);
    const key = (r: typeof serial) => JSON.stringify(r.spans) + `|read=${r.read}|failed=${r.failed.length}`;
    ok("concurrency 4 gives byte-identical output to serial, despite reversed completion order", key(wide) === key(serial));
    ok("omitting the option is the serial default", key(dflt) === key(serial));
    const order = serial.spans.map((s) => names.indexOf(s.doc));
    ok(`spans are in INPUT order, not completion order (got ${JSON.stringify(order)})`,
       order.length > 1 && order.every((v, i) => i === 0 || v >= order[i - 1]) && order.every((v) => v >= 0));
  }

  console.log("── ⛔ FAILURE DIRECTION: one document that throws costs only its own coverage");
  {
    const withBoom = [...REGIONS, R("Attachment N - UFGS BOOM Spec.pdf", `${SPAN_A} Spec prose.`)];
    const targets = selectExtractionTargets(withBoom, isBinding, isReadable);
    const names = targets.map((t) => t.name);
    const res = await runCoverageExtraction(targets, mk(names).mapOne, { concurrency: 4 });
    ok("the failing document is recorded as failed", res.failed.length === 1 && res.failed[0].doc.includes("BOOM"));
    ok("it contributes NO spans", !res.spans.some((s) => s.doc.includes("BOOM")));
    ok("every OTHER document still earned its coverage", res.read === targets.length - 1 && res.spans.length >= 3);
  }

  console.log("── the span floor still governs — a short span earns nothing");
  {
    const shortDoc = [R("Solicitation.pdf", "Primary.", true), R("Attachment N - UFGS Tiny Spec.pdf", "Shall do it.")];
    const targets = selectExtractionTargets(shortDoc, isBinding, isReadable, isSpecBulk);
    const res = await runCoverageExtraction(targets, async (n, t) => ({ docName: n, performanceRequirements: [{ text: t }] } as unknown as DocExtract), { concurrency: 2 });
    ok(`a span under ${MIN_SPAN_CHARS} normalized chars credits nothing`, res.spans.length === 0);
  }

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
