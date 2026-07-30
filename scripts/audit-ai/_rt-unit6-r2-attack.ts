// RT Unit6 R2 — BREAK THE HARDENED gate. Targets the NEW R1 machinery:
//  (1) FD_ABSORBABLE_KEYS allow-list completeness (kind/curable/unverified/grounded)
//  (2) forced-survivor (exactly-1-protected) severity/ctrl/curable correctness
//  (3) object-id clustering / bridging / spurious-token fragmentation
//  (4) full-containment restatement (cand ⊆ acc) swallow / bloat
//  (5) .2\d{2} subpart regex recall loss on real non-.2xx clauses
import { applyFindingDedup, deriveVerdict, disposeFinding, logicalShowStopperCount } from "../../src/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "../../src/lib/audit-findings";

type F = TypedFinding;
const mk = (o: Partial<F>): F => ({
  requirement: "", citation: "", excerpt: "", kind: "other",
  controllability: "bidder_controls", grounded: true, ...o,
} as F);

const vi = (findings: F[], profile: BidderProfile | null = null) =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false } as any);

let breaks = 0;
function verdictCheck(label: string, findings: F[], profile: BidderProfile | null = null) {
  const full = deriveVerdict(vi(findings, profile));
  const deduped = applyFindingDedup(findings, { enabled: true });
  const after = deriveVerdict(vi(deduped, profile));
  const ok = full.verdict === after.verdict && full.eligible === after.eligible;
  if (!ok) breaks++;
  console.log(`${ok ? "ok " : "*** VERDICT-UNSAFE"} [${label}] full=${full.verdict}/e=${full.eligible} rows=${findings.length}  deduped=${after.verdict}/e=${after.eligible} rows=${deduped.length}`);
  if (!ok) {
    console.log(`     full.reason : ${(full as any).reason?.slice(0, 160)}`);
    console.log(`     dedup.reason: ${(after as any).reason?.slice(0, 160)}`);
    console.log(`     survivors: ${deduped.map((f) => `[${f.kind}/${f.controllability}/${f.severity ?? "-"}/cur=${f.curableInWindow}/cf=${f.cautionFloor}/attr=${f.requiredAttribute ?? "-"}]`).join(" ")}`);
  }
}

// Also check the LOGICAL-SHOWSTOPPER-COUNT invariant + disposition-set + a coverage/grounding fact.
function factCheck(label: string, findings: F[]) {
  const deduped = applyFindingDedup(findings, { enabled: true });
  // grounding coverage fact the report reads: number of grounded findings, number of eligibility_bar kinds
  const gBefore = findings.filter((f) => f.grounded).length;
  const gAfter = deduped.filter((f) => f.grounded).length;
  const ebBefore = findings.filter((f) => f.kind === "eligibility_bar").length;
  const ebAfter = deduped.filter((f) => f.kind === "eligibility_bar").length;
  console.log(`   fact[${label}] grounded ${gBefore}->${gAfter}  eligibility_bar-kind ${ebBefore}->${ebAfter}  rows ${findings.length}->${deduped.length}`);
}

console.log("========== ATTACK 1: FD_ABSORBABLE_KEYS completeness ==========");

// B1-KIND-DROP — a member typed kind:"eligibility_bar" but with NO requiredAttribute (so not protected by attr,
// and fdBaseAbsorbable=true since kind∈allow-list). Merged into a plain "other" primary. deriveVerdict's
// unverifiedGates filters kind==="eligibility_bar" && requiredAttribute — this one has no attr so it wouldn't
// clamp anyway. But does a DOWNSTREAM render/count that reads kind lose the eligibility_bar row?
// Sharper: eligibility_bar kind WITH requiredAttribute vs a plain — attr protects. So the leak is kind alone.
// The real verdict lever on kind: unverifiedGates needs kind==eligibility_bar AND requiredAttribute AND !mmEvidenceFactor.
// Construct: a member kind:eligibility_bar WITH requiredAttribute + bidder_controls (curable), and a plain primary
// with the SAME requiredAttribute value (so fdMergeCompatible passes) — but different kind. Absorb drops the eb kind?
// Wait: the member carries requiredAttribute → fdBaseAbsorbable=false (attr not in allow-list) → PROTECTED. Good.
// So kind can only be dropped from an attr-LESS finding. An attr-less eligibility_bar does NOT clamp eligibility.
// TEST it anyway to confirm no clamp is lost:
verdictCheck("B1 attr-less eligibility_bar kind absorbed", [
  mk({ citation: "52.219-6", requirement: "set-aside eligibility applies", kind: "eligibility_bar", controllability: "bidder_controls", curableInWindow: true }),
  mk({ citation: "52.219-6", requirement: "note this clause governs the pool zzz", kind: "other", controllability: "bidder_controls", curableInWindow: true }),
]);

// B2-BOILERPLATE-PRIMARY — the KILLER for `kind`. disposeFinding(kind:"boilerplate") => "dropped".
// If the survivor PRIMARY is boilerplate, the survivor is DROPPED from the decision set even though it
// absorbed a REAL decision-bearing member. Primary is chosen by ctrl→sev→len. boilerplate is bidder_controls
// (ctrl rank 2) same as a plain gate; the tiebreak is severity then LENGTH. Make the boilerplate row the
// most-conservative-or-longest so it becomes primary, absorbing a REAL curable-caution member.
verdictCheck("B2 boilerplate primary absorbs a real caution member", [
  mk({ citation: "52.204-7", requirement: "THIS IS A VERY LONG BOILERPLATE CLAUSE RESTATEMENT THAT WINS THE LENGTH TIEBREAK aaaaa", kind: "boilerplate", controllability: "bidder_controls", cautionFloor: false }),
  mk({ citation: "52.204-7", requirement: "verify cert caution", kind: "submission", controllability: "bidder_controls", curableInWindow: true, cautionFloor: true }),
]);
factCheck("B2b boilerplate-primary", [
  mk({ citation: "52.204-7", requirement: "THIS IS A VERY LONG BOILERPLATE CLAUSE RESTATEMENT THAT WINS THE LENGTH TIEBREAK aaaaa", kind: "boilerplate", controllability: "bidder_controls" }),
  mk({ citation: "52.204-7", requirement: "verify cert caution", kind: "submission", controllability: "bidder_controls", cautionFloor: true }),
]);

// B3-UNVERIFIED-HIDE — `unverified` is in the allow-list. Absorbing an unverified:true member into a
// verified survivor HIDES the verifier drop. If a report counts "N unverified findings" or the run-soundness
// path reads unverified, the count drops. Also: can absorbing FLIP unverified? survivor = {...primary}; if
// primary is verified, an absorbed unverified:true member's unverified is LOST (the finding vanishes).
factCheck("B3 unverified member absorbed (verifier-drop hidden)", [
  mk({ citation: "52.217-8", requirement: "option extension baseline", controllability: "bidder_controls", unverified: false }),
  mk({ citation: "52.217-8", requirement: "option extension unreached by verifier zzz", controllability: "bidder_controls", unverified: true }),
]);

// B4-GROUNDED — grounded is OR'd on the survivor (members.some grounded). If an UNGROUNDED member is
// absorbed into a GROUNDED primary, survivor.grounded=true (correct-ish). But if the GROUNDED member is
// absorbed and primary is UNGROUNDED, survivor.grounded=OR=true (also fine). The leak: grounded COUNT drops
// by the number of absorbed grounded members — a "grounding coverage" metric under-reports.
factCheck("B4 grounded-count drop", [
  mk({ citation: "52.204-7", requirement: "grounded facet 1", grounded: true }),
  mk({ citation: "52.204-7", requirement: "grounded facet 2 distinct zzz", grounded: true }),
  mk({ citation: "52.204-7", requirement: "grounded facet 3 distinct www", grounded: true }),
]);

console.log("\n========== ATTACK 2: forced-survivor (exactly-1-protected) ==========");

// C1-FORCED-CURABLE-PROTECTED-vs-PLAIN-BAR — the protected member is CURABLE (curableInWindow true) but a
// PLAIN member is a NON-curable bar (bidder_cannot_move, curable false). Forced survivor = the protected one.
// isBar reads primary.controllability. The protected/forced primary is bidder_controls (curable) → isBar=false →
// the `...(isBar ? curableInWindow ...)` block is SKIPPED → the plain member's NON-CURABLE BAR is LOST.
// The protected member must carry a marker to BE protected. Give it a benign marker (e.g. cautionFloor is in
// allow-list — not protective). Use requiredAttribute to protect it? attr differs → incompatible cluster.
// Use a marker OUTSIDE the allow-list that isn't verdict-affecting on its own: e.g. `preconditionOvertypeFloored`.
verdictCheck("C1 curable-protected primary swallows a non-curable plain bar", [
  mk({ citation: "52.204-7", requirement: "curable protected item", controllability: "bidder_controls", curableInWindow: true, preconditionOvertypeFloored: true }),
  mk({ citation: "52.204-7", requirement: "structural clearance bar hold at award zzz", controllability: "bidder_cannot_move", curableInWindow: false }),
]);

// C2-FORCED-PROTECTED-LESS-CONSERVATIVE — protected member is bidder_controls; plain member is
// bidder_cannot_move (a bar). Forced survivor = protected (bidder_controls). The survivor controllability =
// primary.controllability = bidder_controls. THE BAR IS SOFTENED. disposeFinding(survivor)="gate_to_clear"
// not "disqualifying". Show-stopper LOST.
verdictCheck("C2 bidder_controls-protected primary softens a bidder_cannot_move plain bar", [
  mk({ citation: "52.222-99", requirement: "protected controllable item", controllability: "bidder_controls", preconditionOvertypeFloored: true }),
  mk({ citation: "52.222-99", requirement: "no one can move universal impossibility zzz", controllability: "no_one_can_move", curableInWindow: false }),
]);

// C3-FORCED with an eligibility clamp on the plain — the plain member is kind:eligibility_bar + requiredAttribute
// (a real clamp). But different requiredAttribute than protected → incompatible → not clustered. If protected has
// NO attr and plain has attr → compatible (fdMergeCompatible: one side empty). Forced survivor=protected (no attr).
// The plain's requiredAttribute → dropped → unverifiedGates loses it → committal without the eligibility clamp.
verdictCheck("C3 forced-protected no-attr swallows a plain eligibility clamp", [
  mk({ citation: "52.219-6", requirement: "protected marker item no attr", controllability: "bidder_controls", curableInWindow: true, nmrGuard: false as any, structuralWhitelistGuard: true }),
  mk({ citation: "52.219-6", requirement: "WOSB set-aside eligibility gate zzz", controllability: "bidder_cannot_move", curableInWindow: true, kind: "eligibility_bar", requiredAttribute: "wosb" }),
]);

console.log("\n========== ATTACK 3: object-id clustering / bridging / fragmentation ==========");

// D1-SPURIOUS-TOKEN-FRAGMENT — a real same-clause dup where one member's requirement contains an alnum token
// (a CLIN "0001aa", a date "2026q1", a cage code) that objectIdsOf picks up (len>=4, has letter+digit). If the
// two members would merge but one carries a distinctive object-id absent from the other → fdMergeCompatible
// requires a SHARED id when BOTH have ids. If member A has id {0001aa} and member B has id {2026q1}, DISJOINT →
// incompatible → REAL dup FAILS to merge (recall loss). Verdict-safe (under-merge) but the dedup silently no-ops.
factCheck("D1 spurious alnum tokens block a real same-clause dup", [
  mk({ citation: "52.217-8", requirement: "option to extend clin 0001aa applies", controllability: "bidder_controls" }),
  mk({ citation: "52.217-8", requirement: "option to extend deliverable 2026q1 applies", controllability: "bidder_controls" }),
]);

// D2-GREEDY-BRIDGE — 3 members A,B,C on one clause. A~B (share id x), B~C (share id y), A≁C (disjoint ids).
// Greedy: A starts cluster; B joins (compat with A); C tries to join A's cluster — must be compat with ALL
// (A AND B). C~B but C≁A → rejected → C forms its own singleton → not merged. Is that correct? A and B name
// the SAME object x, C names object y — C is a DIFFERENT bar (card-53). Correct to keep C standalone. But the
// order-dependence: if input is C,B,A the clustering differs. Check order-stability of the OUTPUT verdict.
const d2 = [
  mk({ citation: "52.219-33", requirement: "bar object item0001 shared", controllability: "bidder_cannot_move", curableInWindow: false }),
  mk({ citation: "52.219-33", requirement: "bar object item0001 and item0002 shared bridge", controllability: "bidder_cannot_move", curableInWindow: false }),
  mk({ citation: "52.219-33", requirement: "bar object item0002 only", controllability: "bidder_cannot_move", curableInWindow: false }),
];
const d2f = deriveVerdict(vi(d2)).verdict;
const d2rev = deriveVerdict(vi([...d2].reverse())).verdict;
const d2dd = deriveVerdict(vi(applyFindingDedup(d2, { enabled: true }))).verdict;
const d2ddrev = deriveVerdict(vi(applyFindingDedup([...d2].reverse(), { enabled: true }))).verdict;
console.log(`   D2 order-stability: full fwd=${d2f} rev=${d2rev} | dedup fwd=${d2dd} rev=${d2ddrev} | logSS full=${logicalShowStopperCount(deriveVerdict(vi(d2)).showStoppers)} dedup=${logicalShowStopperCount(deriveVerdict(vi(applyFindingDedup(d2,{enabled:true}))).showStoppers)}`);

console.log("\n========== ATTACK 4: full-containment restatement swallow / bloat ==========");

// E1-SCATTERED-SWALLOW — acc GROWS as facets append. A later DISTINCT facet whose tokens are individually
// scattered across earlier appended facets gets dropped (cand ⊆ acc where acc is the CONCAT of all prior facets).
// Facet1: "submit past performance references". Facet2: "provide pricing narrative".
// Facet3 (DISTINCT concern): "submit pricing references" — all tokens {submit,pricing,references} appear in
// facet1∪facet2 → dropped, even though "submit pricing references" is a different obligation than either.
factCheck("E1 scattered-token distinct facet swallowed", [
  mk({ citation: "52.212-1", requirement: "submit past performance references", controllability: "bidder_controls" }),
  mk({ citation: "52.212-1", requirement: "provide pricing narrative", controllability: "bidder_controls" }),
  mk({ citation: "52.212-1", requirement: "submit pricing references", controllability: "bidder_controls" }),
]);
{
  const set = [
    mk({ citation: "52.212-1", requirement: "submit past performance references", controllability: "bidder_controls" }),
    mk({ citation: "52.212-1", requirement: "provide pricing narrative", controllability: "bidder_controls" }),
    mk({ citation: "52.212-1", requirement: "submit pricing references", controllability: "bidder_controls" }),
  ];
  const dd = applyFindingDedup(set, { enabled: true });
  console.log(`   E1 survivor requirement: "${dd[0]?.requirement}"`);
}

// E2-BLOAT — every panel rephrase with ANY new token appends. A "no over-merge but pathological verbosity"
// check: 6 near-identical rephrasings each adding one filler token → survivor requirement grows unboundedly.
{
  const set = Array.from({ length: 8 }, (_, i) =>
    mk({ citation: "52.217-8", requirement: `the government may extend the option period alpha${i} beta${i}`, controllability: "bidder_controls" }));
  const dd = applyFindingDedup(set, { enabled: true });
  console.log(`   E2 bloat: 8 rephrasings -> survivor requirement length ${dd[0]?.requirement.length} (all appended? ${dd[0]?.requirement.split(" · ").length} facets)`);
}

console.log("\n========== ATTACK 5: .2\\d{2} subpart regex recall ==========");
import { } from "../../src/lib/audit-decide";
// F1 — a REAL clause NOT in subpart .2. Test candidate clauses the engine might emit:
//  52.103, 52.107 (FAR subpart 52.1 — clause prescriptions), 52.301, 52.107-4?  Actually FAR clauses live in
//  52.2xx. But PROVISIONS 52.204-x are .2. DFARS 252.2xx. GSAR 552.2xx. However: 52.1xx? FAR 52.1 is
//  "Instructions for using provisions and clauses" — NOT a clause you cite in a sol. The dangerous ones:
//  - 52.000? no.  - Agency clauses in OTHER subparts: e.g. AGAR, EPAAR. And CFR-form "121.406" excluded by design.
//  - PROVISIONS at 52.209-x are .2 (ok). 52.219 .2 ok. 52.222 .2 ok. 52.212 .2 ok. 52.204 .2 ok.
//  The realistic recall risk: a 3-digit agency supplement whose subpart is NOT 2, e.g. DEAR/NFS 1852.2xx (.2 ok),
//  but TRANSPORTATION TAR 1252.2 ok. What about clauses like "252.204-7012" (DFARS, .2 ok).
//  KEY MISS: FAR 52.1xx "Solicitation Provisions" do not exist as clause numbers >52.100. The REAL non-.2:
//  H-clauses / local clauses like "5252.216-9200" (NAVSUP 5-digit, .216 = .2 ok). Hmm most are .2.
//  The genuine non-.2xx: DFARS 252.2 always .2. GSAR .2. BUT: some clauses use 3-digit subpart? No — FAR subparts
//  are 2-digit. The regex requires `.2\d{2}` = dot, 2, then exactly 2 digits, then -digits. So "52.204-7" matches
//  (.204). "252.7003"? DFARS 252.70xx = subpart .70 → NOT .2 → the regex REQUIRES second char after dot = a digit
//  making 3 digits total. .7003 → first digit after dot is 7 not 2 → NO MATCH. DFARS 252.70xx clauses are REAL!
const nonTwoClauses = ["252.7003-1", "252.7002-1", "252.7012", "52.107-1", "252.7000", "52.301", "1852.223-70", "352.222-70"];
{
  const FD_CLAUSE_RE = /\b(?:2?52|\d{3,4})\.2\d{2}-\d{1,4}\b/g;
  for (const c of nonTwoClauses) {
    const m = c.match(FD_CLAUSE_RE);
    console.log(`   F1 clause "${c}" -> match: ${m ? m.join(",") : "NONE (recall loss if real dup)"}`);
  }
}
// F2 — verify a same-clause dup on a DFARS 252.70xx clause FAILS to dedup (recall loss).
factCheck("F2 DFARS 252.7003 subpart-.70 dup NOT merged", [
  mk({ citation: "252.7003-1", requirement: "requirements relating to supply chain risk apply", controllability: "bidder_controls" }),
  mk({ citation: "252.7003-1", requirement: "requirements relating to supply chain risk apply again distinct zzz", controllability: "bidder_controls" }),
]);

console.log(`\n========== TOTAL VERDICT-UNSAFE BREAKS: ${breaks} ==========`);
