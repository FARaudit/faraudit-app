// DENOMINATOR STEP 0 — measure the construction arm offline, $0, no flag, no paid run.
// Calls the PRODUCTION sweep (`sweepConstructionManifest`) and the PRODUCTION carriers
// (`constructionRequired`, `constructionCoreMissing`). Nothing is reimplemented.
//
// ══ FIDELITY BOUNDARY — read before quoting any number here ══
// The banked run-records carry the ASSEMBLED `input.fullSource`, never a per-document {name,text} array
// (verified: 0 of 52 records). So the sweep is fed ONE pseudo-document. Consequences, stated per output:
//
//   FAITHFUL   · isConstruction via the NAICS arm — `input.naics` is banked, and naicsConstruction
//                (/^23\d{4}$/) "may fire alone" as authoritative SAM metadata (sweep :119-124).
//   FAITHFUL   · element PRESENCE — production loops `for (const d of docs)` over every doc, so scanning
//                the concatenation finds exactly the same element set. Only sourceDoc/anchor ATTRIBUTION
//                differs, and this probe does not report attribution.
//   UPPER BOUND· isConstruction via the HEADER arm — production tests SF1442_HEADER_RE against docs[0]
//                ONLY (primary-region-scoped, card 265: a stray "SF 1442" in an attachment must not flip
//                a services buy). Feeding the concatenation lets an attachment fire it. Over-detects.
//   NOT ANSWERABLE · docAttestations (hasText, groundableObligations) — one pseudo-doc instead of ~45.
//                The per-document layer is the whole point of layer B, and it needs a re-ingest.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sweepConstructionManifest, constructionRequired, constructionCoreMissing, CONSTRUCTION_CORE } from "/Users/josearodriguezjr./faraudit-app/src/lib/audit-construction-manifest";

const DIR = "/Users/josearodriguezjr./faraudit-app/scripts/audit-ai/run-records";
type Row = {
  file: string; sol: string | null; naics: string | null;
  naicsArm: boolean; headerArm: boolean; isConstruction: boolean;
  elements: string[]; required: string[]; coreMissing: string[];
  docsUncovered: number | null; docsComplete: boolean | null; truncatedNamed: number | null;
};
const rows: Row[] = [];

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let d: any;
  try { d = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { continue; }
  const full: string | undefined = d?.input?.fullSource;
  if (!full) continue;
  const naics: string | null = d?.input?.naics ?? null;

  // Production sweep, one pseudo-doc (see fidelity boundary above).
  const m = sweepConstructionManifest([{ name: "<assembled>", text: full }], naics);
  // Re-derive the two arms separately so the FAITHFUL one can be reported apart from the BOUND.
  const naicsArm = /^23\d{4}$/.test((naics ?? "").trim());
  const headerArm = m.isConstruction && !naicsArm;   // sweep already ORs them; this isolates the header contribution

  const dc = d?.result?.coverage?.docCoverage ?? null;
  const unc: string[] = dc?.uncovered ?? [];
  rows.push({
    file: f, sol: d?.meta?.sol ?? null, naics,
    naicsArm, headerArm, isConstruction: m.isConstruction,
    elements: m.elements.filter((e) => e.present).map((e) => e.key),
    required: constructionRequired(m),
    coreMissing: constructionCoreMissing(m),
    docsUncovered: dc ? unc.length : null,
    docsComplete: dc ? !!dc.complete : null,
    // The banked doc NAMES carry ingest markers — a readable proxy for the unread/truncated set.
    truncatedNamed: dc ? unc.filter((u) => /truncat|extraction_failed|no[\s-]?text|scanned/i.test(String(u))).length : null,
  });
}

const n = rows.length;
const pct = (k: number) => `${k} of ${n} (${Math.round((100 * k) / n)}%)`;
console.log(`records with a banked fullSource: ${n}\n`);

console.log("── 1. isConstruction — would the part36 carrier engage at all?");
console.log(`   FAITHFUL  NAICS arm (23xxxx, authoritative SAM metadata) : ${pct(rows.filter((r) => r.naicsArm).length)}`);
console.log(`   BOUND     header arm only (over-detects, see boundary)   : ${pct(rows.filter((r) => r.headerArm).length)}`);
console.log(`   UPPER BD  either arm                                     : ${pct(rows.filter((r) => r.isConstruction).length)}`);
console.log(`   records carrying a naics at all                          : ${pct(rows.filter((r) => r.naics).length)}`);

const cons = rows.filter((r) => r.isConstruction);
console.log(`\n── 2. For those ${cons.length}: what does the carrier put in \`required\`?`);
console.log(`   (today's live path returns BINDING_SECTIONS.filter(present); on 3b5bba30 that measured ["L"])`);
const hist = new Map<string, number>();
for (const r of cons) { const k = r.required.slice().sort().join("+") || "(none)"; hist.set(k, (hist.get(k) ?? 0) + 1); }
for (const [k, v] of [...hist].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  required = [${k}]`);
const sizes = cons.map((r) => r.required.length).sort((a, b) => a - b);
if (sizes.length) console.log(`   required SIZE — min ${sizes[0]} · median ${sizes[Math.floor(sizes.length / 2)]} · max ${sizes[sizes.length - 1]}  (carrier max is ${5})`);

console.log(`\n── 3. Honest-fail direction: would the core gate CAP these?`);
console.log(`   CONSTRUCTION_CORE = [${CONSTRUCTION_CORE.join(", ")}] — any missing ⇒ INCOMPLETE`);
const capped = cons.filter((r) => r.coreMissing.length > 0);
console.log(`   would cap to INCOMPLETE on core: ${capped.length} of ${cons.length}`);
const cm = new Map<string, number>();
for (const r of cons) { const k = r.coreMissing.slice().sort().join("+") || "(none missing)"; cm.set(k, (cm.get(k) ?? 0) + 1); }
for (const [k, v] of [...cm].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  missing: ${k}`);

console.log(`\n── 4. The document layer (layer B) — what is banked vs what needs a re-ingest`);
const withDc = rows.filter((r) => r.docsUncovered !== null);
console.log(`   records banking a docCoverage result : ${pct(withDc.length)}`);
console.log(`   of those, docCoverage.complete=false : ${withDc.filter((r) => r.docsComplete === false).length}`);
const tot = withDc.reduce((a, r) => a + (r.docsUncovered ?? 0), 0);
console.log(`   uncovered documents NAMED, total     : ${tot}   (max on one package: ${Math.max(0, ...withDc.map((r) => r.docsUncovered ?? 0))})`);
console.log(`   of those, names marked truncated/failed: ${withDc.reduce((a, r) => a + (r.truncatedNamed ?? 0), 0)}`);
console.log(`   ⚠ hasText / groundableObligations per document: NOT ANSWERABLE offline — 0 of 52 records`);
console.log(`     bank a per-doc {name,text} array. This is the layer the arm actually turns on.`);

console.log(`\n── 5. Per-record detail (construction-positive only)`);
for (const r of cons) console.log(`   ${(r.sol ?? r.file).slice(0, 26).padEnd(28)} naics=${String(r.naics ?? "-").padEnd(7)} arm=${r.naicsArm ? "NAICS" : "header"} required=[${r.required.join(",")}] coreMissing=[${r.coreMissing.join(",")}] uncoveredDocs=${r.docsUncovered ?? "-"}`);
