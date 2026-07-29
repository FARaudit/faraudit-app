// $0 PARITY GATE — src/lib/sam.ts:classifyDocType must stay byte-behavior-equal
// to agents/sam-ingest/helpers.ts:classifyDocType. The audits write path (api/audit
// inserts, watcher-tick) stamps audits.document_type with the src/lib copy while
// sam-ingest stamps pending_audits.document_type with the agents/ original; the
// Past Audits fType slicer merges both vocabularies, so drift = a split slicer.
// Run: npx tsx src/lib/sam-doctype-parity.test.ts
import { classifyDocType as libClassify } from "./sam";
// tsx resolves the .ts-extension relative import used inside agents/sam-ingest.
import { classifyDocType as ingestClassify } from "../../agents/sam-ingest/helpers";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// SAM canonical type strings + structure markers + fallback shapes + garbage.
const CASES: Array<{ input: string | null; expected: string }> = [
  { input: "Solicitation", expected: "RFQ" },
  { input: "Combined Synopsis/Solicitation", expected: "Combined" },
  { input: "Presolicitation", expected: "PreSol" },
  { input: "Sources Sought", expected: "SrcSght" },
  { input: "Award Notice", expected: "Award" },
  { input: "Justification", expected: "Justification" },
  { input: "Special Notice", expected: "Special" },
  { input: "Sale of Surplus Property", expected: "Sale" },
  { input: "IDIQ Solicitation", expected: "IDIQ" },
  { input: "BPA Call", expected: "BPA" },
  { input: "Task Order under IDIQ", expected: "IDIQ" }, // IDIQ marker wins by priority
  { input: "Task Order", expected: "TaskOrd" },
  { input: "Modification/Amendment", expected: "Mod" },
  { input: "RFI", expected: "Rfi" },
  { input: "", expected: "Other" },
  { input: "   ", expected: "Other" },
  { input: null, expected: "Other" }
];

console.log("── expected-value battery (both implementations) ──");
for (const c of CASES) {
  const lib = libClassify(c.input);
  const ing = ingestClassify(c.input);
  assert(lib === c.expected, `lib(${JSON.stringify(c.input)}) = ${lib} (want ${c.expected})`);
  assert(ing === lib, `parity on ${JSON.stringify(c.input)}: ingest=${ing} lib=${lib}`);
}

// Known-positive: the harness itself can fail. A deliberately wrong expectation
// must register as a mismatch — proves `assert` is live, then is not counted.
console.log("── harness self-check ──");
const preFailures = failures;
assert(libClassify("Solicitation") === "WRONG_ON_PURPOSE", "harness self-check (MUST print ❌)");
if (failures === preFailures) { console.log("❌ harness self-check did not register a failure — assert is inert"); process.exit(1); }
failures = preFailures; // planted failure verified; do not count it

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
