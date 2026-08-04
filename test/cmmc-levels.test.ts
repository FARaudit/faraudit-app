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
ok(inferLevel(both).level === "2", "a Level 2 clause outranks a Level 1 clause on the same audit");

const critical = { id: "crit", compliance_json: { summary: "Designated critical program with CUI." } };
ok(inferLevel(critical).level === "3", "a critical-program designation reaches Level 3");

ok(inferLevel({ id: "x" }).level === "0", "an audit with no compliance_json is not flagged");
ok(inferLevel({ id: "y", compliance_json: {} }).level === "0", "an empty compliance_json is not flagged");
ok(inferLevel({ id: "z", compliance_json: null }).trigger === null, "a null compliance_json claims no trigger");

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nCMMC LEVEL INFERENCE FAILED — a level was claimed the source does not support.");
  process.exit(1);
}
console.log("cmmc-levels clean.");
