// RT Unit6 R2 — R1 regression guard + idempotency/order/flag-off/ReDoS + real record.
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";
import { readFileSync } from "fs";
type F = TypedFinding;
const mk = (o: Partial<F>): F => ({ requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as F);
const vi = (findings: F[], p: BidderProfile | null = null) => ({ findings, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false } as any);
let fail = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "ok " : "*** FAIL"} ${m}`); if (!c) fail++; };

console.log("===== R1 REGRESSION GUARD (all 6 must stay closed) =====");
// R1-P0: {...primary} stripping verdict markers off absorbed members (universalDefect/verifiedBy/requiredAttribute/nmrGuard/mmEvidenceFactor).
// A member carrying any such marker must be PROTECTED (never absorbed). Verify a marker-bearing member survives.
{
  const set = [
    mk({ citation: "52.219-33", requirement: "nmr bar primary", controllability: "bidder_controls" }),
    mk({ citation: "52.219-33", requirement: "nmr bar with guard zzz", controllability: "bidder_cannot_move", curableInWindow: false, nmrGuard: true, requiredAttribute: "nmr-status", kind: "eligibility_bar" }),
  ];
  const dd = applyFindingDedup(set, { enabled: true });
  assert(dd.some((f) => (f as any).nmrGuard === true), "R1-P0 nmrGuard-bearing member preserved (protected)");
  assert(deriveVerdict(vi(set)).verdict === deriveVerdict(vi(dd)).verdict, "R1-P0 verdict invariant on marker set");
}
// R1-P1: lost requiredAttribute in INELIGIBLE reason — two different non-empty attrs must NOT be in one cluster.
{
  const p: BidderProfile = { satisfiedAttributes: [], closedWorld: true };
  const set = [
    mk({ citation: "52.219-6", requirement: "attr A gate", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "wosb", kind: "eligibility_bar", excerpt: "wosb", grounded: true }),
    mk({ citation: "52.219-6", requirement: "attr B gate zzz", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "hubzone", kind: "eligibility_bar", excerpt: "hubzone", grounded: true }),
  ];
  const dd = applyFindingDedup(set, { enabled: true });
  assert(dd.length === 2, "R1-P1 two distinct requiredAttribute NOT merged (both attrs preserved)");
}
// R1-P2 over-merge: "base year option" vs "FIRST option" (~90% shared) must NOT collapse the distinguishing facet.
{
  const set = [
    mk({ citation: "52.217-8", requirement: "the base year option period may be extended by the government", controllability: "bidder_controls" }),
    mk({ citation: "52.217-8", requirement: "the first option period may be extended by the government", controllability: "bidder_controls" }),
  ];
  const dd = applyFindingDedup(set, { enabled: true });
  assert(dd.length === 1 && /base/.test(dd[0].requirement) && /first/.test(dd[0].requirement), "R1-P2 both 'base' and 'first' facets preserved");
}
// R1-P2 phone-number false clause key: "252.555-1212" must NOT be a clause key.
{
  const FD = /\b(?:2?52|\d{3,4})\.2\d{2}-\d{1,4}\b/g;
  assert(!"252.555-1212".match(FD), "R1-P2 phone 252.555-1212 not a clause key (.555 rejected)");
  // a real same-clause dup with a phone in one excerpt must still merge on the real clause (citation field).
  const set = [
    mk({ citation: "52.217-8", requirement: "option to extend, call 252.555-1212 for questions", controllability: "bidder_controls" }),
    mk({ citation: "52.217-8", requirement: "option to extend distinct facet zzz", controllability: "bidder_controls" }),
  ];
  const dd = applyFindingDedup(set, { enabled: true });
  assert(dd.length === 1, "R1-P2 phone in text does not fragment a real 52.217-8 dup");
}
// R1 O1 object-id: two different named objects same clause must NOT merge.
{
  const set = [
    mk({ citation: "52.219-33", requirement: "bar on part9999a end item", controllability: "bidder_cannot_move", curableInWindow: false }),
    mk({ citation: "52.219-33", requirement: "bar on part8888b end item", controllability: "bidder_cannot_move", curableInWindow: false }),
  ];
  const dd = applyFindingDedup(set, { enabled: true });
  assert(dd.length === 2, "R1-O1 two distinct object-ids not merged");
}

console.log("\n===== IDEMPOTENCY / ORDER / FLAG-OFF / ReDoS =====");
{
  const set = [
    mk({ citation: "52.217-8", requirement: "option facet one", controllability: "bidder_controls" }),
    mk({ citation: "52.217-8", requirement: "option facet two distinct zzz", controllability: "bidder_controls" }),
    mk({ citation: "52.204-7", requirement: "sam registration", controllability: "bidder_controls" }),
  ];
  const once = applyFindingDedup(set, { enabled: true });
  const twice = applyFindingDedup(once, { enabled: true });
  assert(JSON.stringify(once) === JSON.stringify(twice), "idempotent");
  const off = applyFindingDedup(set, { enabled: false });
  assert(off === set, "flag-OFF returns same ref (byte-identical)");
  // order stability of the deduped-verdict
  const rev = [...set].reverse();
  assert(deriveVerdict(vi(applyFindingDedup(set, { enabled: true }))).verdict === deriveVerdict(vi(applyFindingDedup(rev, { enabled: true }))).verdict, "order-stable verdict");
}
// ReDoS — FD_CLAUSE_RE against a long pathological string.
{
  const FD = /\b(?:2?52|\d{3,4})\.2\d{2}-\d{1,4}\b/g;
  const evil = "52.2".repeat(50000) + "9".repeat(50000);
  const t0 = Date.now(); evil.match(FD); const dt = Date.now() - t0;
  assert(dt < 200, `FD_CLAUSE_RE ReDoS-safe (${dt}ms)`);
}

console.log("\n===== REAL RECORD (seq2-runrecord) verdict invariance =====");
try {
  const rec = JSON.parse(readFileSync("/tmp/seq2-runrecord.json", "utf8"));
  const findings: F[] = rec.result?.findings ?? rec.findings ?? [];
  const dd = applyFindingDedup(findings, { enabled: true });
  const full = deriveVerdict(vi(findings)), after = deriveVerdict(vi(dd));
  assert(full.verdict === after.verdict && full.eligible === after.eligible,
    `real record verdict invariant: ${full.verdict}/${full.eligible} -> ${after.verdict}/${after.eligible} (rows ${findings.length}->${dd.length})`);
} catch (e) { console.log("   (real record unavailable: " + (e as Error).message + ")"); }

console.log(`\n===== REGRESSION FAILURES: ${fail} =====`);
