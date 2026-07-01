// Card 191 — THE ONE PAID RUN (CEO-greenlit 2026-07-01). Live agentic audit over the SP3300-26-Q-0165
// negative anchor (mis-typed no_one_can_move socioeconomic set-aside) with the disposition guard ON in the
// RUN-ENV ONLY. Proves the wired disposition yields NEEDS_HUMAN_REVIEW (never false INELIGIBLE) and that the
// honest-fail class is not billed. NO retries on divergence — assert, capture, exit.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import fs from "fs";
// NB: audit-package (→ anthropic.ts) builds the API client from process.env AT MODULE-LOAD. Static ESM imports
// are hoisted ABOVE dotenv.config() above, so the client would see no key. Import it DYNAMICALLY inside main(),
// after config() has populated process.env.
async function main() {
  const { auditPackage } = await import("../../src/lib/audit-package");
  const { isHonestFail, billable, HONEST_FAIL_VERDICTS } = await import("../../src/lib/audit-billing");
  const guard = process.env.AUDIT_SETASIDE_OVERTYPE_GUARD;
  const noCharge = process.env.AUDIT_HONESTFAIL_NO_CHARGE;
  console.log("run-env flags →", { AUDIT_SETASIDE_OVERTYPE_GUARD: guard, AUDIT_HONESTFAIL_NO_CHARGE: noCharge });
  if (guard !== "true" || noCharge !== "true") { console.error("❌ run-env flags not both true — abort (no paid call)"); process.exit(2); }

  const path = "scripts/audit-ai/gold-sets/SP3300-26-Q-0165-FULL-SOURCE.txt";
  const src = fs.readFileSync(path, "utf8");
  console.log(`source: ${path} (${src.length} bytes)`);

  // Runaway-spend guard: bound total wall-clock. maxTurns (default 8) bounds per-expert. Abort → run fails → STOP.
  const signal = AbortSignal.timeout(6 * 60 * 1000);

  const t0 = Date.now();
  console.log("▶ launching auditPackage (null profile / null-world, PAID)…");
  const res = await auditPackage({ fullSource: src, bidderProfile: null, naics: null, setAside: null, signal });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const verdict = res.decision.verdict;
  const eligible = res.decision.eligible;
  const honestFail = isHonestFail({ verdict });
  const bill = billable(honestFail, true); // flag ON

  console.log("\n──────── RESULT ────────");
  console.log(JSON.stringify({
    verdict,
    eligible,
    honestFail,
    billable: bill,
    honestFailVerdictSet: [...HONEST_FAIL_VERDICTS],
    coverageComplete: res.inputs?.coverageComplete,
    conflict: res.conflict,
    findings: res.findings?.length,
    sectionsRead: res.sectionsRead,
    reason: res.decision.reason,
    wallClockSecs: Number(secs),
  }, null, 2));

  // Pre-declared asserts (card 191 §2)
  const a = verdict === "NEEDS_HUMAN_REVIEW";
  const b = eligible !== false;
  const c = bill === false;
  console.log("\n──────── ASSERTS ────────");
  console.log(`a) verdict === NEEDS_HUMAN_REVIEW ............ ${a ? "✅" : "❌"} (${verdict})`);
  console.log(`b) eligible !== false ....................... ${b ? "✅" : "❌"} (${JSON.stringify(eligible)})`);
  console.log(`c) honest-fail → NOT billed (billable===false) ${c ? "✅" : "❌"} (billable(isHonestFail("${verdict}"),true)===${bill})`);
  const allPass = a && b && c;
  console.log(`\n${allPass ? "✅ ALL ASSERTS PASS — disposition proven live." : "❌ DIVERGENCE — STOP. No retry, no second paid call."}`);
  process.exit(allPass ? 0 : 3);
}

main().catch((e) => { console.error("❌ RUN ERROR (STOP, no retry):", e?.message || e); process.exit(1); });
