// PHASE 3 UNIT 6 — finding-dedup gate ($0 suite). Core behaviour + the BRAIN #555 STRUCTURAL-COMPLETENESS GUARD.
// Run: npx tsx src/lib/finding-dedup.test.ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  applyFindingDedup, deriveVerdict,
  FD_ABSORBABLE_KEYS, FD_MERGE_PRESERVED_FIELDS, FD_VERDICT_INERT_ON_PLAINS,
} from "./audit-decide";
import type { TypedFinding, VerdictInputs } from "./audit-findings";

let fail = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
const ON = { enabled: true };
const mkInputs = (fs: TypedFinding[], profile: any = null): VerdictInputs =>
  ({ findings: fs, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false } as VerdictInputs);
const plain = (id: string, clause: string, over: Partial<TypedFinding> = {}): TypedFinding => ({
  id, requirement: `Offeror shall comply with FAR ${clause}.`, citation: `Section I, ${clause}`, excerpt: "x",
  kind: "clause_flowdown", controllability: "bidder_controls", grounded: true, lens: "l", severity: "P2", ...over,
});

// ── Core behaviour ──────────────────────────────────────────────────────────────────────────────────────
const base = [plain("a", "52.222-50"), plain("b", "52.222-50"), plain("c", "52.209-2")];
assert(applyFindingDedup(base, { enabled: false }) === base, "flag OFF ⇒ same array reference (byte-identical)");
const on = applyFindingDedup(base, ON);
assert(on.length === 2, `plain same-clause dups collapse (3→2) — got ${on.length}`);
assert(on.some((f) => (f as any).findingDedupMerged && (f as any).mergedClause === "52.222-50"), "survivor tagged findingDedupMerged + mergedClause");
assert(applyFindingDedup(on, ON).length === on.length, "idempotent (no further collapse)");

// bars pass through UNTOUCHED (protected)
const withBar = [plain("a", "52.219-6"), plain("b", "52.219-6", { controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false })];
const onBar = applyFindingDedup(withBar, ON);
assert(onBar.length === 2, "a clause with a bar: bar untouched + no plain dup to merge ⇒ 2 rows");
assert(onBar.some((f) => f.controllability === "bidder_cannot_move" && !(f as any).findingDedupMerged), "the BAR passes through untouched (not a merged survivor)");

// attribute-bearer (protected) never absorbed / clobbered
const withAttr = [plain("a", "52.219-9", { kind: "eligibility_bar", requiredAttribute: "setaside:sb" } as any), plain("b", "52.219-9", { kind: "eligibility_bar" })];
const onAttr = applyFindingDedup(withAttr, ON);
assert(onAttr.some((f) => (f as any).requiredAttribute === "setaside:sb"), "an attribute-bearing eligibility gate is PROTECTED — its requiredAttribute survives");

// facet preservation — distinct obligations on one clause keep both texts
const facetFindings = [plain("a", "52.215-1", { requirement: "Offeror shall submit the cost volume for the base year." }),
                       plain("b", "52.215-1", { requirement: "Offeror shall submit the cost volume for the FIRST option year." })];
const onFacet = applyFindingDedup(facetFindings, ON)[0];
assert(/base year/i.test(onFacet.requirement) && /first option/i.test(onFacet.requirement), "facet-preservation: both distinct obligations survive in the merged requirement");

// verdict invariance on a mixed set (null profile)
const mixed = [...base, ...withBar, ...withAttr];
assert(deriveVerdict(mkInputs(mixed)).verdict === deriveVerdict(mkInputs(applyFindingDedup(mixed, ON))).verdict, "verdict pole invariant OFF vs ON (mixed set)");
assert(deriveVerdict(mkInputs(mixed)).eligible === deriveVerdict(mkInputs(applyFindingDedup(mixed, ON))).eligible, "eligible invariant OFF vs ON (mixed set)");

// ── BRAIN #555 STRUCTURAL-COMPLETENESS GUARD ────────────────────────────────────────────────────────────
// deriveVerdict is the SOLE verdict authority ⇒ it must be the SOLE definition of "verdict-driving". Scan the ACTUAL source of
// the verdict functions for every finding-field they read, and assert each is: merge-preserved, OR protection-triggering
// (∉ FD_ABSORBABLE_KEYS ⇒ its bearer is never absorbed), OR documented verdict-inert on the absorbable (plain non-bar) class.
// This FAILS the moment deriveVerdict is changed to read a field the dedup treats as ignorable — converting the safety claim
// from inductive (probed) to STRUCTURAL (contract-checked).
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "audit-decide.ts"), "utf8");
const bodyOf = (declRe: RegExp): string => {
  const m = src.match(declRe); if (!m) throw new Error(`decl not found: ${declRe}`);
  let i = src.indexOf("{", m.index!); let depth = 0; const start = i;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") { depth--; if (depth === 0) break; } }
  return src.slice(start, i + 1);
};
const verdictSrc = [
  /export function deriveVerdict\(/, /export function disposeFinding\(/, /export function firmStatus\(/,
  /function nmrFirmStatus\(/,
].map(bodyOf).join("\n");
// Every finding-field the verdict authority reads (f.X / finding.X / s.X where the var is a finding). Conservative: also catch
// destructured `f.` on any single-letter/`finding` receiver used across these functions.
const readFields = new Set<string>();
for (const m of verdictSrc.matchAll(/\b(?:f|finding|s|g)\.([a-zA-Z][a-zA-Z0-9]*)\b/g)) readFields.add(m[1]);
// Non-finding property accesses that share a receiver name (BidderProfile / Decision / helper objects) — exclude explicitly.
const NOT_FINDING_FIELDS = new Set<string>(["length", "size", "has", "get", "some", "filter", "map", "push", "controllabilityRank", "join", "toLowerCase", "includes", "slice", "attributes", "closedWorld", "openWorld", "profile", "verdict", "eligible", "reason", "dispositions", "showStoppers", "test", "add", "trim", "split", "match", "replace", "startsWith", "endsWith", "index"]);
const verdictReadFindingFields = [...readFields].filter((k) => !NOT_FINDING_FIELDS.has(k));
const leaks = verdictReadFindingFields.filter((k) =>
  FD_ABSORBABLE_KEYS.has(k) && !FD_MERGE_PRESERVED_FIELDS.has(k) && !FD_VERDICT_INERT_ON_PLAINS.has(k));
assert(leaks.length === 0,
  `STRUCTURAL COMPLETENESS: every verdict-read finding-field is merge-preserved / protection-triggering / documented-inert — LEAKS: [${leaks.join(", ")}]`);
console.log(`   (verdict authority reads finding-fields: [${verdictReadFindingFields.sort().join(", ")}])`);

// ── Fuzz: mutating an absorbed plain member's INERT fields must not move the verdict ─────────────────────
const fuzzBase = [plain("a", "52.222-50", { curableInWindow: true, excerpt: "alpha", citation: "cite-A" }),
                  plain("b", "52.222-50", { curableInWindow: false, excerpt: "beta", citation: "cite-B" })];
const vFuzz = deriveVerdict(mkInputs(applyFindingDedup(fuzzBase, ON))).verdict;
const vFuzz2 = deriveVerdict(mkInputs(applyFindingDedup(
  [plain("a", "52.222-50", { curableInWindow: false, excerpt: "zzz", citation: "cite-Z", unverified: true } as any), fuzzBase[1]], ON))).verdict;
assert(vFuzz === vFuzz2, "fuzz: mutating an absorbed plain member's inert fields (curableInWindow/excerpt/citation/unverified) does not move the verdict");

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : `❌ ${fail} FAILED`} — Unit 6 finding-dedup ($0 suite + Brain #555 structural guard)`);
process.exit(fail === 0 ? 0 : 1);
