// $0 gate for the near-duplicate DOCUMENT dedup (FA-INGEST, 36C25626Q0947).
//
// Root cause proven live: the base solicitation + its SF-30 amendments are named
// as just "<sol> - Final.pdf" / "<sol> - Amendment 0001.pdf" / "…0002.pdf".
// dedupeKey strips the role token AND its number, so all three collapsed to the
// bare sol number and BOTH amendments were dropped as "near-duplicate of Final" —
// silently losing amendment 0001's extended offer due date (Final read 07-07,
// amendment moved it to 07-09). Guard A (never group a key that is empty or the
// bare sol #) + Guard C (distinct amendment numbers never share a group) fix it.
//
// Load-bearing negative: the DTS "RFQ CLIN Structure" duplicate (a real content
// title, no amendment #) must STILL collapse — Guard A/C never touch it.
//
// Run: npx tsx scripts/audit-ai/test-doc-dedupe-gate.ts
import { planDocumentOrder, dedupeNearDuplicates } from "@/lib/sam-attachments";
import type { AttachmentManifestEntry } from "@/lib/sam-attachments";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, got: unknown, exp: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(exp)) pass++;
  else fails.push(`${label}: got ${JSON.stringify(got)} != ${JSON.stringify(exp)}`);
};

let idc = 0;
const F = (name: string, sizeBytes: number): AttachmentManifestEntry => ({
  name, sizeBytes, resourceId: `r${++idc}`, url: `https://x/${++idc}`,
});
const droppedNames = (plan: ReturnType<typeof planDocumentOrder>, sol: string | null) =>
  dedupeNearDuplicates(plan, sol).dropped.map((d) => d.entry.name).sort();

// ── 1 · BUG REPRO → FIX: the reported 36C25626Q0947 base/amendment family ──
const sol = "36C25626Q0947";
const family = planDocumentOrder([
  F("36C25626Q0947 - Final.pdf", 433725),
  F("36C25626Q0947 - Amendment 0001.pdf", 124744),
  F("36C25626Q0947 - Amendment 0002.pdf", 130000),
], sol);
// Final resolves to the FORM, the two SF-30s to amendments — all three distinct.
ok("family roles = form + amendment + amendment",
  family.map((e) => e.role).sort(), ["amendment", "amendment", "form"]);
ok("FIXED: base + both amendments all kept (0 dropped) when sol # is known",
  droppedNames(family, sol), []);
// Guard-A witness — isolate the sol-number guard with NO amendment numbers in
// play (so Guard C can't help): two role-token copies of the base ("Final" vs
// "Conformed") both key to the bare sol #. WITHOUT the sol # they collapse (the
// pre-fix behaviour — a distinct binding copy lost); WITH it, Guard A keeps both.
const baseTokens = planDocumentOrder([
  F("36C25626Q0947 - Final.pdf", 433725),
  F("36C25626Q0947 - Conformed.pdf", 200000),
], sol);
ok("Guard A: without the sol #, two sol-# base copies collapse (1 dropped)",
  droppedNames(baseTokens, null).length, 1);
ok("Guard A: WITH the sol #, both base copies kept (0 dropped)",
  droppedNames(baseTokens, sol), []);

// ── 2 · DTS PRESERVED (load-bearing negative): a genuine duplicate still merges ──
const dtsPlan = planDocumentOrder([
  F("RFQ CLIN Structure.pdf", 20000),
  F("RFQ CLIN Structure.pdf", 20000), // identical redelivered copy
], sol);
ok("DTS: two identical 'RFQ CLIN Structure' copies still collapse (1 dropped)",
  droppedNames(dtsPlan, sol).length, 1);

// ── 3 · Guard C: distinct amendments named WITHOUT the sol # never merge ──
const namedSeries = planDocumentOrder([
  F("Solicitation Amendment 0001.pdf", 90000),
  F("Solicitation Amendment 0002.pdf", 95000),
], sol);
ok("Guard C: 'Amendment 0001' vs '0002' (no sol # in name) both kept (0 dropped)",
  droppedNames(namedSeries, sol), []);

// ── 3b · Guard C token-symmetry (expert-panel finding): a binding attachment distinguished
//        ONLY by a revision/version token that dedupeKey strips a number from must NOT collapse. ──
for (const [tok, a, b] of [["Revision", "1", "2"], ["Rev", "1", "2"], ["v", "1", "2"], ["Version", "1", "2"]] as const) {
  const rev = planDocumentOrder([
    F(`Statement of Work ${tok} ${a}.pdf`, 90000),
    F(`Statement of Work ${tok} ${b}.pdf`, 80000), // the revision is SMALLER (scope removed) — the dangerous case
  ], sol);
  ok(`Guard C: "SOW ${tok} ${a}" vs "${tok} ${b}" both kept (no silent binding-doc drop)`,
    droppedNames(rev, sol), []);
}

// ── 4 · true duplicate of the SAME amendment number DOES still merge ──
const sameAmd = planDocumentOrder([
  F("Wage Determination Amendment 0001.pdf", 50000),
  F("Wage Determination Amendment 0001 copy.pdf", 50000),
], sol);
ok("same amendment # + same title → still one dropped (genuine dup collapses)",
  droppedNames(sameAmd, sol).length, 1);

console.log(`doc-dedupe gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) {
  console.log("FAILURES:");
  fails.forEach((x) => console.log("  ❌ " + x));
  process.exit(1);
}
console.log("✅ ALL PASS — base + amendments never collapse (deadline change preserved); genuine dups still merge.");
