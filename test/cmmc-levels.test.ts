// ─────────────────────────────────────────────────────────────────────────────
// CMMC LEVEL INFERENCE — run over real audit rows.
//
// The fixture is transcribed from production `audits`: every row of the real
// corpus that carries a CMMC signal or the word `circuit`, plus twelve that
// carry neither, reduced to the two fields the inference reads and bounded the
// same way the reader bounds them (4000 chars of the serialized object plus
// the two dfars arrays). Real rows, not written ones — the full 112-row corpus
// is 4.9 MB and does not belong in git.
//
// The defect this locks down: the level regexes matched `cui` as a SUBSTRING,
// and `circuit` contains it. On an aircraft-parts account `circuit` is not
// hypothetical — it is already in this corpus twice. A machining solicitation
// that mentions a circuit would have been reported as requiring a CMMC Level 2
// assessment, which is a five-figure engagement the customer does not need.
//
// Run: npx tsx test/cmmc-levels.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import path from "node:path";
import { inferLevel, LEVELS } from "../src/lib/bd-os/cmmc-levels";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const rows = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "audits-cmmc-slice.json"), "utf8")
) as Array<Record<string, unknown>>;

console.log(`\n── A · the real corpus ──`);
ok(rows.length > 0, "fixture carries real audit rows", `${rows.length}`);

const results = rows.map((r) => ({ id: r.id, ...inferLevel(r) }));
const dist = results.reduce<Record<string, number>>((acc, r) => {
  acc[r.level] = (acc[r.level] || 0) + 1;
  return acc;
}, {});
console.log(`  distribution: ${JSON.stringify(dist)}`);

ok(
  results.filter((r) => r.level !== "0").every((r) => !!r.trigger),
  "every flagged audit carries the token that flagged it"
);
ok(
  results.filter((r) => r.level === "0").every((r) => r.trigger === null),
  "an unflagged audit claims no trigger"
);
ok(
  results.every((r) => r.level === "0" || !!LEVELS[r.level as "1" | "2" | "3"]),
  "every level reported has a reference entry"
);

// ── B · the substring collision, measured on this corpus ────────────────────
console.log(`\n── B · the collision that was live in this corpus ──`);

const OLD_L2 = /252\.204-7021|cmmc level\s*2|cmmc[-\s]*2|nist\s*sp\s*800-171|controlled unclassified|cui/;
const textOf = (a: Record<string, unknown>) => {
  const cj = (a.compliance_json as Record<string, unknown>) || {};
  return JSON.stringify(cj).slice(0, 4000);
};

const circuitRows = rows.filter((r) => /circuit/i.test(textOf(r)));
ok(circuitRows.length > 0, "the corpus really does contain `circuit`", `${circuitRows.length} row(s)`);
ok(
  circuitRows.every((r) => OLD_L2.test(textOf(r).toLowerCase())),
  "the OLD recognizer fires on every one of them (the defect)"
);

// A planted row carrying `circuit` and nothing else must come back clean.
const plantedCircuit = {
  id: "planted-circuit",
  compliance_json: { summary: "Machining of printed circuit board mounting brackets, aluminium." }
};
const pc = inferLevel(plantedCircuit);
ok(OLD_L2.test(JSON.stringify(plantedCircuit.compliance_json).toLowerCase()),
  "PLANTED: the old recognizer calls a circuit-board solicitation CMMC Level 2");
ok(pc.level === "0" && pc.trigger === null,
  "the shipped recognizer leaves it unflagged", `got level ${pc.level}`);

// …while a real CUI mention still flags.
const plantedCui = { id: "planted-cui", compliance_json: { summary: "Contractor will handle CUI in accordance with the contract." } };
const pu = inferLevel(plantedCui);
ok(pu.level === "2" && pu.trigger === "CUI", "a real CUI mention still flags Level 2", `${pu.level} · ${pu.trigger}`);

const plantedClause = { id: "planted-7021", compliance_json: { dfars_clauses: ["252.204-7021"] } };
ok(inferLevel(plantedClause).trigger === "DFARS 252.204-7021", "a clause number flags by clause, not by prose");

const plantedFci = { id: "planted-fci", compliance_json: { summary: "Handling of FCI only." } };
ok(inferLevel(plantedFci).level === "1", "FCI flags Level 1");

const plantedBiscuit = { id: "planted-fci-word", compliance_json: { summary: "Delivery of pacific FCI-adjacent unrelated wording: sacrifice, edifice." } };
ok(inferLevel(plantedBiscuit).level !== "1" || inferLevel(plantedBiscuit).trigger === "FCI",
  "word-boundary FCI does not fire inside ordinary words");

// ── C · precedence and degenerate input ─────────────────────────────────────
console.log(`\n── C · precedence and degenerate input ──`);

const both = { id: "both", compliance_json: { dfars_clauses: ["252.204-7012", "252.204-7021"] } };
ok(inferLevel(both).level === "2", "two Level 2 clauses on one audit still report Level 2");

const farOnly = { id: "far", compliance_json: { dfars_clauses: ["52.204-21"] } };
ok(inferLevel(farOnly).level === "1" && inferLevel(farOnly).trigger === "FAR 52.204-21",
  "FAR 52.204-21 alone is Level 1 — FCI, not CUI");
const cdiOverFci = { id: "mix", compliance_json: { dfars_clauses: ["52.204-21", "252.204-7012"] } };
ok(cdiOverFci && inferLevel(cdiOverFci).level === "2",
  "a CDI clause outranks the FCI clause on the same audit");
ok(inferLevel({ id: "d", compliance_json: { dfars_clauses: ["252.204-7012"] } }).level === "2",
  "252.204-7012 is Level 2 — it requires NIST SP 800-171, and LEVELS lists it under Level 2");
ok(!/(?<!\d)52\.204-21\b/.test("252.204-7021"),
  "the FAR 52.204-21 rule does not fire inside DFARS 252.204-7021");

// ── the reference and the recogniser must name the same clauses ─────────────
// The page prints LEVELS[n].triggers as "what puts you at this level". Three of them had no
// rule, so the panel named clauses the engine behind it could not see.
for (const [lvl, clause] of [["2", "252.204-7019"], ["2", "252.204-7020"], ["2", "252.204-7021"]] as const) {
  const got = inferLevel({ id: clause, compliance_json: { dfars_clauses: [clause] } });
  ok(got.level === lvl, `${clause} is recognised and reports Level ${lvl}`, `got L${got.level}`);
}

// Level 3 must stay REACHABLE. The loose `critical (asset|program)` phrase was removed because it
// matched ordinary prose from the first row of the table; if that removal left no path to Level 3
// at all, the model's top level would be unreportable and this gate would be green about it.
ok(inferLevel({ id: "l3a", compliance_json: { summary: "Requires CMMC Level 3." } }).level === "3",
  "Level 3 is still reachable — an explicit CMMC Level 3 statement");
ok(inferLevel({ id: "l3b", compliance_json: { summary: "Enhanced controls per NIST SP 800-172 apply." } }).level === "3",
  "Level 3 is still reachable — NIST SP 800-172");
// …and the phrase that used to reach it must not.
const looseCritical = { id: "crit", compliance_json: { summary: "Contractor shall meet the critical program milestones." } };
ok(inferLevel(looseCritical).level === "0",
  "'critical program' in ordinary prose no longer reports Level 3", `got L${inferLevel(looseCritical).level}`);

// ── D · a flag is a verdict, not a mention ──────────────────────────────────
// 258 of 377 flags in the live corpus are detected:false. Reading them for their clause number
// used the record of a clause's ABSENCE as evidence of its presence.
console.log(`\n── D · undetected flags must not flag ──`);
const undetected = { id: "u", compliance_json: { dfars_flags: [
  { clause: "252.204-7021", title: "Cybersecurity Maturity Model Certification Requirements", detected: false }
] } };
ok(inferLevel(undetected).level === "0",
  "a flag recorded detected:false does not put the audit at a level", `got L${inferLevel(undetected).level}`);
ok(inferLevel({ id: "det", compliance_json: { dfars_flags: [
  { clause: "252.204-7021", title: "CMMC Requirements", detected: true }
] } }).level === "2", "the same flag detected:true does — the complement stays reachable");
// The serialised remainder must not put it back through the back door.
const mixedFlags = { id: "mix2", compliance_json: {
  summary: "Routine machining effort, no safeguarding requirement identified.",
  dfars_flags: [{ clause: "252.204-7012", title: "Safeguarding Covered Defense Information", detected: false }]
} };
ok(inferLevel(mixedFlags).level === "0",
  "an undetected flag is not re-admitted by serialising the rest of the object", `got L${inferLevel(mixedFlags).level}`);

// ── the 4000-char cut ───────────────────────────────────────────────────────
// 45 of the 46 corpus rows exceed 4000 characters; the largest is 8,714. A trigger past the cut
// was invisible, so detection depended on where a key happened to land in serialisation order.
const buried = { id: "deep", compliance_json: {
  filler: "x".repeat(9000),
  note: "Contractor will process CUI under this award."
} };
ok(inferLevel(buried).level === "2",
  "a trigger past 4,000 characters is still read", `got L${inferLevel(buried).level}`);

// ── E · the CUI banner marking ──────────────────────────────────────────────
// The acronym triggers carry \b so that `cui` inside `circuit` cannot match (section above).
// Serialising the payload before matching destroyed that boundary: JSON.stringify turns a
// newline into the two characters `\` and `n`, and `n` is a word character, so `…8\nCUI\n…`
// serialises to `8\nCUI\n` where /\bCUI\b/ has nothing to anchor on.
//
// The text below is transcribed from W911SG27BA002's own persisted finding. A line holding
// nothing but CUI is the BANNER MARKING — mandatory at the top and bottom of every page of a
// document carrying it, and therefore the most reliable CUI indicator a federal document has.
// The audit was reported as requiring no CMMC at all.
console.log(`\n── E · a CUI banner marking is read ──`);
const banner = { id: "banner", compliance_json: { v3: { findings: [
  { kind: "submission", excerpt: "3, 2026 \tFE 10031 4J\nPage | 8\nCUI\n• \tUFGS 32 84 23 Underground Sprinkler", citation: "Attachment 3" }
] } } };
ok(inferLevel(banner).level === "2",
  "CUI alone on its own line is read as CUI, not swallowed by the newline escape",
  `got L${inferLevel(banner).level}`);
// The negative control the \b exists for must survive the same change.
ok(inferLevel({ id: "circ", compliance_json: { v3: { findings: [
  { kind: "technical_spec", excerpt: "Replace the printed circuit board assembly.\nTorque to spec.", citation: "SOW 3.2" }
] } } }).level === "0",
  "`circuit` on a line of its own still does not match CUI",
  `got L${inferLevel({ id: "circ", compliance_json: { v3: { findings: [{ kind: "t", excerpt: "printed circuit board", citation: "c" }] } } }).level}`);
// Tab is the other escape that yields a word character.
ok(inferLevel({ id: "tab", compliance_json: { note: "Marking:\tFCI\tapplies" } }).level === "1",
  "an acronym fenced by tabs is read", `got L${inferLevel({ id: "tab", compliance_json: { note: "Marking:\tFCI\tapplies" } }).level}`);

// ── F · the reference counts are the ones in the rule ───────────────────────
// 32 CFR 170.4 defines all three in one sentence: "the 15 Level 1 requirements listed in the
// 48 CFR 52.204-21(b)(1), the 110 Level 2 requirements from NIST SP 800-171 R2 ..., and the 24
// Level 3 requirements selected from NIST SP 800-172 Feb2021". 17 was the CMMC 1.0 Level 1
// count; 134 was 110 + 24 summed here, a figure the rule never states.
console.log(`\n── F · requirement counts match 32 CFR part 170 ──`);
ok(LEVELS["1"].requirements === 15, "Level 1 is 15 — 48 CFR 52.204-21(b)(1)(i) through (xv)", `got ${LEVELS["1"].requirements}`);
ok(LEVELS["2"].requirements === 110, "Level 2 is 110 — identical to NIST SP 800-171 R2", `got ${LEVELS["2"].requirements}`);
ok(LEVELS["3"].requirements === 24, "Level 3 is the 24 selected NIST SP 800-172 requirements", `got ${LEVELS["3"].requirements}`);
ok(/prerequisite/i.test(LEVELS["3"].requirements_note),
  "Level 3's note says the Level 2 certification is a prerequisite — 24 alone reads as the smaller obligation");
ok(!JSON.stringify(LEVELS).includes("practice"),
  "the reference does not use CMMC 1.0's 'practice' vocabulary — the rule says security requirements");

ok(inferLevel({ id: "x" }).level === "0", "an audit with no compliance_json is not flagged");
ok(inferLevel({ id: "y", compliance_json: {} }).level === "0", "an empty compliance_json is not flagged");
ok(inferLevel({ id: "z", compliance_json: null }).trigger === null, "a null compliance_json claims no trigger");

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nCMMC LEVEL INFERENCE FAILED — a level was claimed the source does not support.");
  process.exit(1);
}
console.log("cmmc-levels clean.");
