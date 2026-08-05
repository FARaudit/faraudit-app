// $0 PROOF — SF-1449 COVER PAGE (block 10) survives ingest with its VALUES, not just its labels.
// Run: npx tsx src/lib/pdf-acroform-sf1449.test.ts   (lives in src/lib so CI's `self-audit suites` leg runs it)
//
// WHY THIS EXISTS. Backlog item INGEST-SF1449-VALUE-LOSS recorded, on 2026-07-30, that "EVERY SF-1449 form label
// survives and NOT ONE carries its value", and proposed a coordinate-aware extractor because "the SF-1449 is a
// TABLE: pdf-parse emits the label cells and drops the positioned value cells."
//
// THAT DIAGNOSIS WAS WRONG, and the way it was wrong is the lesson worth pinning. The values are not positioned
// text that landed in the wrong place — they are not in the content stream AT ALL. They are AcroForm field
// values, and the real specimen (W9123826QA032, USACE Sacramento) carries 114 widget annotations. Every probe
// that searched for a value NEAR its label returned ABSENT and would have kept returning ABSENT after a perfect
// coordinate-aware rewrite, because adjacency is the wrong question to ask of a form. Measured 2026-08-04 on the
// real PDF: `extractText` recovers 39 field values including 23 checkbox states, among them the two facts the
// item said were unreachable — `10setasidepercent = 100` and `10sizestandard = USD 9,500,000.00`.
//
// So the defect is closed by AUDIT_INGEST_ACROFORM_FIELDS (live-armed), and this gate exists so it CANNOT
// silently reopen on the highest-volume commercial form we ingest. Fixture is self-built (see acroform-fixture.ts
// for why a committed government PDF is the wrong dependency) but transcribed field-for-field from that
// document, so it fails for the same reason production would.
import { buildAcroFormPdf, SF1449_LABELS, SF1449_FIELDS } from "./acroform-fixture";
import { extractText } from "./pdf-text-extractor";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const ON = () => { process.env.AUDIT_INGEST_ACROFORM_FIELDS = "true"; };
const OFF = () => { delete process.env.AUDIT_INGEST_ACROFORM_FIELDS; };

(async () => {
  const pdf = buildAcroFormPdf(SF1449_LABELS, SF1449_FIELDS);

  console.log("── 1. THE DEFECT, PRESERVED EXACTLY WHEN THE FLAG IS OFF ─────────────────");
  OFF();
  const off = await extractText(pdf);
  assert(off.rawText.includes("SIZE STANDARD:"), "flag OFF: the block-10 LABELS extract fine");
  assert(!off.rawText.includes("USD 9,500,000.00"), "flag OFF: the size standard is ABSENT — the reported defect");
  assert(!/SET ASIDE[\s\S]{0,120}\b100\b/i.test(off.rawText), "flag OFF: no set-aside percentage anywhere near its label");
  assert(!off.warnings.some((w) => w.startsWith("ACROFORM_FIELDS")), "flag OFF: no telemetry — byte-identical path");

  console.log("\n── 2. THE TWO BID-DECIDING FACTS SURVIVE WITH THE FLAG ON ────────────────");
  ON();
  const on = await extractText(pdf);
  assert(on.rawText.includes("USD 9,500,000.00"), "size standard recovered (block 10)");
  assert(/10setasidepercent\s*=\s*100\b/.test(on.rawText), "set-aside percentage recovered (block 10)");
  assert(on.rawText.includes("561730"), "NAICS recovered (block 10)");
  assert(on.rawText.includes("W9123826QA032"), "solicitation number recovered (block 5)");
  assert(on.warnings.some((w) => /ACROFORM_FIELDS: recovered \d+ form field value/.test(w)), "recovery is announced in warnings, not silent");

  console.log("\n── 3. THE CHECKBOX ROW — page text says every program, the form says ONE ─────");
  // Every socioeconomic caption prints as ordinary text whether ticked or not, so a reader that trusts page text
  // reads this buy as 8(a) AND HUBZONE AND SDVOSB AND WOSB. The tick lives only in /AS. Assert the COMPLEMENT
  // explicitly — naming only the selected one would pass on a fixture where everything was selected.
  for (const caption of ["8(A)", "HUBZONE SMALL BUSINESS", "SERVICE-DISABLED VETERAN-OWNED SMALL BUSINESS (SDVOSB)"])
    assert(on.rawText.includes(caption), `page text prints "${caption.slice(0, 28)}" even though it is NOT selected`);
  const state = (field: string) => on.rawText.match(new RegExp(`${field}\\s*\\[checkbox\\]\\s*=\\s*(\\S+)`))?.[1];
  assert(state("10smallbusinesscheckbox") !== undefined && state("10smallbusinesscheckbox") !== "Off", "the ONE selected program is Small Business");
  const notSelected = ["10wosbcheckbox", "10edwosbcheckbox", "10hubzonecheckbox", "10servicedisabledcheckbox", "10_8acheckbox", "10unrestrictedcheckbox"];
  for (const f of notSelected) assert(state(f) === "Off", `${f} reads Off (page text alone would have claimed it)`);
  // and the whole row, counted — exactly one socioeconomic program may be selected on a set-aside cover page.
  const selected = [...notSelected, "10smallbusinesscheckbox"].filter((f) => { const s = state(f); return s !== undefined && s !== "Off"; });
  assert(selected.length === 1, `exactly ONE program selected, got ${selected.length}: ${JSON.stringify(selected)}`);

  console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`} — SF-1449 block 10 keeps its values through ingest.`);
  process.exit(failures === 0 ? 0 : 1);
})();
