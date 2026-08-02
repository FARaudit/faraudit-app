// LIVE proof for the ingest denominator reconciliation, on the real W50S6U26QA019 package.
//
// Runs the PRODUCTION assembler against live SAM twice — flag OFF then ON — and asserts:
//   OFF  reproduces the WORKER's measured 10/12 + overflow  (if it does not, this local run is not a faithful
//        instrument for the test and its ON result proves nothing — the self-check comes first)
//   ON   yields 10/10, no overflow, the 2 entries still LISTED and labelled superseded, and
//        agenticManifestComplete flipping false → true
//
// $0 — fetch + assemble only, NO model call. G2: fires no paid run.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_verify-denominator-live.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });

const NOTICE = "1e3e02dbe95e4561a522d902824060d5";
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } };

(async () => {
  const { fetchSolicitationByNoticeId } = await import("../../src/lib/sam");
  const { assembleSamDocumentSet } = await import("../../src/lib/sam-attachments");
  const { agenticManifestComplete } = await import("../../src/lib/audit-executor-v3");

  const sol = await fetchSolicitationByNoticeId(NOTICE);
  if (!sol) { console.log("notice not resolvable — cannot verify"); process.exit(1); }

  const run = async (on: boolean) => {
    if (on) process.env.AUDIT_INGEST_DENOMINATOR_RECONCILE = "true";
    else delete process.env.AUDIT_INGEST_DENOMINATOR_RECONCILE;
    const asm = (await assembleSamDocumentSet(sol.noticeId, sol.solicitationNumber, sol.resourceLinks)) as Record<string, any> | null;
    delete process.env.AUDIT_INGEST_DENOMINATOR_RECONCILE;
    return (asm?.ing ?? asm?.ingestion) as Record<string, any> | undefined;
  };

  console.log(`\nLIVE DENOMINATOR PROOF — ${sol.solicitationNumber} · v2 resourceLinks=${sol.resourceLinks?.length ?? 0}\n`);

  console.log(`FLAG OFF — must reproduce what the worker measured (self-check on the instrument)`);
  const off = await run(false);
  console.log(`  files_ingested=${off?.files_ingested} / files_total=${off?.files_total} · overflow=${off?.overflow ? "SET" : "none"}`);
  ok("OFF reproduces the worker's 10 of 12", off?.files_ingested === 10 && off?.files_total === 12);
  ok("OFF sets overflow (the phantom gap)", !!off?.overflow);
  ok("OFF ⇒ agenticManifestComplete FALSE — the false INCOMPLETE", agenticManifestComplete(off as never, false, true) === false);
  if (off?.files_ingested !== 10 || off?.files_total !== 12) {
    console.log(`\n  ⚠ the OFF run did NOT reproduce the worker — this local run is not a faithful instrument.\n    Stop: the ON result below proves nothing about production.\n`);
  }

  console.log(`\nFLAG ON — the fix`);
  const on = await run(true);
  console.log(`  files_ingested=${on?.files_ingested} / files_total=${on?.files_total} · overflow=${on?.overflow ? "SET" : "none"}`);
  ok("ON yields 10 of 10", on?.files_ingested === 10 && on?.files_total === 10);
  ok("ON clears overflow", !on?.overflow);
  ok("ON ⇒ agenticManifestComplete TRUE — no false INCOMPLETE", agenticManifestComplete(on as never, false, true) === true);

  const sup = ((on?.files ?? []) as Array<Record<string, any>>).filter((x) => x.superseded);
  ok("the 2 entries are STILL LISTED — never silently dropped", sup.length === 2);
  ok("and each says why, naming the HTTP status", sup.every((x) => /no longer posted on SAM \(HTTP 4\d\d\)/.test(String(x.reason ?? ""))));
  ok("no INGESTED document was excluded", ((on?.files ?? []) as Array<Record<string, any>>).filter((x) => x.ingested).length === 10);

  console.log(`\n  superseded entries:`);
  for (const s of sup) console.log(`    ${s.name}\n      → ${s.reason}`);

  console.log(`\nlive denominator proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
