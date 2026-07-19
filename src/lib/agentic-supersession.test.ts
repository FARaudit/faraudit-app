// $0 PROOF for #1 AMENDMENT SUPERSESSION (Brain #344) — doc-level (#1A) decision. POST-GAUNTLET (2026-07-08):
//   • uses the PRODUCTION classifier isSf30Cover(name,text) — NOT a hardcoded isSf30 (the earlier test masked
//     F1, where a long re-issued "Amendment 02" was wrongly treated as an SF-30 cover → feature no-op);
//   • drops ONLY on FULL-CONTENT subsumption (additive superset), so a CHANGED-field amendment → keep-and-label
//     (F4: obligation-line-only subsumption could silently drop unique data). Two-sided by construction.
// Run: npx tsx src/lib/agentic-supersession.test.ts
import { versionClusterKey, resolveDocSupersession, isSf30Cover, type SupersessionInput } from "./agentic-ingest";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${l}`); };
const eq = (l: string, g: unknown, w: unknown) => { const c = JSON.stringify(g) === JSON.stringify(w); c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${l}${c ? "" : ` — got ${JSON.stringify(g)} want ${JSON.stringify(w)}`}`); };
// D uses the PRODUCTION cover classifier — exactly what audit-executor-v3.ts passes. No hardcoded flag.
const D = (name: string, text: string): SupersessionInput => ({ name, text, isSf30: isSf30Cover(name, text) });
const decOf = (decs: ReturnType<typeof resolveDocSupersession>, name: string) => decs.find((d) => d.name === name)!;
// A genuine complete re-issue is LONG (>6000 chars) — pad with distinct filler so it clears the cover-length gate.
const long = (core: string) => core + "\n" + Array.from({ length: 200 }, (_, i) => `Clause paragraph ${i}: the contractor shall comply with all applicable terms of section ${i}.`).join("\n");

// ── versionClusterKey — clusters versions, never false-clusters distinct docs ──
eq("V1 Synopsis + Synopsis Amendment 01 share a key", versionClusterKey("Synopsis.pdf"), versionClusterKey("Synopsis Amendment 01.pdf"));
ok("V2 Attachment 1 vs Attachment 2 do NOT cluster (not amendment markers)", versionClusterKey("Attachment 1 Wage.pdf") !== versionClusterKey("Attachment 2 Wage.pdf"));
eq("V3 coded J-/C- keys untouched (‑NN is a section suffix, not an amendment)", versionClusterKey("J-1234567-01.pdf"), "J-1234567-01".toUpperCase());
ok("V4 'Amendment to PWS' (marker, NO number) keeps identity — not stripped", versionClusterKey("Amendment to PWS.pdf").includes("AMENDMENT"));

// ── F1 REGRESSION GUARD — the cover classifier is CONTENT-aware, not name-only ──
ok("F1a a LONG re-issued 'Amendment 02' is NOT a cover (a valid successor)", isSf30Cover("Synopsis Amendment 02.pdf", long("re-issued solicitation")) === false);
ok("F1b a SHORT SF-30 form cover IS a cover", isSf30Cover("SF30_Amendment_0001.pdf", "STANDARD FORM 30\nAmendment of Solicitation. Item 14: the deadline is changed to 8 July 2026.") === true);

// ── POSITIVE — ADDITIVE amendment: successor is a strict superset (base verbatim + additions) → DROP ──
const BASE = [
  "The contractor shall provide custodial services for CLIN 0001 through CLIN 0018.",
  "All personnel must hold a Secret clearance prior to start.",
  "Point of contact: contracts@agency.gov.",
].join("\n");
const AMD_ADDITIVE = long([BASE, "The contractor shall staff a minimum of 21 full-time custodians."].join("\n")); // base kept VERBATIM + new content
const posDocs = [D("Synopsis.pdf", BASE), D("Synopsis Amendment 01.pdf", AMD_ADDITIVE)];
eq("A0 successor is classified a COMPLETE doc (not a cover) — F1 fixed", decOf(resolveDocSupersession(posDocs), "Synopsis Amendment 01.pdf").status, "operative");
const pos = resolveDocSupersession(posDocs);
eq("A1 additive amendment: base SUPERSEDED (every substantive line present in successor)", decOf(pos, "Synopsis.pdf").status, "superseded");
eq("A2 supersededBy points at the successor", decOf(pos, "Synopsis.pdf").supersededBy, "Synopsis Amendment 01.pdf");

// ── NEGATIVE (CHANGED FIELD) — a moved deadline/POC is ABSENT from the successor → KEEP+LABEL, never drop ──
const BASE_DATED = ["Offers are due no later than 6 July 2026.", BASE].join("\n");
const AMD_CHANGED = long(["Offers are due no later than 8 July 2026.", BASE, "The contractor shall staff a minimum of 21 custodians."].join("\n")); // deadline CHANGED
const neg = resolveDocSupersession([D("Synopsis.pdf", BASE_DATED), D("Synopsis Amendment 01.pdf", AMD_CHANGED)]);
eq("B1 changed-field amendment → possibly_superseded (RETAINED), never a silent drop of the old value", decOf(neg, "Synopsis.pdf").status, "possibly_superseded");
ok("B2 possibly_superseded still names the candidate successor", decOf(neg, "Synopsis.pdf").supersededBy === "Synopsis Amendment 01.pdf");

// ── F4 GUARD — a base whose ONLY obligation line is shared boilerplate but has UNIQUE DATA is NOT dropped ──
const DATA_BASE = ["Contractor shall comply with all terms herein.", "Delivery schedule: Task 1 due 30 days ARO; Task 2 due 60 days ARO.", "Unit price CLIN 0001: $4,200."].join("\n");
const DATA_AMD = long(["Contractor shall comply with all terms herein.", "Revised scope narrative."].join("\n")); // keeps the boilerplate, DROPS the unique data
const f4 = resolveDocSupersession([D("Pricing.pdf", DATA_BASE), D("Pricing Amendment 01.pdf", DATA_AMD)]);
eq("F4 unique data (schedule/price) absent from successor → NOT dropped (kept+labelled)", decOf(f4, "Pricing.pdf").status, "possibly_superseded");

// ── SF-30 cover in a cluster is field-level (#1B) — never doc-level dropped ──────
const withSf30 = resolveDocSupersession([
  D("Synopsis.pdf", BASE),
  D("SF30 Amendment 0001.pdf", "STANDARD FORM 30\nAmendment of Solicitation. Item 14: the deadline is changed to 8 July 2026."),
]);
eq("C1 SF-30 cover is NOT a doc-level successor → base stays operative", decOf(withSf30, "Synopsis.pdf").status, "operative");
eq("C2 the SF-30 cover itself stays operative (retained, field-level handled elsewhere)", decOf(withSf30, "SF30 Amendment 0001.pdf").status, "operative");

// ── lower with ZERO substantive lines cannot be PROVEN subsumed → keep-and-label ─
const noBinding = resolveDocSupersession([D("Synopsis.pdf", "   \n=====\n   "), D("Synopsis Amendment 01.pdf", long("real content"))]);
eq("D1 no substantive content in base → possibly_superseded (never dropped on absence of evidence)", decOf(noBinding, "Synopsis.pdf").status, "possibly_superseded");

// ── a cluster with no NUMBERED successor drops nothing ───────────────────────────
const noNum = resolveDocSupersession([D("Synopsis.pdf", BASE), D("Synopsis Revised.pdf", long(BASE))]);
eq("E1 no amendment-numbered successor → base stays operative (no drop)", decOf(noNum, "Synopsis.pdf").status, "operative");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
