// Helpers test harness. Run: npx tsx agents/sam-ingest/helpers.test.ts
// Uses dynamic import to match the .ts-extension pattern the rest of this
// directory uses (the static-import form trips tsc's allowImportingTsExtensions
// rule project-wide).

// @ts-expect-error tsx
const helpersNs: any = await import("./helpers.ts");
const { classifyDocType, resolveAgency } = helpersNs.default ?? helpersNs;

interface Case<I, O> { label: string; input: I; expected: O }

const docTypeCases: Case<string | null, string>[] = [
  // 5 known SAM type strings (per CEO spec):
  { label: "Solicitation → RFQ",                      input: "Solicitation",                       expected: "RFQ" },
  { label: "Combined Synopsis/Solicitation → Combined", input: "Combined Synopsis/Solicitation",    expected: "Combined" },
  { label: "Sources Sought → SrcSght",                input: "Sources Sought",                     expected: "SrcSght" },
  { label: "Presolicitation → PreSol",                input: "Presolicitation",                    expected: "PreSol" },
  { label: "Award Notice → Award",                    input: "Award Notice",                       expected: "Award" },
  // Specifics + edge cases:
  { label: "Special Notice → Special (title-cased fallback)", input: "Special Notice",             expected: "Special" },
  { label: "IDIQ marker takes priority",              input: "Solicitation (IDIQ)",                expected: "IDIQ" },
  { label: "BPA marker takes priority",               input: "BPA Solicitation",                   expected: "BPA" },
  { label: "Task Order marker takes priority",        input: "Task Order Award",                   expected: "TaskOrd" },
  { label: "Modification marker takes priority",      input: "Modification — Solicitation",        expected: "Mod" },
  { label: "Award keyword precedence over solicitation", input: "Award Notice — Solicitation",     expected: "Award" },
  { label: "null input → Other",                      input: null,                                 expected: "Other" },
  { label: "empty string → Other",                    input: "",                                   expected: "Other" },
  { label: "unknown short token title-cased",         input: "RFI",                                expected: "Rfi" },
  { label: "unknown two-word title-cased on first",   input: "Bid Notice",                         expected: "Bid" }
];

const agencyCases: Case<any, string | null>[] = [
  { label: "live SAM v2 dotted hierarchy",            input: { fullParentPathName: "INTERIOR, DEPARTMENT OF THE.NATIONAL PARK SERVICE.MWR MIDWEST REGION(60000)" }, expected: "INTERIOR, DEPARTMENT OF THE · NATIONAL PARK SERVICE" },
  { label: "single segment passes through",           input: { fullParentPathName: "DEPARTMENT OF THE NAVY" },                                                       expected: "DEPARTMENT OF THE NAVY" },
  { label: "two segments no parens",                  input: { fullParentPathName: "GSA.FAS" },                                                                       expected: "GSA · FAS" },
  { label: "all null returns null",                   input: { fullParentPathName: null, department: null, subTier: null },                                           expected: null }
];

let pass = 0; let fail = 0;
const run = (label: string, got: any, expected: any) => {
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}`);
  if (!ok) console.log(`        expected: ${JSON.stringify(expected)} · got: ${JSON.stringify(got)}`);
};

console.log("── classifyDocType ──");
for (const c of docTypeCases) run(c.label, classifyDocType(c.input), c.expected);
console.log("\n── resolveAgency ──");
for (const c of agencyCases) run(c.label, resolveAgency(c.input), c.expected);

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
