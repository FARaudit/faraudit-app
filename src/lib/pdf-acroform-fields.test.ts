// $0 PROOF for ACROFORM FIELD RECOVERY (CEO queue #2a).
// Run: npx tsx src/lib/pdf-acroform-fields.test.ts
//
// Asserts through `extractText` — the real production entry point — on a PDF this suite builds itself, so it
// runs identically here and in CI and needs no untracked corpus. The fixture reproduces the measured defect
// structure of run eab43ada's SF-30s: printed labels in the content stream, typed answers only in /V, and two
// checkbox rows whose BOTH options print as ordinary text.
import { buildAcroFormPdf, SF30_LABELS, SF30_FIELDS } from "./acroform-fixture";
import { extractText } from "./pdf-text-extractor";
import { recoverAcroFormFields, ACROFORM_BLOCK_HEADER } from "./pdf-acroform-fields";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const ON = () => { process.env.AUDIT_INGEST_ACROFORM_FIELDS = "true"; };
const OFF = () => { delete process.env.AUDIT_INGEST_ACROFORM_FIELDS; };

(async () => {
  const pdf = buildAcroFormPdf(SF30_LABELS, SF30_FIELDS);

  console.log("── 1. THE DEFECT IS REAL, AND FLAG-OFF PRESERVES IT EXACTLY ──────────────");
  OFF();
  const off = await extractText(pdf);
  assert(off.rawText.includes("14. DESCRIPTION OF AMENDMENT/MODIFICATION"), "flag OFF: printed LABELS extract fine");
  for (const f of SF30_FIELDS.filter((x) => x.value && !x.checkbox)) {
    assert(!off.rawText.includes(f.value), `flag OFF: value "${f.value.slice(0, 30)}" is ABSENT — the defect`);
  }
  assert(!off.rawText.includes("FORM FIELD VALUES"), "flag OFF: no block appended");
  assert(!off.warnings.some((w) => w.startsWith("ACROFORM_FIELDS")), "flag OFF: no telemetry — byte-identical path");

  console.log("\n── 2. FLAG ON: EVERY TYPED VALUE RECOVERED, THROUGH extractText ──────────");
  ON();
  const on = await extractText(pdf);
  assert(on.rawText.includes(ACROFORM_BLOCK_HEADER.split("\n")[0]), "the block header is present");
  for (const f of SF30_FIELDS.filter((x) => x.value && !x.checkbox)) {
    assert(on.rawText.includes(f.value), `recovered: "${f.value.slice(0, 44)}"`);
  }
  assert(on.warnings.some((w) => w.startsWith("ACROFORM_FIELDS: recovered")), "telemetry names the recovery");

  console.log("\n── 3. THE CHECKBOXES — the reason this module exists ─────────────────────");
  // Page text says BOTH: "...is extended. is not extended." and "Contractor is not is required to sign".
  assert(on.rawText.includes("is extended. is not extended."),
    "the ambiguous printed row is still there (we add, we do not rewrite the page)");
  assert(/OffersExtended \[checkbox\] = Yes/.test(on.rawText), "OffersExtended resolves to its on-state name 'Yes'");
  assert(/ContractorMustSign \[checkbox\] = Off/.test(on.rawText), "ContractorMustSign resolves to 'Off' — NOT selected");
  assert(on.warnings.some((w) => /checkbox\/radio state/.test(w)), "telemetry calls out the checkbox states specifically");

  console.log("\n── 4. GROUNDING DISCIPLINE — no invented word may sit in a value slot ────");
  const block = on.rawText.slice(on.rawText.indexOf("==== FORM FIELD VALUES"));
  assert(!/=\s*(CHECKED|NOT CHECKED|TICKED|SELECTED|TRUE|FALSE)\b/.test(block),
    "no authored state word in any value position — only the PDF's own state names");
  for (const line of block.split("\n").filter((l) => l.startsWith("[page "))) {
    const val = line.slice(line.indexOf(" = ") + 3);
    const known = SF30_FIELDS.some((f) => f.value === val) || val === "Off" || val === "(empty)";
    assert(known, `every emitted value is document-true: ${JSON.stringify(val.slice(0, 50))}`);
  }

  console.log("\n── 5. NEGATIVE CONTROLS ─────────────────────────────────────────────────");
  {
    ON();
    const plain = await extractText(buildAcroFormPdf(["A page with no form at all."], []));
    assert(!plain.rawText.includes("FORM FIELD VALUES"), "a PDF with no AcroForm gets NO block");
    assert(!plain.warnings.some((w) => w.startsWith("ACROFORM_FIELDS: recovered")), "…and no recovery telemetry");
  }
  {
    // An empty text field is not an answer and must not dilute the block.
    assert(!/EmptyOnPurpose/.test(block), "an empty text field is omitted");
  }
  {
    // ON-STATE NAMES ARE NOT ALWAYS "Yes". SF forms use /1, /On, /A … A recogniser that tested for "Yes"
    // would read every one of those as unchecked — the dangerous direction, since it silently converts a
    // TICKED box into an unticked one.
    ON();
    const odd = await extractText(buildAcroFormPdf(["Odd on-state"], [
      { name: "BoxA", value: "1", checkbox: true, checked: true },
      { name: "BoxB", value: "On", checkbox: true, checked: true },
      { name: "BoxC", value: "Yes", checkbox: true, checked: false },
    ]));
    assert(/BoxA \[checkbox\] = 1/.test(odd.rawText), "on-state '1' survives as itself");
    assert(/BoxB \[checkbox\] = On/.test(odd.rawText), "on-state 'On' survives as itself");
    assert(/BoxC \[checkbox\] = Off/.test(odd.rawText), "an unticked box reads Off whatever its on-state name is");
  }

  console.log("\n── 6. FAIL-CLOSED — recovery never throws ───────────────────────────────");
  {
    const none = await recoverAcroFormFields(null);
    assert(none.fields.length === 0 && !!none.refused, "a null source REFUSES by name — 'no form' and 'could not look' stay distinct");
    const threw = await recoverAcroFormFields({ getFieldObjects: async () => { throw new Error("boom"); } });
    assert(threw.fields.length === 0 && /boom/.test(threw.refused ?? ""), "a throwing source is caught and named");
    const empty = await recoverAcroFormFields({ getFieldObjects: async () => null });
    assert(empty.fields.length === 0 && !empty.refused && empty.block === "", "no AcroForm is NORMAL, not a refusal");
  }

  console.log("\n── 7. DOCUMENT ORDER ────────────────────────────────────────────────────");
  {
    const names = block.split("\n").filter((l) => l.startsWith("[page ")).map((l) => l.slice(l.indexOf("] ") + 2).split(" ")[0].split(" [")[0]);
    const expected = ["AmendmentNumber", "EffectiveDate", "SolicitationNumber", "OffersExtended", "ContractorMustSign", "Block14Description"];
    assert(JSON.stringify(names) === JSON.stringify(expected),
      `fields read top-down as laid out\n     got      ${JSON.stringify(names)}\n     expected ${JSON.stringify(expected)}`);
  }

  OFF();
  console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
