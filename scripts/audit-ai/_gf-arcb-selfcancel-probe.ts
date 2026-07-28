// EXECUTED PROOF — DOES arc-B's VISION-CONFIRMED WAGE-RATE RESCUE CANCEL ITSELF?  $0, no model calls.
//
// THE CLAIM. audit-executor-v3.ts:412 APPENDS `==== VISION-CONFIRMED WAGE RATES (<doc>) ====` blocks
// onto `fullSource` — the code's own words at :406 are "appended for grounding". `groundingSource` is
// computed AFTERWARDS at :537 from the untouched `docs` list, so it never contains those blocks.
// `isGrounded` (audit-expert.ts:36-39) sees groundingSource !== fullSource, takes the groundingSource
// branch, and DOES NOT FALL BACK. So a lens finding quoting the rescued rates should be judged
// ungrounded and deleted at audit-expert.ts:115 — the rescue deleting exactly what it rescued.
//
// Both flags are LIVE on the worker: AUDIT_WORKER_OCR=true · AUDIT_OCR_TABLE_CONFIRM=true.
//
// METHOD — PRODUCTION COMPOSITION, ONE LEAF STUB. The real `runAgenticExpert` runs; the real
// `assembleFullSource` builds the source; the ONLY thing stubbed is the model call (the leaf external),
// which submits two findings. Nothing about grounding is reimplemented here.
//
// DISCRIMINATOR, NOT A POSITIVE. A single arm showing "dropped" proves nothing — plenty of things drop
// findings. Two arms differing ONLY in groundingSource:
//   ARM 1 · PRODUCTION SHAPE   groundingSource = docs.join  (≠ fullSource) → grounding branch taken
//   ARM 2 · COUNTERFACTUAL     groundingSource = fullSource (identical)    → fall-through branch
// The WAGE finding must die in ARM 1 and live in ARM 2. If it dies in BOTH, something else is killing it
// and the attribution to isGrounded is WRONG. A CONTROL finding quoted from a document body must live in
// BOTH arms; if it dies anywhere, the harness is broken and no verdict is reportable.
import { runAgenticExpert, type CallModel, type RawFinding } from "../../src/lib/audit-expert";
import { assembleFullSource } from "../../src/lib/agentic-executor";
import { findInSource, type AuditToolContext } from "../../src/lib/audit-tools";
import type { AgenticDoc } from "../../src/lib/agentic-orchestrator";

const doc = (name: string, text: string): AgenticDoc => ({ name, bytes: Buffer.from(""), text });

// A two-document package — the ordinary shape. Multi-doc is what makes assembleFullSource emit the
// "==== DOCUMENT: n ====" delimiters that groundingSource lacks.
const DOCS: AgenticDoc[] = [
  doc("Solicitation 36C24626Q0724.pdf",
    "SECTION B - SUPPLIES OR SERVICES AND PRICE\n" +
    "The contractor shall furnish all labor, supervision, materials and equipment necessary to perform " +
    "grounds maintenance services at the medical center.\n" +
    "SECTION L - INSTRUCTIONS TO OFFERORS\n" +
    "Quotations shall be submitted electronically not later than 2:00 PM Central Time.\n"),
  doc("Attachment 2 - Wage Determination.pdf",
    "WAGE DETERMINATION NO. 2015-5271 REVISION NO. 24\n" +
    "OCCUPATION CODE - TITLE                 RATE\n" +
    "[scanned rate table - text layer unreliable]\n"),
];

// EXACTLY the production expressions, cited so drift is visible.
const CONFIRMED_BLOCK =                                                   // audit-executor-v3.ts:406
  `\n==== VISION-CONFIRMED WAGE RATES (Attachment 2 - Wage Determination.pdf) ====\n` +
  `11210 Laborer, Grounds Maintenance ................ 18.47\n` +
  `23370 General Maintenance Worker .................. 26.03\n`;
const FULL_SOURCE = assembleFullSource(DOCS) + CONFIRMED_BLOCK;           // :302 + :412
const GROUNDING_SOURCE = DOCS.map((d) => d.text).join("\n\n");            // :537

const WAGE_EXCERPT = "11210 Laborer, Grounds Maintenance ................ 18.47";
const CONTROL_EXCERPT = "Quotations shall be submitted electronically not later than 2:00 PM Central Time";

// ── PRE-ASSERTIONS · the probe must be MISCONSTRUCTED-PROOF before it is believed ────────────────────
const inFull = (s: string) => findInSource({ fullSource: FULL_SOURCE }, s).hits.length > 0;
const inGrounding = (s: string) => findInSource({ fullSource: GROUNDING_SOURCE }, s).hits.length > 0;
const pre = [
  ["wage excerpt IS in fullSource (the lens really can read it)", inFull(WAGE_EXCERPT), true],
  ["wage excerpt is NOT in groundingSource", inGrounding(WAGE_EXCERPT), false],
  ["control excerpt IS in fullSource", inFull(CONTROL_EXCERPT), true],
  ["control excerpt IS in groundingSource", inGrounding(CONTROL_EXCERPT), true],
  ["the two corpora actually differ", FULL_SOURCE !== GROUNDING_SOURCE, true],
] as const;
console.log("PRE-ASSERTIONS");
let preOk = true;
for (const [label, got, want] of pre) {
  const ok = got === want;
  preOk &&= ok;
  console.log(`  ${ok ? "✓" : "✗"} ${label}  (got ${got})`);
}
if (!preOk) { console.error("\n✗ PROBE MISCONSTRUCTED — the fixture does not have the shape the claim is about. No verdict.\n"); process.exit(1); }

// ── THE STUB · the ONLY external. Submits both findings on turn 1. ──────────────────────────────────
const SUBMITTED: RawFinding[] = [
  { requirement: "Service Contract Act wage floor for grounds-maintenance labor", citation: "Attachment 2 - Wage Determination",
    excerpt: WAGE_EXCERPT, kind: "other", controllability: "bidder_controls" },
  { requirement: "Quotation submission deadline", citation: "§L",
    excerpt: CONTROL_EXCERPT, kind: "submission", controllability: "bidder_controls" },
];
const callModel: CallModel = async () => ({ toolCalls: [], findings: SUBMITTED });

// A NON-coverage lens key, so the attachment-coverage seeding path is never entered and the result does
// not depend on ambient AUDIT_* env. The grounding gate at audit-expert.ts:115 is unflagged either way.
const SPEC = { key: "pricing_analyst", system: "probe" };

(async () => {
  const arm = async (label: string, groundingSource: string) => {
    const ctx: AuditToolContext = { fullSource: FULL_SOURCE, groundingSource };
    const r = await runAgenticExpert(SPEC, ctx, { callModel });
    const kept = new Set(r.findings.map((f) => f.excerpt));
    return { label, wage: kept.has(WAGE_EXCERPT), control: kept.has(CONTROL_EXCERPT), dropped: r.dropped };
  };

  const a1 = await arm("ARM 1 · PRODUCTION SHAPE (groundingSource = docs.join)", GROUNDING_SOURCE);
  const a2 = await arm("ARM 2 · COUNTERFACTUAL (groundingSource = fullSource)", FULL_SOURCE);

  console.log("\nRESULT");
  for (const a of [a1, a2])
    console.log(`  ${a.label}\n      wage finding: ${a.wage ? "KEPT" : "DROPPED"}   control finding: ${a.control ? "KEPT" : "DROPPED"}   dropped=${a.dropped}`);

  console.log("");
  if (!a1.control || !a2.control) {
    console.error("✗ HARNESS BROKEN — the control finding did not survive both arms. No verdict is reportable.\n");
    process.exit(1);
  }
  if (a1.wage && a2.wage) {
    console.log("✗ CLAIM REFUTED — the wage finding survives the production shape. isGrounded is not dropping it.\n");
    process.exit(0);
  }
  if (!a1.wage && !a2.wage) {
    console.error("✗ ATTRIBUTION WRONG — the wage finding dies in BOTH arms, so groundingSource is not what kills it.\n");
    process.exit(1);
  }
  if (!a1.wage && a2.wage) {
    console.log("✅ CLAIM CONFIRMED — arc-B's rescue is SELF-CANCELLING.");
    console.log("   The vision-confirmed wage rates are appended to fullSource 'for grounding' (audit-executor-v3.ts:406),");
    console.log("   the lens reads them, and isGrounded (audit-expert.ts:36-39) then deletes the finding that quotes them");
    console.log("   because it checks groundingSource ONLY and never falls back. Flipping ONLY groundingSource saves it.\n");
    process.exit(0);
  }
  console.error("✗ UNEXPECTED — wage survived ARM 1 but not ARM 2. Investigate before reporting anything.\n");
  process.exit(1);
})();
