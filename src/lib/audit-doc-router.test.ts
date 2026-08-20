// $0 regression lock for THE DOCUMENT ROUTER (src/lib/audit-doc-router.ts, flag AUDIT_DOC_OWNERSHIP).
// Run: npx tsx src/lib/audit-doc-router.test.ts
//
// SUBJECT: the production `assignDocuments` / `documentsOwnedBy` / `DOC_OWNERSHIP_ENABLED`.
//
// THE RISK THIS LOCKS. Routing has exactly two ways to fail and both are silent:
//   • NOT TOTAL — a document falls out of every lens's list and nobody reads it. That is today's live
//     behaviour for 48 of 49 obligation-carrying documents, and it produced no error of any kind.
//   • NOT 1:1 — a document lands in two lenses' lists. Fanning the mandate across five lenses is what
//     blew the 270s budget on live runs 6cbabeae / e63a9b2d, and it costs five times the input tokens.
// The fixture is the REAL flagship document set (W911SG27BA002, banked run 3b5bba30) rather than invented
// names, because the defect this replaces was invisible precisely to imagined categories.
import { assignDocuments, documentsOwnedBy, DOC_OWNERSHIP_ENABLED, RESIDUE_OWNER } from "./audit-doc-router";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

const LENSES = ["capture_strategist", "contracts_attorney", "pricing_analyst", "former_ko", "proposal_manager"];

// The real flagship package, as `docRegions` returns it.
const FLAGSHIP = [
  "SAM Notice Body",
  "Solicitation - W911SG27BA002.pdf",
  "W911SG27BA002 Statement of Work (2).pdf",
  "W911SG27BA002 Instructions to Bidders.pdf",
  "W911SG27BA002 Instructions to Bidders (Revised).pdf",
  "Wage Determination TX20260293 (El Paso Highway).pdf",
  "Wage Determination NM20260035 (Dona Ana and San Juan Highway).pdf",
  "Bid Schedule_PAVE_FE 10011 0J_PavingTX.pdf",
  "Bid Schedule_PAVE_FE 10011 0J_PavingNM.pdf",
  "Attachment A - The Army Radiation Permit ARP.pdf",
  "Attachment B - As-built Requirements.pdf",
  "Attachment C - Construction and Demolition Sample Report.pdf",
  "Attachment D - Contractor Requirements Document.pdf",
  "Attachment E - DD1354 Form.pdf",
  "Attachment G - DPW SUBMITTAL FORM V.1.pdf",
  "Attachment J - SF 1413 Statement and Acknowledgement for Subcontractors.pdf",
  "Attachment K - Site Clearance and Line Marking Permit.pdf",
  "Attachment L - NMDOT Spec.pdf",
  "Attachment N - UFGS 32 12 16 Hot-Mix Asphalt HMA for Roads.pdf",
  "Attachment N - UFGS 33 40 00 Storm Drainage Utilities.pdf",
  "Solicitation Amendment W911SG27BA002 0001 SF 30.pdf",
  "A0001.pdf",
];

console.log("── OWNERSHIP IS TOTAL: every document lands somewhere, none is dropped");
{
  const a = assignDocuments(FLAGSHIP);
  const routed = new Set([...a.byDoc.map((x) => x.doc), ...a.universal]);
  ok(`all ${FLAGSHIP.length} inputs routed (got ${routed.size})`, routed.size === FLAGSHIP.length);
  const union = new Set(LENSES.flatMap((l) => documentsOwnedBy(FLAGSHIP, l)));
  ok("union of the five lenses + universal === every input",
     union.size + a.universal.length === FLAGSHIP.length);
  ok("the notice body is UNIVERSAL, never owned", a.universal.includes("SAM Notice Body") &&
     !union.has("SAM Notice Body"));
}

console.log("── ROUTING IS 1:1: no document is owned by two lenses (no fan-out)");
{
  const seen = new Map<string, string[]>();
  for (const l of LENSES) for (const d of documentsOwnedBy(FLAGSHIP, l)) seen.set(d, [...(seen.get(d) ?? []), l]);
  const dup = [...seen.entries()].filter(([, ls]) => ls.length > 1);
  ok(`zero documents with more than one owner (found ${dup.length}${dup.length ? ": " + dup[0][0] : ""})`, dup.length === 0);
}

console.log("── RESIDUE is NAMED and owned BY RULE, not silently dropped");
{
  const a = assignDocuments(FLAGSHIP);
  ok("A0001.pdf is named as residue", a.residue.includes("A0001.pdf"));
  ok("…and is still assigned, to the residue owner", a.byDoc.some((x) => x.doc === "A0001.pdf" && x.owner === RESIDUE_OWNER && x.viaResidue));
  ok("residue owner is former_ko", RESIDUE_OWNER === "former_ko");
  ok("every residue document carries a stated reason", a.byDoc.filter((x) => x.viaResidue).every((x) => x.why.length > 0));
}

console.log("── ⛔ NEGATIVE CONTROL: an unknown lens key gets NOTHING, never the whole package");
ok("documentsOwnedBy(…, 'not_a_lens') === []", documentsOwnedBy(FLAGSHIP, "not_a_lens").length === 0);

console.log("── ⛔ NEGATIVE CONTROL: the flag is OFF unless it is exactly \"true\"");
{
  const restore = process.env.AUDIT_DOC_OWNERSHIP;
  for (const v of [undefined, "", "false", "TRUE", "1", "yes"]) {
    if (v === undefined) delete process.env.AUDIT_DOC_OWNERSHIP; else process.env.AUDIT_DOC_OWNERSHIP = v;
    ok(`AUDIT_DOC_OWNERSHIP=${JSON.stringify(v)} ⇒ OFF`, DOC_OWNERSHIP_ENABLED() === false);
  }
  process.env.AUDIT_DOC_OWNERSHIP = "true";
  ok('AUDIT_DOC_OWNERSHIP="true" ⇒ ON', DOC_OWNERSHIP_ENABLED() === true);
  if (restore === undefined) delete process.env.AUDIT_DOC_OWNERSHIP; else process.env.AUDIT_DOC_OWNERSHIP = restore;
}

console.log("── the split actually DIVIDES the flagship (it is not one lens getting everything)");
{
  const counts = LENSES.map((l) => documentsOwnedBy(FLAGSHIP, l).length);
  ok(`every lens owns at least one document (${LENSES.map((l, i) => `${l.slice(0, 8)}:${counts[i]}`).join(" ")})`, counts.every((n) => n > 0));
  ok("no single lens owns more than 60% of the package", Math.max(...counts) / (FLAGSHIP.length - 1) < 0.6);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
