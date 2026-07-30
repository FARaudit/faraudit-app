/* RED-TEAM Unit6 R3 — invariance harness. Verdict-path dedup must not move a pole or change eligible. */
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";

type VI = Parameters<typeof deriveVerdict>[0];
const mkVI = (findings: TypedFinding[], bidderProfile: BidderProfile | null): VI =>
  ({ findings, bidderProfile, coverageComplete: true, verifierSound: true, conflict: false } as VI);

function checkInvariant(name: string, findings: TypedFinding[], profiles: (BidderProfile | null)[]): boolean {
  const deduped = applyFindingDedup(findings, { enabled: true });
  let ok = true;
  for (const p of profiles) {
    const full = deriveVerdict(mkVI(findings, p));
    const dd = deriveVerdict(mkVI(deduped, p));
    if (full.verdict !== dd.verdict || full.eligible !== dd.eligible) {
      ok = false;
      console.log(`  BREAK [${name}] profile=${p ? JSON.stringify(p.satisfiedAttributes) + (p.closedWorld ? "(cw)" : "(ow)") : "null"}`);
      console.log(`    full : ${full.verdict} eligible=${full.eligible}`);
      console.log(`    dedup: ${dd.verdict} eligible=${dd.eligible}`);
      console.log(`    full-len=${findings.length} dedup-len=${deduped.length}`);
    }
  }
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  return ok;
}

// ---- REAL RECORD ----
import fs from "fs";
const rec = JSON.parse(fs.readFileSync("/tmp/seq2-runrecord.json", "utf8"));
const real: TypedFinding[] = rec.result.findings;

const nullP: BidderProfile | null = null;
const owEmpty: BidderProfile = { satisfiedAttributes: [], closedWorld: false } as BidderProfile;
const cwEmpty: BidderProfile = { satisfiedAttributes: [], closedWorld: true } as BidderProfile;
const cwNmrFail: BidderProfile = { satisfiedAttributes: ["nonmanufacturer:noncompliant"], closedWorld: true } as BidderProfile;
const owNmrOk: BidderProfile = { satisfiedAttributes: ["nonmanufacturer:compliant"], closedWorld: false } as BidderProfile;

const profiles = [nullP, owEmpty, cwEmpty, cwNmrFail, owNmrOk];

let allOk = true;
allOk = checkInvariant("REAL-RECORD-93", real, profiles) && allOk;

console.log("\n=== FINAL:", allOk ? "ALL INVARIANT" : "INVARIANCE BROKEN", "===");
