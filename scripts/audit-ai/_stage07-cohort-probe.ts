// $0 READ-ONLY COHORT PROBE — how often does Rule 70's cap-not-mute actually release? 2026-08-06.
// Drives the REAL gateV2Outcome over every banked run record carrying a coverageV2. No model call, no write.
import { readdirSync, readFileSync } from "node:fs";
import { gateV2Outcome, hasLongLeadCredential, hasPreAwardPossession } from "../../src/lib/audit-gate-v2";

const DIR = "scripts/audit-ai/run-records";
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

let withCov = 0, capNhr = 0, released = 0, mutedCc = 0, mutedFf = 0;
let ffSoloMute = 0;                                   // bucket muted by firm_fact where MOST items are uncovered_obligation
const ffQuotes: string[] = [];
const bondMutes: string[] = [];

for (const f of files) {
  let rec: { result?: { inputs?: { coverageV2?: never; findings?: never } } };
  try { rec = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")); } catch { continue; }
  const inp = rec?.result?.inputs;
  const cov = inp?.coverageV2 as undefined | { disqualifierUncovered?: Array<{ obligation: string }> };
  if (!cov) continue;
  withCov++;
  const out = gateV2Outcome(cov as never, { findings: (inp?.findings ?? []) as never });
  if (out.cap !== "NEEDS_HUMAN_REVIEW") continue;
  capNhr++;
  if (out.kind === "uncovered_obligation") { released++; continue; }
  if (out.kind === "credential_conditional") mutedCc++;
  if (out.kind === "firm_fact_bar") {
    mutedFf++;
    // which single item did it, and would the bucket otherwise have released?
    const items = cov.disqualifierUncovered ?? [];
    const culprits = items.filter((d) => hasLongLeadCredential(d.obligation) || hasPreAwardPossession(d.obligation));
    const perItem = items.map((d) => gateV2Outcome({ ...(cov as object), disqualifierUncovered: [d] } as never, { findings: (inp?.findings ?? []) as never }).kind);
    const nUncovered = perItem.filter((k) => k === "uncovered_obligation").length;
    if (nUncovered >= items.length - 1 && items.length > 1) ffSoloMute++;
    for (const c of culprits.slice(0, 2)) {
      ffQuotes.push(`${f.slice(0, 26)} | ${c.obligation.slice(0, 88)}`);
      if (/\bbond|surety/i.test(c.obligation)) bondMutes.push(f.slice(0, 26));
    }
  }
}

console.log(`banked records with coverageV2:            ${withCov}`);
console.log(`  of those, gateV2 cap = NHR:              ${capNhr}`);
console.log(`    RELEASED to cap (uncovered_obligation): ${released}`);
console.log(`    MUTED  credential_conditional:          ${mutedCc}`);
console.log(`    MUTED  firm_fact_bar:                   ${mutedFf}`);
console.log(`      ...of which ONE item muted an otherwise-releasable bucket: ${ffSoloMute}`);
console.log(`\nbond/surety-driven mutes: ${bondMutes.length} occurrence(s) across ${new Set(bondMutes).size} record(s)`);
console.log(`\n--- firm_fact culprit obligations ---`);
for (const q of ffQuotes.slice(0, 25)) console.log("  " + q);

console.log(`\n--- regex sanity: is a bid bond a "long-lead scarce credential"? ---`);
for (const s of [
  "a bid bond guarantee shall render your bid non-responsive.",
  "Offeror must possess a Top Secret facility clearance at time of award.",
  "bidder shall furnish payment and performance bonds within 10 days of award.",
  "must maintain an active SAM registration.",
]) console.log(`  longLead=${String(hasLongLeadCredential(s)).padEnd(5)} preAward=${String(hasPreAwardPossession(s)).padEnd(5)} ${s.slice(0, 70)}`);
