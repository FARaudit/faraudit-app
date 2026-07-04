// Layer-1 (Brain card 264 Ruling 1) — notice-body ingest: load-bearing NEGATIVE + no-regression test. $0, deterministic (no model).
//   npx tsx scripts/audit-ai/test-layer1-notice-body-ingest.ts
// Proves the FA-148-resolved SAM notice body is now ingested into the engine fullSource as a first-class doc, WITHOUT
// regressing the fully-read class (file-carried §L/§M must still detect COMPLETE) and WITHOUT prematurely flipping the
// notice-body-resident class (80NSSC) to COMPLETE — it stays honest-INCOMPLETE until the Layer-3 agentic section-finder.
//
// Runs through the REAL pipeline (buildAgenticDocs → assembleFullSourceBudgeted → detectSections via readSection),
// never a mock, so a change to doc placement or the section-boundary primary-region logic fails this test.
import { buildAgenticDocs, assembleFullSourceBudgeted } from "@/lib/agentic-executor";
import { coreMissingFor } from "@/lib/audit-orchestrator";
import { readSection, requiresProposalSections, findInSource, type AuditToolContext } from "@/lib/audit-tools";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}\n      got ${g}\n      want ${w}`); }
};
const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// A validly posted Part-15 UCF solicitation FORM (headers present) — the fully-read class.
const UCF_FORM = "SECTION C - DESCRIPTION/SPECIFICATIONS\nThe contractor shall provide services.\nSECTION L - INSTRUCTIONS TO OFFERORS\nSubmit a technical volume and a price volume.\nSECTION M - EVALUATION FACTORS FOR AWARD\nAward on best value; technical is more important than price.";
// A SOW-only posted primary (the 80NSSC class — §L/§M were NOT in a posted form).
const SOW_ONLY = "STATEMENT OF WORK\n1. SCOPE. The contractor shall furnish the Rockland Piston Cylinder System per the specifications herein.\n2. The contractor shall deliver units in accordance with the delivery schedule.";
// The SAM notice body — NARRATIVE prose (no line-anchored SECTION headers), the real 80NSSC shape. It carries the
// substantive instructions/evaluation, but only the Layer-3 agentic finder (reads fullSource) can locate them.
const NOTICE_BODY = "This combined synopsis/solicitation is issued as a Request for Quote. Interested offerors shall submit a technical approach describing their proposed solution and a separately priced schedule no later than the response date. The Government will evaluate quotes on a lowest-price technically-acceptable basis; a quote that fails any salient characteristic will be found technically unacceptable. All FAR 52.212 provisions apply.";
const buf = (s: string) => Buffer.from(s, "utf8");

async function build(primaryText: string | null, body: string | null) {
  const docs = await buildAgenticDocs({
    primaryName: "primary solicitation",
    primaryBytes: primaryText != null ? buf(primaryText) : null,
    primaryText,
    attachments: null,
    noticeBody: body != null ? { text: body, name: "SAM Notice Body" } : null,
  });
  const fullSource = assembleFullSourceBudgeted(docs).source;
  return { docs, ctx: { fullSource } as AuditToolContext };
}

async function main() {
  console.log("── PLACEMENT: body AFTER the primary form, before attachments (load-bearing for section detection) ──");
  {
    const { docs } = await build(UCF_FORM, NOTICE_BODY);
    eq("primary form stays docs[0]", docs[0]?.name, "primary solicitation");
    eq("notice body is docs[1]", docs[1]?.name, "SAM Notice Body");
    ok("body has its own content bytes (hash source)", (docs[1]?.bytes?.length ?? 0) > 0);
  }
  {
    const { docs } = await build(null, NOTICE_BODY); // no posted form → body is primary
    eq("no form → notice body IS docs[0] (primary)", docs[0]?.name, "SAM Notice Body");
    eq("no form → single doc", docs.length, 1);
  }

  console.log("── NO REGRESSION: fully-read class (file-carried §L/§M) still COMPLETE with a body ingested ──");
  {
    const { ctx } = await build(UCF_FORM, NOTICE_BODY);
    ok("§L still detected in the primary form region", readSection(ctx, "L").present);
    ok("§M still detected in the primary form region", readSection(ctx, "M").present);
    eq("coreMissing → [] (COMPLETE — prepend-before-primary would have broken this)",
      coreMissingFor(ctx, { requiresLM: requiresProposalSections("Combined Synopsis/Solicitation") }), []);
    ok("the notice body is nonetheless present in fullSource", findInSource(ctx, "lowest-price technically-acceptable").hits.length > 0);
  }

  console.log("── THE TRIGGER: 80NSSC class stays honest-INCOMPLETE until Layer-3 (body ingested, but §L/§M not header-detected) ──");
  {
    const { ctx } = await build(SOW_ONLY, NOTICE_BODY);
    ok("§L NOT header-detected (narrative body → needs Layer-3)", !readSection(ctx, "L").present);
    ok("§M NOT header-detected (narrative body → needs Layer-3)", !readSection(ctx, "M").present);
    const missing = coreMissingFor(ctx, { requiresLM: requiresProposalSections("Solicitation") });
    ok("coreMissing is NON-EMPTY (honest INCOMPLETE, NOT false-COMPLETE)", missing.length > 0);
    ok("coreMissing names §L and §M", missing.includes("L") && missing.includes("M"));
    ok("but the body IS ingested into fullSource (so Layer-3 can find it — the whole point of L1)",
      findInSource(ctx, "salient characteristic").hits.length > 0);
  }

  console.log("── ZERO-ATTACHMENT notice-body-resident buy: body ingested, still honest-INCOMPLETE ──");
  {
    const { ctx } = await build(null, NOTICE_BODY);
    ok("body is the fullSource", findInSource(ctx, "technical approach").hits.length > 0);
    ok("coreMissing NON-EMPTY (no false-COMPLETE on a bare narrative body)",
      coreMissingFor(ctx, { requiresLM: requiresProposalSections("Combined Synopsis/Solicitation") }).length > 0);
  }

  console.log("── NEGATIVE CONTROLS: never fabricate a body doc ──");
  {
    const { docs } = await build(UCF_FORM, null); // fetch-failed / upload → no body threaded
    eq("no notice body → only the primary doc", docs.length, 1);
    eq("no notice body → docs[0] is the primary", docs[0]?.name, "primary solicitation");
  }
  {
    const { docs } = await build(UCF_FORM, "  \n  short  "); // trivially-short body (< 50 non-ws) → skipped
    eq("trivially-short body → NOT added (coverage read-failure, never fabricated)", docs.length, 1);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Layer-1 notice-body ingest: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
