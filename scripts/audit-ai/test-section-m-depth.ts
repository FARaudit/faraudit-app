// $0 gate for Step 5b — §M evaluation-DEPTH (Brain card 137). A §M / 52.212-2-equiv is credited "covered" ONLY
// if it carries ≥1 real eval-factor/basis token; an eval-less §M heading → NOT covered → "evaluation criteria
// not found". Scoped to §M ONLY (never §L or coreMissing). Lives in completenessOf (orchestrator-domain), so the
// honest proof is here against crafted sources. Flag AUDIT_SECTION_M_DEPTH default-OFF ⇒ byte-identical.
//   npx tsx scripts/audit-ai/test-section-m-depth.ts

import { completenessOf } from "@/lib/audit-orchestrator";
import type { AuditToolContext } from "@/lib/audit-tools";

const ctxOf = (s: string): AuditToolContext => ({ fullSource: s });
const ON = { sectionMDepth: true };

// §M WITH real LPTA evaluation prose (the T-38 shape).
const M_LPTA = ctxOf([
  "SECTION M - EVALUATION FACTORS FOR AWARD",
  "Award will be made on a lowest-priced technically acceptable basis; quotes rated Acceptable/Unacceptable.",
].join("\n"));
// §M heading with ZERO eval-factor content (a heading without criteria).
const M_STUB = ctxOf([
  "SECTION M - EVALUATION FACTORS FOR AWARD",
  "Details will be provided separately at a later date.",
].join("\n"));
// §L with a submission obligation (used to prove scope discipline — §M flag must not touch §L).
const L_OBLIG = ctxOf([
  "SECTION L - INSTRUCTIONS TO OFFERORS",
  "Offerors shall submit a Certificate of Conformance with the quote.",
].join("\n"));
// LOAD-BEARING (the trailing-bleed attack): a §M STUB immediately followed by a Past-Performance/wage attachment
// whose generic words ("weighted","acceptable","past performance") would defeat a naive scan. Must STILL flag.
const M_STUB_BLEED = ctxOf([
  "SECTION M - EVALUATION FACTORS FOR AWARD",
  "Details will be provided separately at a later date.",
  "ATTACHMENT 1 - PAST PERFORMANCE QUESTIONNAIRE",
  "Factors are weighted. Ratings: Acceptable / Unacceptable. Wage determination weights apply.",
].join("\n"));
// A real best-value §M phrased without LPTA — must be CREDITED (token path). No obligation trigger word.
const M_BESTVALUE = ctxOf([
  "SECTION M - EVALUATION FACTORS FOR AWARD",
  "Award is based on the best overall value to the Government, not lowest price alone.",
].join("\n"));
// NEW LOAD-BEARING (Brain card 137 refine): a POPULATED §M with NO award-basis token (weighted/adjectival) —
// must NOT flag (it is not THIN). This is the false-negative the refine closes. No obligation trigger words.
const M_WEIGHTED = ctxOf([
  "SECTION M - EVALUATION FACTORS FOR AWARD",
  "The Government will evaluate three factors as follows: Technical Approach, Management Plan, and Price,",
  "with Technical Approach considered significantly more important than the integrated assessment of cost.",
].join("\n"));

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };
const coveredHas = (r: { covered: string[] }, s: string) => r.covered.includes(s);

// (i) §M with LPTA prose → GROUNDED/covered under the flag (NO false "not evaluated").
eq("i  §M LPTA prose → covered (flag ON)", coveredHas(completenessOf(M_LPTA, ["M"], [], new Set(["M"]), ON), "M"), true);

// (ii) LOAD-BEARING: eval-less §M → NOT covered → "evaluation criteria not found".
const stubOn = completenessOf(M_STUB, ["M"], [], new Set(["M"]), ON);
eq("ii eval-less §M → NOT covered (flag ON)", coveredHas(stubOn, "M"), false);
eq("ii eval-less §M → in missing (flag ON)", stubOn.missing.includes("M"), true);
eq("ii eval-less §M → surfaces 'evaluation criteria not found'", /evaluation criteria not found/.test(JSON.stringify(stubOn.attestations)), true);
// the GAP today (flag OFF): the eval-less §M is silently credited covered.
eq("ii(off) eval-less §M → covered (flag OFF — the pre-5b gap, byte-identical)", coveredHas(completenessOf(M_STUB, ["M"], [], new Set(["M"])), "M"), true);

// (ii-bleed) THE TRAILING-BLEED GUARD: a §M stub followed by a past-performance/wage attachment must STILL flag.
const bleedOn = completenessOf(M_STUB_BLEED, ["M"], [], new Set(["M"]), ON);
eq("ii-bleed §M stub + trailing past-perf/wage attachment → NOT covered (no bleed false-pass)", coveredHas(bleedOn, "M"), false);

// (ii-bv) a real best-value §M (no LPTA literal) → COVERED (token path).
eq("ii-bv best-overall-value §M → covered (flag ON)", coveredHas(completenessOf(M_BESTVALUE, ["M"], [], new Set(["M"]), ON), "M"), true);

// (ii-weighted) THE REFINE TARGET: populated weighted/adjectival §M, NO token, NOT thin → NOT flagged.
eq("ii-weighted populated non-token §M → NOT flagged (false-negative closed)", coveredHas(completenessOf(M_WEIGHTED, ["M"], [], new Set(["M"]), ON), "M"), true);

// (ii-direct) a §M with a DIRECT grounded finding but no token in the heading text → covered (real evidence wins).
const mFinding = [{ requirement: "eval basis", citation: "§M", excerpt: "Details will be provided separately", grounded: true, lens: "x", kind: "other" as const, controllability: "bidder_controls" as const, id: "m#0" }];
eq("ii-direct §M with a direct grounded finding → covered (not overridden by the token check)", coveredHas(completenessOf(M_STUB, ["M"], mFinding, new Set(["M"]), ON), "M"), true);

// (iii) SCOPE DISCIPLINE: §L is identical with/without the flag (the §M check only fires for sec==="M").
eq("iii §L identical with/without flag", JSON.stringify(completenessOf(L_OBLIG, ["L"], [], new Set(["L"]))), JSON.stringify(completenessOf(L_OBLIG, ["L"], [], new Set(["L"]), ON)));
// and a §M WITH criteria is also identical on/off (flag only changes the eval-LESS case).
eq("iii §M-with-criteria identical with/without flag", JSON.stringify(completenessOf(M_LPTA, ["M"], [], new Set(["M"]))), JSON.stringify(completenessOf(M_LPTA, ["M"], [], new Set(["M"]), ON)));

// BYTE-IDENTICAL when off (no opts at all) for the eval-less §M = the legacy behavior.
eq("OFF eval-less §M no-opts === flag-false", JSON.stringify(completenessOf(M_STUB, ["M"], [], new Set(["M"]))), JSON.stringify(completenessOf(M_STUB, ["M"], [], new Set(["M"]), { sectionMDepth: false })));

console.log(`section-M-depth gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — eval-less §M flagged 'not evaluated' (flag ON); LPTA §M covered; §L untouched; OFF byte-identical.");
process.exit(0);
