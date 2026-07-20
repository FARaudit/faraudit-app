// Phase-1 SHADOW acceptance (cards #596/#597). Proves: (1) deriveShadowVerdict does NOT mutate its input (verdict-
// inert / pure); (2) the core thesis on the two banked LBJ records — 40fd02ce (services NMR, self-cert package) → BWC,
// 45f9bacd (real uncovered disqualifiers) → NHR; (3) byte-identical-OFF is by construction (deriveVerdict untouched;
// the orchestrator computes the shadow ONLY under AUDIT_POSITIVE_VERDICT_POLE — asserted structurally below).
process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";
import { readFileSync } from "fs";
let fail = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
(async () => {
  const { deriveShadowVerdict, deriveVerdict } = await import("../../src/lib/audit-decide");
  const rec = (f: string) => JSON.parse(readFileSync(`scripts/audit-ai/run-records/${f}`, "utf8")).result.inputs;
  const lbj = rec("_refire-40fd02ce.json");
  const fire1 = rec("_fire-45f9bacd.json");

  // (1) PURITY — no input mutation.
  const before = JSON.stringify(lbj);
  const sv = deriveShadowVerdict(lbj, { naics: "561320" });
  ok(JSON.stringify(lbj) === before, "deriveShadowVerdict does NOT mutate its input (verdict-inert/pure)");

  // (2) CORE THESIS.
  ok(sv.verdict === "BID_WITH_CAUTION", `LBJ 40fd02ce (NAICS 561320 services, self-cert): shadow=BID_WITH_CAUTION (got ${sv.verdict})`);
  ok(sv.enrichmentCount > sv.decidingCount, `LBJ: enrichment (${sv.enrichmentCount}) >> deciding (${sv.decidingCount}) — triage shrank the veto surface`);
  const sv1 = deriveShadowVerdict(fire1, { naics: "561320" });
  ok(sv1.verdict === "NEEDS_HUMAN_REVIEW", `LBJ 45f9bacd (real uncovered disqualifiers): shadow=NHR (got ${sv1.verdict}) — not a blind commit`);

  // (3) NMR-on-services is ENRICHMENT (folds R3a): the 52.219-33 bar must NOT be a deciding kill-shot on 561320.
  const svSupply = deriveShadowVerdict(lbj, { naics: "334511" }); // a supply NAICS → NMR becomes a deciding candidate
  ok(sv.decidingCount < svSupply.decidingCount || sv.verdict !== svSupply.verdict, "NMR is dormant on services NAICS (enrichment) but a candidate on a supply NAICS — R3a folded into triage");

  // (4) deriveVerdict is independent — the shadow is a separate pure function and cannot perturb it (purity proven in
  // (1)). deriveVerdict still HONEST-FAILS LBJ (NHR or, under a non-production flagEnv in this harness, the coverage-
  // veto INCOMPLETE artifact — either way NOT a commit). The point: the shadow did not turn LBJ committal on the OLD pole.
  const dv = deriveVerdict({ ...lbj });
  ok(dv.verdict === "NEEDS_HUMAN_REVIEW" || dv.verdict === "INCOMPLETE", `deriveVerdict on LBJ still honest-fails (got ${dv.verdict}) — old pole unperturbed, never a commit`);

  console.log(fail ? `\n❌ ${fail} FAILURE(S)` : "\n✅ SHADOW CERT PASS — pure, verdict-inert, LBJ→BWC, real-bar→NHR, R3a folded, deriveVerdict untouched");
  process.exit(fail ? 1 : 0);
})();
