// $0 PROOF — CLAUSE-SOURCE-CHECKER false-suppression fix (Brain card #539, flag AUDIT_CLAUSE_SOURCE_FULLTEXT).
//   npx tsx src/lib/clause-source-checker.test.ts
//
// Live root (FA303026Q0020, pricing-lens grade B): 52.222-41/-52/-53 ARE in source but were stamped "[clause not in
// source — suppressed]". Two roots: (1) normClauseCite strips ALL whitespace → a preceding number ("Feb 2026")
// GLUES onto the clause → the (?<!\d) whole-token guard rejects the match (52.222-41); (2) the panel checker ran
// over the union of per-lens BUNDLES (a subset), so a clause in an unrouted section (§I: -52/-53) was absent.
// This suite banks root (1) directly on makeClauseSourceChecker (both flag states) + root (2) as a subset proof.
import { makeClauseSourceChecker } from "./agentic-sections";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT;
  if (on) process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT = "true"; else delete process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT; else process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT = prev; }
};

// ── ROOT 1 — the glue bug: a clause preceded by a number (date/page) after whitespace-strip ──
const GLUED = "Applicable clauses effective Feb 2026\n52.222-41 Service Contract Act of 1965.";
console.log("\n── ROOT 1: whitespace-glue (preceding number) ──");
assert(withFlag(true, () => makeClauseSourceChecker(GLUED)("52.222-41")) === true, "flag ON: '…Feb 2026\\n52.222-41' → recognized (glue fixed)");
assert(withFlag(false, () => makeClauseSourceChecker(GLUED)("52.222-41")) === false, "flag OFF: legacy suppresses it (reproduces the live bug — byte-identical)");
assert(withFlag(true, () => makeClauseSourceChecker("Page 2026 52.222-41 applies.")("52.222-41")) === true, "flag ON: page-number-preceded clause → recognized");

// ── line-wrap preservation (the ORIGINAL purpose of the whitespace-strip must survive the fix) ──
console.log("\n── line-wrap + separator variants still join (flag ON) ──");
assert(withFlag(true, () => makeClauseSourceChecker("clause 52.222-\n41 applies")("52.222-41")) === true, "hyphen line-wrap '52.222-\\n41' → joined");
assert(withFlag(true, () => makeClauseSourceChecker("clause 52.\n222-41 applies")("52.222-41")) === true, "dot line-wrap '52.\\n222-41' → joined");
assert(withFlag(true, () => makeClauseSourceChecker("see 52.219 – 14 here")("52.219-14")) === true, "spaced en-dash '52.219 – 14' → matches 52.219-14");

// ── no false-positive + sibling-guard (the anti-fabrication contract must not weaken) ──
console.log("\n── safety: no false-positive, whole-token only (flag ON) ──");
assert(withFlag(true, () => makeClauseSourceChecker("only 52.222-41 here")("52.999-99")) === false, "absent clause → false (no fabrication leak)");
assert(withFlag(true, () => makeClauseSourceChecker("source has 52.219-14 only")("52.219-1")) === false, "sibling '52.219-1' NOT reported present when only '52.219-14' is in source (whole-token guard held)");
assert(withFlag(true, () => makeClauseSourceChecker("has 252.204-7012")("52.204-70") ) === false, "sibling '52.204-70' NOT matched inside '252.204-7012'");

// ── ROOT 2 — source scope: a clause present in the FULL source but absent from a lens-bundle SUBSET ──
console.log("\n── ROOT 2: full-source vs bundle-union subset ──");
const FULL = "SECTION L wage stuff …\nSECTION I — CONTRACT CLAUSES\n52.222-52 Exemption from SCA certification.\n52.222-53 Exemption evaluation.";
const BUNDLE_SUBSET = "SECTION L wage stuff …"; // §I not routed into this lens's bundle
assert(withFlag(true, () => makeClauseSourceChecker(FULL)("52.222-52")) === true, "full source → 52.222-52 recognized");
assert(withFlag(true, () => makeClauseSourceChecker(BUNDLE_SUBSET)("52.222-52")) === false, "bundle-subset (§I dropped) → 52.222-52 false-suppressed (the root the call-site fix closes)");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
