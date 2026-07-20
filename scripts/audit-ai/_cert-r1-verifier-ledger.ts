// R1 · card #592 acceptance — VERIFIER LEDGER capture.
// Proves: (1) flag-OFF (AUDIT_BANK_RUN_RECORD unset) → VerifyResult carries NO `ledger` key (byte-identical shape);
//         (2) flag-ON → ledger present with the correct failureMode + per-claim disposition + mechanical cause for
//             each of the four unsound paths: residue_unresolved · skeptic_throw · zero_grounded · sound.
// Injected stub skeptic ($0). Run: npx tsx scripts/audit-ai/_cert-r1-verifier-ledger.ts
import { makeAgenticVerifier, type SkepticFn } from "../../src/lib/audit-verifier";
let fail = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

// Minimal ctx: findInSource just checks substring presence in fullSource → excerpts below are all present.
const F = (i: number, over = false): any => ({ id: `f${i}`, requirement: `req ${i}`, citation: `§${i}`, excerpt: `EX${i}`, kind: over ? "boilerplate" : "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "test" });
const findings = [F(0), F(1), F(2, true)]; // 2 verdict-driving (eligibility_bar) + 1 informational (boilerplate)
const ctx: any = { fullSource: "EX0 EX1 EX2" };

// Skeptic that RULES 0 and 2 but leaves 1 UNRULED → residue. (index 1 = verdict-driving → sinks soundness)
const residueSkeptic: SkepticFn = async () => [{ index: 0, upheld: true, reason: "ok" }, { index: 2, upheld: true, reason: "ok" }];
const throwSkeptic: SkepticFn = async () => { throw new Error("structured parse-fail (simulated)"); };
const upholdAll: SkepticFn = async (_c, fs) => fs.map((_, i) => ({ index: i, upheld: true, reason: "ok" }));

(async () => {
  // (1) FLAG-OFF — no ledger key at all
  delete process.env.AUDIT_BANK_RUN_RECORD;
  const off = await makeAgenticVerifier(residueSkeptic)(ctx, findings, {});
  ok(!("ledger" in off), "flag-OFF: VerifyResult has NO `ledger` key (byte-identical shape)");
  ok(off.sound === false, "flag-OFF: residue (index 1 unruled, verdict-driving) → sound=false (unchanged behavior)");

  // (2) FLAG-ON — residue_unresolved
  process.env.AUDIT_BANK_RUN_RECORD = "true";
  const on = await makeAgenticVerifier(residueSkeptic)(ctx, findings, {});
  const L = on.ledger!;
  ok(!!L, "flag-ON: ledger present");
  ok(L.failureMode === "residue_unresolved", `flag-ON residue: failureMode=residue_unresolved (got ${L.failureMode})`);
  ok(JSON.stringify(L.unresolvedIndices) === "[1]", `flag-ON residue: unresolvedIndices=[1] (got ${JSON.stringify(L.unresolvedIndices)})`);
  const r1 = L.rulings.find((r) => r.index === 1)!;
  ok(r1.disposition === "unresolved" && r1.cause === "no_ruling_returned" && r1.verdictDriving === true, "flag-ON residue: index-1 row = unresolved/no_ruling_returned/verdictDriving");
  ok(L.rulings.find((r) => r.index === 0)!.disposition === "upheld", "flag-ON residue: index-0 = upheld");
  ok(on.sound === false, "flag-ON residue: sound=false (verdict-inert — same as flag-off)");

  // (3) FLAG-ON — skeptic_throw (whole-set), throwMessage carries the sub-type
  const thrown = await makeAgenticVerifier(throwSkeptic)(ctx, findings, {});
  ok(thrown.ledger?.failureMode === "skeptic_throw", "flag-ON throw: failureMode=skeptic_throw");
  ok(!!thrown.ledger?.throwMessage?.includes("parse-fail"), "flag-ON throw: throwMessage carries the throw sub-type");
  ok(thrown.ledger?.rulings.every((r) => r.cause === "skeptic_throw"), "flag-ON throw: every claim cause=skeptic_throw");
  ok(thrown.sound === false, "flag-ON throw: sound=false (unchanged)");

  // (4) FLAG-ON — zero_grounded
  const zg = await makeAgenticVerifier(upholdAll)({ fullSource: "nothing matches" }, findings, {});
  ok(zg.ledger?.failureMode === "zero_grounded", "flag-ON zero-grounded: failureMode=zero_grounded");
  ok(zg.sound === false, "flag-ON zero-grounded: sound=false (unchanged)");

  // (5) FLAG-ON — sound (all ruled + upheld)
  const good = await makeAgenticVerifier(upholdAll)(ctx, findings, {});
  ok(good.ledger?.failureMode === "sound", "flag-ON sound: failureMode=sound");
  ok(good.sound === true, "flag-ON sound: sound=true");

  console.log(fail ? `\n❌ ${fail} FAILURE(S)` : "\n✅ R1 LEDGER CERT PASS — capture-only, verdict-inert, all 4 causes typed");
  process.exit(fail ? 1 : 0);
})();
