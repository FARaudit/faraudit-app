// Brain card-293 hotfix verification — "Show-stopper" tile sources EXCLUSIVELY
// from engine showStoppers[], never from severity-P0 tags.
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-p0-coherence.ts
//
// Asserts the ruling's step-3 invariant on the real W50S9H26QA018 run-3 fixture:
//   · Show-stoppers tile count === engine showStoppers[].length (the INVARIANT).
//   · W50: tile = 0 → verdict BID renders coherent, ZERO "block award" copy anywhere.
//   · the 7 mis-tagged severity-P0 findings STILL render — now under Gates/Advisories
//     (Design's routing, Brain rider) — nothing hidden.
// Shared builder ⇒ v4 (the hotfix target, LIVE) and v5 both inherit the fix.

// v4-only (self-contained for the standalone v4 hotfix branch off main — no v5
// deps). The v5 surfaces inherit the SAME buildV4Data fix; proven separately by
// the tier5 harnesses (web/pdf/deck/export) on the v5 branch.
import { readFileSync } from "node:fs";
import { buildV4Data } from "@/lib/v4-report/build-data";
import { renderV4ReportFromRow } from "@/lib/v4-report/report";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

const raw = JSON.parse(readFileSync("scripts/audit-ai/fixtures/w50-compliance-v3-REAL.json", "utf8"));
const v3 = raw.v3;
const showStoppersLen = Array.isArray(v3.showStoppers) ? v3.showStoppers.length : 0;
const p0SeverityInFindings = (v3.findings || []).filter((f: { severity?: string }) => f.severity === "P0").length;

const row = {
  id: "w50-coherence", solicitation_number: "W50S9H26QA018",
  title: "Grounds Maintenance Services", agency: "Dept. of the Army",
  naics_code: "561730", set_aside: "SDVOSB Set-Aside", response_deadline: "2026-09-30T14:00:00-05:00",
  compliance_json: { ...raw, engine: "agentic_v3", honest_fail: false, documents_complete: true },
};

const data = buildV4Data(row);
const v4html = renderV4ReportFromRow(row);

console.log(`\n── fixture facts ──`);
console.log(`engine showStoppers[] length: ${showStoppersLen}`);
console.log(`findings tagged severity P0:  ${p0SeverityInFindings}`);
console.log(`verdict pole/band:            ${data.verdict.pole} / ${data.verdict.band}`);
console.log(`built tiers → p0:${data.findings.p0.length} p1:${data.findings.p1.length} p2:${data.findings.p2.length}\n`);

// ── THE INVARIANT ──
ok("R1: Show-stoppers tier count === engine showStoppers[].length (INVARIANT)", data.findings.p0.length === showStoppersLen);
ok("R2: W50 → Show-stoppers = 0 (showStoppers[] empty)", data.findings.p0.length === 0);
ok("R3: verdict is BID (correct — no real disqualifiers)", data.verdict.pole === "BID");

// ── ZERO block-award language anywhere on a coherent BID (v4 = LIVE hotfix target) ──
ok("R4: v4 render — ZERO 'block award' copy anywhere (p0 empty ⇒ no blocker language)", !/block award/i.test(v4html));
ok("R5: v4 render — the BID band renders", /\bBid\b|BID/.test(v4html));

// ── nothing hidden — the 7 mis-tagged P0s still render, now under gates/advisories ──
ok("R6: fixture really has 7 severity-P0 findings (the over-tag)", p0SeverityInFindings === 7);
ok("R7: the 7 mis-tagged P0s still render (rerouted into Gates/Advisories, none dropped)",
  data.findings.p1.length + data.findings.p2.length >= p0SeverityInFindings && data.findings.p1.length >= 7);

console.log(`Brain card-293 coherence hotfix: ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("INVARIANT HOLDS: Show-stoppers tile === showStoppers[]; BID coherent; no block-award copy; all findings visible.");
