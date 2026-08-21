// GATE — a document is withheld from the lens ONLY on positive identification, and never a lens-essential one.
//
// PLANTED POSITIVES, each restored, each turning its named leg red:
//   A  drop the LENS_ESSENTIAL guard          → leg 2 (a Statement of Work carrying spec prose is withheld)
//   B  require only PART 1                    → leg 4 (a document that merely says "PART 1 GENERAL" is withheld)
//   C  make the unknown default lensExcluded  → leg 5 (an unrecognised attachment silently leaves the lens)
//   npx tsx src/lib/audit-doc-purpose.test.ts
import { classifyDocPurpose, partitionLensSource } from "./audit-doc-purpose";

let fail = 0;
const ok = (l: string, c: boolean, why: string) => { if (c) console.log(`  ✓ ${l}`); else { fail++; console.error(`  ✗ ${l} — ${why}`); } };

const CSI = "PART 1 GENERAL\n1.1 REFERENCES\nPART 2 PRODUCTS\n2.1 MATERIALS\nPART 3 EXECUTION\n3.1 INSTALLATION";

ok("1 CSI 3-part is withheld",
   classifyDocPurpose("Attachment N - UFGS 03 30 00 Cast-in-Place Concrete.pdf", CSI).lensExcluded,
   "the structural signature measured on 26 of 28 flagship specs did not fire");

ok("2 a Statement of Work is NEVER withheld, even carrying spec prose",
   !classifyDocPurpose("W911SG27BA002 Statement of Work (2).pdf", CSI).lensExcluded,
   "the lens-essential guard did not run first — this drops the document that describes the job");

ok("3 a wage determination is NEVER withheld",
   !classifyDocPurpose("Wage Determination TX20260293 (El Paso Highway).pdf", CSI).lensExcluded,
   "a WD carries the pricing floor and must reach the pricing seat");

ok("4 PART 1 alone is NOT a specification",
   !classifyDocPurpose("Attachment D - Contractor Requirements Document.pdf", "PART 1 GENERAL\nsome requirements").lensExcluded,
   "one part heading is not the 3-part structure — this withholds ordinary attachments");

ok("5 an unrecognised document stays IN the lens",
   !classifyDocPurpose("Attachment K - Site Clearance and Line Marking Permit.pdf", "no structure here").lensExcluded,
   "the default must be KEEP: a leak costs the status quo, the opposite drops binding analysis");

ok("6 a state DOT spec book is withheld by name (no 3-part structure)",
   classifyDocPurpose("Attachment L - NMDOT Spec.pdf", "compiled standard specifications").lensExcluded,
   "the largest single document on the flagship, 41.7% of the busiest seat, is not recognised");

// ── partition ────────────────────────────────────────────────────────────────────────────────────
const regionsOf = (_s: string) => [
  { name: "Solicitation - W911SG27BA002.pdf", text: "AAAA" },
  { name: "Attachment N - UFGS 03 30 00.pdf", text: CSI },
  { name: "W911SG27BA002 Statement of Work.pdf", text: "BBBB" },
];
const part = partitionLensSource("ignored", regionsOf);
ok("7 partition withholds exactly the spec",
   part.withheld.length === 1 && part.withheld[0].name.includes("UFGS"),
   `withheld ${part.withheld.length}: ${part.withheld.map((w) => w.name).join(", ")}`);
ok("8 partition keeps the solicitation and the SOW",
   part.lensSource.includes("AAAA") && part.lensSource.includes("BBBB"),
   "a kept document did not survive into lensSource — the lens would go blind");

ok("9 a single-region source is returned UNTOUCHED",
   partitionLensSource("only one doc", () => [{ name: "x", text: "only one doc" }]).lensSource === "only one doc",
   "an unparsed source must not partition to empty — that blinds every lens while reporting a saving");

// ── ⛔ THE FENCE ROUND-TRIP. This is the leg that would have caught the defect that shipped in #736:
// parseDocRegions builds `text` from the lines AFTER "==== DOCUMENT: name ====" and excludes the fence
// itself, so joining region texts strips every document boundary. Measured before the fix: 44 of 44
// banked packages lost ALL regions, 40 of them with ZERO withheld documents. ──
import { parseDocRegions } from "./primary-doc-resolve";

const fenced = [
  "==== DOCUMENT: Solicitation - X.pdf ====",
  "AAAA",
  "==== DOCUMENT: Attachment N - UFGS 03 30 00.pdf ====",
  CSI,
  "==== DOCUMENT: X Statement of Work.pdf ====",
  "BBBB",
].join("\n");

const rt = partitionLensSource(fenced, parseDocRegions);
// The fixture carries a PREAMBLE before the first fence, because that is the byte range a rebuild
// silently loses: parseDocRegions only starts buffering once it has seen a fence, so everything above
// the first one is dropped on the floor. A cleaner fixture round-trips by accident and proves nothing —
// the first version of this leg did exactly that and stayed green when the guard was deleted.
const untouched = "PREAMBLE THE PARSER NEVER SEES\n==== DOCUMENT: a.pdf ====\nAAAA\n==== DOCUMENT: b.pdf ====\nBBBB";
ok("10 a package with NOTHING withheld is returned BYTE-IDENTICAL",
   partitionLensSource(untouched, parseDocRegions).lensSource === untouched,
   "a package this rule does not even apply to was rebuilt, losing every byte above the first fence");

ok("11 the kept source ROUND-TRIPS through the same parser",
   parseDocRegions(rt.lensSource).length === 2,
   `got ${parseDocRegions(rt.lensSource).length} regions, expected 2 — resolvePrimary, docRegions and the coverage ledger all key on these fences`);

ok("12 the surviving fences name the KEPT documents, not the withheld one",
   parseDocRegions(rt.lensSource).map((r) => r.name).join("|") === "Solicitation - X.pdf|X Statement of Work.pdf",
   parseDocRegions(rt.lensSource).map((r) => r.name).join("|"));

console.log(fail ? `\n✗ ${fail} failed` : `\n✓ 12/12`);
process.exit(fail ? 1 : 0);
