// Helpers test harness. Run: npx tsx agents/sam-ingest/helpers.test.ts
// Uses dynamic import to match the .ts-extension pattern the rest of this
// directory uses (the static-import form trips tsc's allowImportingTsExtensions
// rule project-wide).

// @ts-expect-error tsx
const helpersNs: any = await import("./helpers.ts");
const { classifyDocType, resolveAgency, classifyRisk } = helpersNs.default ?? helpersNs;

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

// classifyRisk uses a fixed "now" so deadline math is reproducible.
const NOW = new Date("2026-05-07T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86400000).toISOString();

const baseOpp = {
  noticeId: "test",
  title: "test",
  solicitationNumber: null,
  department: null,
  subTier: null,
  fullParentPathName: null,
  naicsCode: null,
  type: "Solicitation",
  typeOfSetAside: null,
  typeOfSetAsideDescription: null,
  postedDate: null,
  responseDeadLine: null,
  description: "",
  resourceLinks: [] as string[],
  uiLink: null
};

const riskCases: Case<any, string>[] = [
  { label: "P0 · deadline ≤3d (1d out)",         input: { ...baseOpp, responseDeadLine: inDays(1) },                                expected: "P0" },
  { label: "P0 · hex chrome regardless of set-aside", input: { ...baseOpp, description: "...DFARS 252.223-7008 Hexavalent Chromium..." }, expected: "P0" },
  { label: "P0 · Xinjiang / forced labor",       input: { ...baseOpp, description: "Compliance with 252.225-7060 (Xinjiang)." },   expected: "P0" },
  { label: "P0 · CMMC level 2",                  input: { ...baseOpp, description: "Contractor must achieve CMMC Level 2 per 252.204-7021." }, expected: "P0" },
  { label: "P1 · deadline 5d (no DFARS hits)",   input: { ...baseOpp, responseDeadLine: inDays(5) },                                expected: "P1" },
  { label: "P1 · IDIQ document_type complexity", input: { ...baseOpp, type: "Solicitation (IDIQ)" },                                expected: "P1" },
  { label: "P1 · BPA document_type complexity",  input: { ...baseOpp, type: "BPA Call" },                                           expected: "P1" },
  { label: "Watch · Combined Synopsis is NOT P1 (SAM default for commercial-item small-biz RFQs)", input: { ...baseOpp, type: "Combined Synopsis/Solicitation" }, expected: "Watch" },
  { label: "P2 · sole-source intent in description", input: { ...baseOpp, description: "Government intends to sole source this requirement to incumbent." }, expected: "P2" },
  { label: "P2 · sources sought + matching title", input: { ...baseOpp, type: "Sources Sought", title: "RFI for advanced manufacturing" }, expected: "P2" },
  { label: "Watch · vanilla solicitation, no triggers", input: { ...baseOpp, responseDeadLine: inDays(30) },                        expected: "Watch" },
  { label: "Precedence · deadline≤3d AND CMMC text → still P0 (one verdict)", input: { ...baseOpp, responseDeadLine: inDays(2), description: "CMMC Level 2 required" }, expected: "P0" },
  { label: "Precedence · deadline=10d AND IDIQ → P1 (deadline rule skipped, doc_type fires)", input: { ...baseOpp, responseDeadLine: inDays(10), type: "IDIQ Solicitation" }, expected: "P1" },
  // Boundary tests — lock in the expired/null/zero-day deadline behavior so a
  // future refactor can't silently flood P0 with dead notices again.
  { label: "Boundary · expired deadline (-3d) does NOT fire P0/P1, falls through to Watch", input: { ...baseOpp, responseDeadLine: inDays(-3) }, expected: "Watch" },
  { label: "Boundary · null deadline does NOT fire P0/P1 (vanilla solicitation falls to Watch)", input: { ...baseOpp, responseDeadLine: null },  expected: "Watch" },
  { label: "Boundary · deadline=0d (due now) DOES fire P0",                                  input: { ...baseOpp, responseDeadLine: inDays(0) },  expected: "P0"    },
  // Regression-lock: every DoD supply solicitation cites these clause numbers
  // prophylactically as mandatory flow-downs (per DFARS 223.73 / 204.7503 /
  // 225.7706). Matching on the bare clause number floods P0 with boilerplate.
  // We match on substantive keywords instead. This test makes the bug
  // impossible to silently re-introduce.
  {
    label: "Regression · flow-down clause numbers without substantive keyword does NOT fire P0",
    input: {
      ...baseOpp,
      typeOfSetAside: "SBA",
      description: "This solicitation incorporates standard DFARS flow-down clauses including 252.223-7008, 252.204-7021, and 252.225-7060 by reference."
    },
    expected: "Watch"
  }
];

console.log("── classifyDocType ──");
for (const c of docTypeCases) run(c.label, classifyDocType(c.input), c.expected);
console.log("\n── resolveAgency ──");
for (const c of agencyCases) run(c.label, resolveAgency(c.input), c.expected);
console.log("\n── classifyRisk ──");
for (const c of riskCases) run(c.label, classifyRisk(c.input, NOW), c.expected);

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
