// Regenerate public/naics-reference.js from 13 CFR 121.201.
//
//   node scripts/naics/build-naics-reference.mjs           # fetch live, write the file
//   node scripts/naics/build-naics-reference.mjs --check    # fail if the file is stale
//
// WHY A SCRIPT AND NOT A HAND-EDITED TABLE. The table the platform reads for size
// standards was typed by hand, and checking 27 rows against the regulation found two
// thresholds wrong (334511 said 1,250 where SBA says 1,350; 541513 said $34M where SBA
// says $37.0M), five absent, two codes duplicated, and one code (811219) that no longer
// exists in the regulation at all. Every one of those is invisible to a reader and all
// of them reach the audit engine's eligibility reasoning. Generated data cannot drift
// from its source between revisions; typed data always does.
//
// SBA revises 121.201 on its own schedule. Re-run this, commit the diff, and the diff
// itself is the change record.
//
// WHAT IS AUTHORITATIVE AND WHAT IS OURS. Code, title, threshold, threshold kind, sector
// and subsector all come from the regulation. Category, evaluation method, clause regime,
// the "what to expect" note and the search synonyms are OUR editorial judgment, exist for
// a small number of defense-relevant codes, and are carried across by code. A row with no
// editorial entry emits empty strings — never a guess. Rendering must treat those as
// absent, because inventing a size standard or an expectation is the one error here that
// could flip a verdict.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "public", "naics-reference.js");
const SRC = "https://www.ecfr.gov/api/versioner/v1/full/2026-01-01/title-13.xml?part=121&section=121.201";

// ── the editorial overlay, keyed by code ──────────────────────────────────────────────
// Carried forward verbatim from the curated table. Anything not named here emits empty.
const OVERLAY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "overlay.json"), "utf8"));

// ── parse ─────────────────────────────────────────────────────────────────────────────
// Footnote markers are <sup> elements INSIDE the value cells. Left in, they concatenate
// onto the number — "1,250" and footnote 7 read as "1,250 7" — so they are removed before
// any text is taken. This was caught by a comparison whose own output was nonsense.
const detag = (s) =>
  s.replace(/<sup>[\s\S]*?<\/sup>/g, "")
   .replace(/<[^>]+>/g, "")
   .replace(/&#8212;|&mdash;/g, "—")
   .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&nbsp;|&#160;/g, " ")
   .replace(/\s+/g, " ")
   .trim();

function parse(xml) {
  const out = [];
  let sector = null, subsector = null;
  const trs = xml.match(/<TR>[\s\S]*?<\/TR>/g) ?? [];
  for (const tr of trs) {
    const cells = [...tr.matchAll(/<T[DH][^>]*>([\s\S]*?)<\/T[DH]>/g)].map((m) => detag(m[1]));
    if (!cells.length) continue;
    const first = cells[0];

    // "Sector 11—Agriculture..." / "Subsector 111—Crop Production"
    // SECTORS?, PLURAL. The two ranged headings read "Sectors 31-33—Manufacturing" and
    // "Sectors 48-49—Transportation and Warehousing". Requiring whitespace after
    // "Sector" skipped both, and because every row still inherited SOME heading, machine
    // shops silently filed under Construction while a presence check reported all clear.
    const sec = first.match(/^Sectors?\s+(\d{2}(?:\s*[-–—]\s*\d{2})?)\s*[–—-]\s*(.+)$/);
    if (sec) { sector = { id: sec[1].replace(/\s*[-–—]\s*/, "-").trim(), label: sec[2].trim() }; subsector = null; continue; }
    const sub = first.match(/^Subsector\s+(\d+)\s*[–—-]\s*(.+)$/);
    if (sub) { subsector = { id: sub[1].trim(), label: sub[2].trim() }; continue; }

    if (!/^\d{6}$/.test(first)) continue;
    const [code, title, rev, emp] = [cells[0], cells[1] ?? "", cells[2] ?? "", cells[3] ?? ""];

    // Exactly one of the two columns carries the threshold. A row with both or neither is
    // a parse failure, not a data point — assert rather than emit something plausible.
    const hasRev = !!rev.replace(/[^0-9.]/g, "");
    const hasEmp = !!emp.replace(/[^0-9.]/g, "");
    if (hasRev === hasEmp) throw new Error(`${code}: expected exactly one threshold, got rev=${JSON.stringify(rev)} emp=${JSON.stringify(emp)}`);

    // Money is printed "$45.0" in the regulation; the platform renders "$45M". Employee
    // counts pass through with their thousands separator.
    const size = hasRev ? "$" + rev.replace(/[$\s]/g, "").replace(/\.0$/, "") + "M" : emp.replace(/\s/g, "");
    out.push({
      code, title, size, kind: hasRev ? "rev" : "emp",
      sector: sector ? sector.id : "", sectorLabel: sector ? sector.label : "",
      subsector: subsector ? subsector.id : "", subsectorLabel: subsector ? subsector.label : "",
    });
  }
  return out;
}

// ── emit ──────────────────────────────────────────────────────────────────────────────
const q = (s) => "'" + String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";

function emit(rows, sectors) {
  const data = rows.map((r) => {
    const o = OVERLAY.rows[r.code] ?? {};
    return "   [" + [r.code, o.cat ?? "", r.title, r.size, r.kind, o.eval ?? "", o.clause ?? "", o.note ?? "", r.sector].map(q).join(",") + "]";
  }).join(",\n");

  return `/* NAICS reference — GENERATED. Do not edit by hand.
 *
 *   node scripts/naics/build-naics-reference.mjs
 *
 * Code, title, size standard, threshold kind and sector are transcribed from
 * 13 CFR 121.201 — the regulation itself, not a summary of it. A threshold here is a
 * REFERENCE figure: the solicitation's own stated standard governs when it differs, and
 * this never substitutes for the document.
 *
 * Category, evaluation method, clause regime and the note are editorial and exist only
 * for a small set of defense-relevant codes. They are EMPTY on every other row, and an
 * empty one means we have not written it — never that the answer is nothing.
 *
 * Row shape: [code, category, title, sizeStandard, sizeKind, evalMethod, clauseRegime, note, sector]
 */
(function () {
  'use strict';
  var SECTORS=[${sectors.map((s) => `{id:${q(s.id)},label:${q(s.label)}}`).join(",")}];
  var CATS=${JSON.stringify(OVERLAY.cats).replace(/"(\w+)":/g, "$1:")};
  var DATA=[
${data}
  ];
  var SYN=${JSON.stringify(OVERLAY.syn)};

  var byCode = {};
  /* One row per code, asserted rather than assumed: a repeated code throws here instead
     of resolving to whichever copy was written last. */
  for (var i = 0; i < DATA.length; i++) {
    var c = DATA[i][0];
    if (byCode[c]) { throw new Error('naics-reference: duplicate code ' + c); }
    byCode[c] = DATA[i];
  }

  window.NAICS_REF = {
    CATS: CATS, DATA: DATA, SYN: SYN, SECTORS: SECTORS,
    byCode: byCode,
    sectorOf: function (code) { var r = byCode[String(code)]; return r ? r[8] : ''; },
    /* Free-text match over code, title and the synonym list. Returns rows, never a
       verdict: a query that matches nothing means this table does not know the code,
       which is not the same as the code being invalid. */
    search: function (q) {
      var s = String(q || '').trim().toLowerCase();
      if (!s) return [];
      return DATA.filter(function (r) {
        return r[0].indexOf(s) === 0
          || r[2].toLowerCase().indexOf(s) !== -1
          || (SYN[r[0]] || '').indexOf(s) !== -1;
      });
    }
  };
})();
`;
}

// ── run ───────────────────────────────────────────────────────────────────────────────
const res = await fetch(SRC);
if (!res.ok) throw new Error(`eCFR responded ${res.status} — refusing to write a partial table`);
const xml = await res.text();
const rows = parse(xml);

if (rows.length < 900) throw new Error(`only ${rows.length} codes parsed — the source layout probably changed; refusing to overwrite`);
const dupes = rows.map((r) => r.code).filter((c, i, a) => a.indexOf(c) !== i);
if (dupes.length) throw new Error(`duplicate codes in the SOURCE: ${[...new Set(dupes)].join(", ")}`);

const sectors = [];
for (const r of rows) if (r.sector && !sectors.some((s) => s.id === r.sector)) sectors.push({ id: r.sector, label: r.sectorLabel });

/* A SECTOR IS THE CODE'S OWN FIRST TWO DIGITS — so it is checkable, and it is checked.
   Reading the sector off "whichever heading we passed most recently" is only correct
   while every heading parses; when two did not, 400-odd manufacturing codes inherited
   Construction and nothing complained, because they all still HAD a sector. Presence was
   never the property worth asserting. */
const inSector = (code, id) => {
  const p = Number(code.slice(0, 2));
  const [lo, hi] = id.split("-").map(Number);
  return p >= lo && p <= (hi ?? lo);
};
const misfiled = rows.filter((r) => !r.sector || !inSector(r.code, r.sector));
if (misfiled.length) {
  const eg = misfiled.slice(0, 4).map((r) => `${r.code} filed under sector ${r.sector || "(none)"}`).join("; ");
  throw new Error(`${misfiled.length} code(s) are not inside the sector they were filed under: ${eg}`);
}

// Every overlay entry must still name a live code. 811219 was carried for months after
// NAICS folded it into 811210, so a customer could pick a code the regulation no longer has.
const live = new Set(rows.map((r) => r.code));
const stale = Object.keys(OVERLAY.rows).filter((c) => !live.has(c));
if (stale.length) throw new Error(`overlay names code(s) absent from 121.201: ${stale.join(", ")} — retire or remap them in overlay.json`);

const out = emit(rows, sectors);
if (process.argv.includes("--check")) {
  const cur = readFileSync(OUT, "utf8");
  if (cur !== out) { console.error("naics-reference.js is STALE — re-run the build and commit the result."); process.exit(1); }
  console.log(`✓ naics-reference.js matches 121.201 — ${rows.length} codes, ${sectors.length} sectors`);
} else {
  writeFileSync(OUT, out);
  console.log(`wrote ${OUT}\n  ${rows.length} codes · ${sectors.length} sectors · ${Object.keys(OVERLAY.rows).length} editorial rows carried · ${(out.length / 1024).toFixed(1)} KB`);
}
