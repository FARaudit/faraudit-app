// Phase-1 SHADOW · ACCEPTANCE CORPUS v1 (Brain #599-2) — the standing eval gold-set (#594 gap), v1.
// Purpose-built ~20-run set from BANKED REAL MATERIAL (Rule 64) testing BINDING-c cleanly: each specimen carries an
// EXPECTED verdict + category. One INELIGIBLE specimen is CONSTRUCTED from a real banked bar + an adversarial
// closed-world profile (a test fixture over real findings/source — no fabricated facts). Shadow-vs-expected table.
process.env.AUDIT_SELF_CLEARABLE_PACKAGE = "true";
import { readFileSync, readdirSync } from "fs";
(async () => {
  const { deriveShadowVerdict } = await import("../../src/lib/audit-decide");
  const dir = "scripts/audit-ai/run-records";
  const all = readdirSync(dir).filter((f) => f.endsWith(".json") && !/panel-findings-bank|panel-characterization|smoke|REMOTE_/.test(f));
  const byId = (frag: string) => { const f = all.find((x) => x.includes(frag)); if (!f) throw new Error(`no record for ${frag}`); return JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).result.inputs; };
  const naicsOf = (inp: any) => { const m = (inp.source || "").match(/NAICS\s*(?:code)?[:\s#]*([0-9]{5,6})/i); return m ? m[1] : null; };

  type Spec = { name: string; category: string; expected: string | string[]; inp: any; naics?: string | null };
  const specs: Spec[] = [
    // ── BIDDABLE → COMMIT (committal on genuinely self-clearable packages) ──
    { name: "LBJ 40fd02ce", category: "biddable/self-clearable", expected: "BID_WITH_CAUTION", inp: byId("40fd02ce"), naics: "561320" },
    { name: "FA303 df202699", category: "biddable/self-clearable", expected: ["BID_WITH_CAUTION", "BID"], inp: byId("df202699") },
    { name: "FA442 11d3815e", category: "biddable/self-clearable", expected: ["BID_WITH_CAUTION", "BID"], inp: byId("11d3815e") },
    { name: "FA442 5250f4c2", category: "biddable/self-clearable", expected: ["BID_WITH_CAUTION", "BID"], inp: byId("5250f4c2") },
    { name: "FA442 8b03b538", category: "biddable/self-clearable", expected: ["BID_WITH_CAUTION", "BID"], inp: byId("8b03b538") },
    // ── GENUINE-INCOMPLETE → honest-fail INCOMPLETE ──
    { name: "697DCK 9ce4e3fb", category: "genuine-incomplete", expected: "INCOMPLETE", inp: byId("9ce4e3fb") },
    { name: "FA8137 bf8832de", category: "genuine-incomplete (manifest)", expected: "INCOMPLETE", inp: byId("bf8832de") },
    // ── REAL UNCOVERED BAR (#557-class shape) → NHR ──
    { name: "LBJ 45f9bacd", category: "uncovered-disqualifier", expected: "NEEDS_HUMAN_REVIEW", inp: byId("45f9bacd"), naics: "561320" },
    { name: "FA8137 6439ac27", category: "uncovered-disqualifier", expected: "NEEDS_HUMAN_REVIEW", inp: byId("6439ac27") },
    { name: "FA8137 be69ce16", category: "uncovered-disqualifier", expected: "NEEDS_HUMAN_REVIEW", inp: byId("be69ce16") },
    { name: "70B01C 999e909b", category: "real-bar/NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("999e909b") },
    // ── BINDING-a UNKNOWN (untyped deciding bar) → NHR ──
    { name: "FA8137 316acfa5", category: "BINDING-a untyped→NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("316acfa5") },
    { name: "FA303 e83887af", category: "BINDING-a untyped→NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("e83887af") },
    { name: "FA303 7bf73cbd", category: "BINDING-a untyped→NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("7bf73cbd") },
    { name: "SPMYM226 (real credential bar)", category: "non-self-clearable/NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("SPMYM226") },
  ];

  // ── CONSTRUCTED INELIGIBLE (real bar + adversarial CLOSED-WORLD profile; Rule 64: real findings/source, test profile) ──
  const base = JSON.parse(JSON.stringify(byId("5d0477e7"))); // FA303 run the shadow commits to BWC on 9 self-cert socioeconomic bars
  const barWithAttr = (base.findings as any[]).find((f) => f.kind === "eligibility_bar" && f.requiredAttribute);
  if (barWithAttr) {
    base.bidderProfile = { closedWorld: true, satisfiedAttributes: [], held: [], name: "TEST: small biz lacking the required program cert" };
    specs.push({ name: `CONSTRUCTED INELIGIBLE (real bar '${String(barWithAttr.requiredAttribute).slice(0,24)}' + closed-world firm lacking it)`, category: "real-INELIGIBLE preserved", expected: ["INELIGIBLE", "NEEDS_HUMAN_REVIEW"], inp: base });
  }

  // ── run ──
  let pass = 0; const rows: any[] = [];
  for (const s of specs) {
    let sv: any; try { sv = deriveShadowVerdict(s.inp, { naics: s.naics ?? naicsOf(s.inp) }); } catch (e) { sv = { verdict: "THREW", reason: String(e) }; }
    const exp = Array.isArray(s.expected) ? s.expected : [s.expected];
    const ok = exp.includes(sv.verdict);
    if (ok) pass++;
    rows.push({ ok, name: s.name, cat: s.category, expected: exp.join("|"), got: sv.verdict, reason: (sv.reason || "").slice(0, 54) });
  }
  console.log(`\n${"".padEnd(2)} ${"SPECIMEN".padEnd(40)} ${"CATEGORY".padEnd(28)} ${"EXPECTED".padEnd(24)} GOT`);
  console.log("─".repeat(150));
  for (const r of rows) console.log(`${r.ok ? "✅" : "❌"} ${r.name.padEnd(40)} ${r.cat.padEnd(28)} ${r.expected.padEnd(24)} ${r.got.padEnd(18)} ${r.reason}`);
  console.log("\n" + "═".repeat(50));
  console.log(`ACCEPTANCE CORPUS v1: ${pass}/${rows.length} specimens match expected`);
  const commit = new Set(["BID", "BID_WITH_CAUTION"]);
  const falseBid = rows.filter((r) => commit.has(r.got) && (r.cat.includes("INELIGIBLE") || r.cat.includes("uncovered") || r.cat.includes("BINDING-a") || r.cat.includes("non-self")));
  console.log(`FALSE-BIDs (committed a specimen expected to escalate/fail): ${falseBid.length} ${falseBid.length ? "❌ " + falseBid.map((r) => r.name).join("; ") : "✅"}`);
  console.log(`biddable specimens committed: ${rows.filter((r) => r.cat.includes("biddable") && commit.has(r.got)).length}/${rows.filter((r) => r.cat.includes("biddable")).length}`);
  process.exit(pass === rows.length ? 0 : 1);
})();
