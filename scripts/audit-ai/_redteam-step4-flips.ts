/* RED-TEAM probe 2 — PANEL step 4. AUTHORITATIVE-pole (deriveVerdict) flip census over the banked run-records
 * under AUDIT_RETIRE_VERBATIM_VETO OFF vs ON. READ-ONLY. Deterministic. No I/O beyond reading the bank. */
import { readFileSync, readdirSync } from "fs";
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const dir = "scripts/audit-ai/run-records";
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !/panel-findings-bank|panel-characterization|smoke|REMOTE_/.test(f));
  const floored = (inp: any) => ({ ...inp, findings: applyClauseKeyedTypingFloor(inp.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) });
  let flips = 0, ok = 0, threw = 0;
  const commit = new Set(["BID", "BID_WITH_CAUTION"]);
  for (const f of files) {
    let inp: any;
    try { inp = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).result?.inputs; } catch { continue; }
    if (!inp) continue;
    const run = () => { try { return deriveVerdict(floored(inp)); } catch (e) { threw++; return { verdict: "THREW", reason: String(e).slice(0, 80) } as any; } };
    delete process.env.AUDIT_RETIRE_VERBATIM_VETO;
    const off = run();
    process.env.AUDIT_RETIRE_VERBATIM_VETO = "true";
    const on = run();
    delete process.env.AUDIT_RETIRE_VERBATIM_VETO;
    if (off.verdict === on.verdict) { ok++; continue; }
    flips++;
    const toCommittal = !commit.has(off.verdict) && commit.has(on.verdict);
    console.log(`FLIP${toCommittal ? " ⚠ ESCALATION→COMMITTAL" : ""}  ${f.slice(0, 46)}`);
    console.log(`   OFF ${off.verdict.padEnd(18)} :: ${(off.reason || "").slice(0, 120)}`);
    console.log(`   ON  ${on.verdict.padEnd(18)} :: ${(on.reason || "").slice(0, 120)}\n`);
  }
  console.log(`records=${files.length} identical=${ok} flips=${flips} threw=${threw}`);
})();
