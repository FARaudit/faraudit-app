// $0 regression lock for the DOCUMENT OWNERSHIP MAP (src/lib/audit-doc-ownership.ts).
// Run: npx tsx src/lib/audit-doc-ownership.test.ts
//
// SUBJECT: the production `ownerOf` / `normalizeDocName`, not a re-implementation.
//
// THE RISK THIS LOCKS. The map is a pure function of a filename, so a rule that stops matching is
// INVISIBLE at runtime — the document simply becomes residue and the coverage number drifts down with
// no error anywhere. Every fixture below is a name ACTUALLY OBSERVED in the banked corpus, and the
// separator cases are the real defect that took residue from 22% to 15%: `_` is a word character so it
// defeats \b, and `+`/`%28` survive into SAM filenames where a human would type a space.
import { ownerOf, normalizeDocName, type Owner } from "./audit-doc-ownership";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };
const owns = (name: string, expected: Owner) => {
  const got = ownerOf(name).owner;
  ok(`${expected.padEnd(19)} ← ${name.slice(0, 68)}${got === expected ? "" : `   [got ${got}]`}`, got === expected);
};

console.log("── observed names route to their lane (positive fixtures)");
owns("Wage Determination TX20260293 (El Paso Highway).pdf", "pricing_analyst");
owns("Bid Schedule_PAVE_FE 10011 0J_PavingTX.pdf", "pricing_analyst");
owns("W911SG27BA002 Instructions to Bidders (Revised).pdf", "proposal_manager");
owns("ATT12_Submittal Register.pdf", "proposal_manager");
owns("Attachment A - The Army Radiation Permit ARP.pdf", "contracts_attorney");
owns("Attachment K - Site Clearance and Line Marking Permit.pdf", "contracts_attorney");
owns("W911SG27BA002 Statement of Work (2).pdf", "capture_strategist");
owns("Attachment N - UFGS 32 12 16 Hot-Mix Asphalt HMA for Roads.pdf", "capture_strategist");
owns("Attachment L - NMDOT Spec.pdf", "capture_strategist");
owns("Attachment B - As-built Requirements.pdf", "capture_strategist");
owns("Solicitation Amendment W911SG27BA002 0001 SF 30.pdf", "former_ko");
owns("Attachment E - DD1354 Form.pdf", "former_ko");

console.log("── separator normalization: the defect that cost 7 points of residue");
owns("Attachment 1 — Statement+of+Work+-+Dorm+Cameras+%28Updated+v2%29.pdf", "capture_strategist");
ok("normalizeDocName flattens _ + %28 to spaces",
   normalizeDocName("ATT12_Submittal+Register%28v2%29.pdf") === "ATT12 Submittal Register v2 pdf");

console.log("── NEGATIVE CONTROLS — these must STAY residue, never be silently defaulted");
owns("A0001.pdf", "RESIDUE");
owns("36C24126Q0569 0002.docx", "RESIDUE");
owns("697DCK-26-R-00186 0002.pdf", "RESIDUE");
owns("Attachment C - Construction and Demolition Sample Report.pdf", "RESIDUE");

console.log("── the map is TOTAL and 1:1: exactly one owner per name, always a defined value");
const ALL: Owner[] = ["capture_strategist", "contracts_attorney", "pricing_analyst", "former_ko", "proposal_manager", "RESIDUE"];
for (const n of ["", "  ", "x.pdf", "Wage Determination and Bid Schedule and SOW.pdf"]) {
  const r = ownerOf(n);
  ok(`ownerOf(${JSON.stringify(n.slice(0, 40))}) returns exactly one known owner + a reason`,
     ALL.includes(r.owner) && typeof r.why === "string" && r.why.length > 0);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
