// C.e — SINGLE COMPLETENESS TRUTH negatives (C-1 / C-13). $0, deterministic, NO engine calls.
//   npx tsx scripts/audit-ai/test-cgroup-single-truth.ts
//
// The document-completeness signal is threaded into VerdictInputs and caps EVERY pole to INCOMPLETE. Load-bearing
// negative (Brain C.e): documents_complete=false + coverageComplete=true ⇒ INCOMPLETE, never BID (and never a
// committal verdict either — an unread binding doc could carry OR waive a bar).

import { deriveVerdict } from "@/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (l: string, c: boolean) => { if (c) pass++; else { fails.push(l); console.log(`  [FAIL] ${l}`); } };
const base = (over: Partial<VerdictInputs>): VerdictInputs => ({ findings: [], bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, ...over });

// A would-be disqualifying bar (eligibility) — used to prove even a committal-bound input is capped.
const barFinding: TypedFinding = { id: "bar#0", requirement: "facility clearance required", citation: "§H", excerpt: "the offeror shall hold a TOP SECRET facility clearance", grounded: true, lens: "ko", kind: "eligibility_bar", controllability: "bidder_cannot_move", requiredAttribute: "facility_clearance" };

// ── C.e NEG: documents_complete=false + coverageComplete=true ⇒ INCOMPLETE, never BID ──
ok("documents_complete=false + clean coverage → INCOMPLETE (never BID)", deriveVerdict(base({ documentsComplete: false })).verdict === "INCOMPLETE");
// ── committal cap: even a bar-bearing input is capped to INCOMPLETE on an incomplete document set ──
ok("documents_complete=false + a would-be bar → INCOMPLETE (committal capped, never NO_BID/INELIGIBLE)", deriveVerdict(base({ documentsComplete: false, findings: [barFinding], bidderProfile: { satisfiedAttributes: [] } })).verdict === "INCOMPLETE");
// ── documents_complete=true does NOT force INCOMPLETE (the cap fires only on an incomplete set) ──
ok("documents_complete=true + empty verified set → NOT INCOMPLETE (it's the empty-set floor, NHR)", deriveVerdict(base({ documentsComplete: true })).verdict !== "INCOMPLETE");
// ── byte-identity: documents_complete undefined ⇒ no cap (callers that omit it are unchanged) ──
const undefV = deriveVerdict(base({}));
const trueV = deriveVerdict(base({ documentsComplete: true }));
ok("documents_complete undefined ⇒ identical to documents_complete=true (no new cap for omitters)", undefV.verdict === trueV.verdict);

console.log(`\n${fails.length ? "❌" : "✅"} C.e single-truth: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`   - ${f}`)); process.exit(1); }
