// ARC #747 · E2 — INVESTIGATE (Gauntlet gate 1, $0). Census BEFORE criteria.
//
// THE DEFECT (gate 4, PANEL-d0664ba2-GATE4.md C1): the report printed "Cost/Price Supporting Documentation
// per DFARS 215-2". The source says "in accordance with FAR 15.408, Table 15-2". DFARS subpart 215.2 exists
// and is titled "Solicitation and Receipt of Proposals and Information" — it has no Table 15-2. So the emitted
// token was (a) mis-corpused (a FAR table re-prefixed DFARS) and (b) mis-shaped (215-2 is not a DFARS number
// shape at all). Meanwhile the correct DFARS cite the source DID contain — 252.215-7009 — never reached the
// report.
//
// This script does NOT propose the fix. It measures the class across every banked run record so the criteria
// are drawn from what is actually there, not from the one example that started it. Writes nothing, calls no
// model, arms no flag.
//
// HONEST LIMIT: banked records carry the post-model findings and the source. They do not carry the rendered
// report, so this sees the citation as the engine stored it — which is the layer E2 gates. Render-only
// re-prefixing, if any, is invisible here and is a separate measurement.
import * as fs from "fs";
import * as path from "path";

const DIR = path.join(__dirname, "run-records");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));

// ── EXTRACTION ────────────────────────────────────────────────────────────────────────────────────────
// Deliberately WIDE. A narrow extractor would report a small clean class and prove nothing; the point of a
// census is to see the shapes we do not already have a name for. Every hit is classified downstream.
//
// A token is a number that looks like a regulation reference, plus whatever corpus word (if any) immediately
// precedes it. `prefix` is null when the number stands bare ("per 52.219-6") — bare numbers are the majority
// and cannot be corpus-checked, which is itself a finding.
const CORPUS = "(?:FAR|DFARS|DFAR|AFFARS|VAAR|DLAD|C\\.?F\\.?R\\.?|U\\.?S\\.?C\\.?)";
// number shapes, longest-first so 252.204-7012 is never truncated to 252.204
const NUM = "\\d{1,4}\\.\\d{1,4}-\\d{1,4}|\\d{1,4}\\.\\d{1,4}|\\d{1,4}-\\d{1,4}";
const TOKEN_RE = new RegExp(`(?:(${CORPUS})\\s+)?\\b(${NUM})\\b`, "gi");

interface Tok { prefix: string | null; num: string; raw: string; }

function extract(text: string): Tok[] {
  const out: Tok[] = [];
  if (!text) return out;
  for (const m of text.matchAll(TOKEN_RE)) {
    const prefix = m[1] ? m[1].replace(/\./g, "").toUpperCase() : null;
    // A bare number with no corpus word is only a citation candidate if it has a regulation-ish shape.
    // "15-2" alone could be anything (a date, a quantity); "52.219-6" could not.
    out.push({ prefix, num: m[2], raw: m[0].trim() });
  }
  return out;
}

// Normalized presence: the source may write 52.219-6 with different spacing/case, and §/SEC. decoration.
function inSource(num: string, src: string): boolean {
  return src.includes(num);
}

// A number is WELL-FORMED for its stated corpus iff it matches that corpus's numbering grammar.
//   FAR clause 52.xxx-yy · FAR section xx.yyy(-y) · DFARS clause 252.xxx-7yyy · DFARS section 2xx.yyy
//   AFFARS 5352.xxx-yyyy · VAAR 852.xxx-yy / 8xx.yyy · CFR/USC: a bare part/section number
const SHAPE: Record<string, RegExp> = {
  FAR: /^(?:52\.\d{3}-\d{1,2}|\d{1,2}\.\d{3}(?:-\d{1,2})?)$/,
  DFARS: /^(?:252\.\d{3}-7\d{3}|2\d{2}\.\d{3,4}(?:-\d{1,2})?)$/,
  DFAR: /^(?:252\.\d{3}-7\d{3}|2\d{2}\.\d{3,4}(?:-\d{1,2})?)$/,
  AFFARS: /^(?:5352\.\d{3}-\d{4}|53\d{2}\.\d{3,4}(?:-\d{1,2})?)$/,
  VAAR: /^(?:852\.\d{3}-\d{1,2}|8\d{2}\.\d{3,4}(?:-\d{1,2})?)$/,
};

const rows: string[] = [];
let recs = 0, findings = 0;
const tally = {
  total: 0, bare: 0, prefixed: 0,
  absentFromSource: 0, presentInSource: 0,
  malformed: 0,
  corpusSwapCandidate: 0,   // prefixed, number present in source, but source pairs it with a DIFFERENT corpus
};
const malformedSamples: string[] = [];
const absentSamples: string[] = [];
const swapSamples: string[] = [];

for (const f of files) {
  let rec: any;
  try { rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
  const src: string = rec?.input?.fullSource ?? "";
  const fs_: any[] = rec?.result?.findings ?? [];
  if (!src || !fs_.length) continue;
  recs++;

  for (const fi of fs_) {
    findings++;
    // CUSTOMER-FACING FIELDS. `excerpt` is excluded on purpose — it is already verbatim-grounded, so a token
    // inside it is in the source by construction. E2's class is exactly the text that carries NO such proof.
    for (const [field, text] of [["citation", fi.citation], ["requirement", fi.requirement]] as const) {
      for (const t of extract(String(text ?? ""))) {
        tally.total++;
        if (t.prefix) tally.prefixed++; else tally.bare++;

        const present = inSource(t.num, src);
        if (present) tally.presentInSource++; else tally.absentFromSource++;

        if (t.prefix && SHAPE[t.prefix] && !SHAPE[t.prefix].test(t.num)) {
          tally.malformed++;
          if (malformedSamples.length < 25) malformedSamples.push(`${f.slice(0, 12)} ${field}: "${t.raw}"  (${t.prefix} shape rejects ${t.num}) present_in_source=${present}`);
        }
        if (!present && absentSamples.length < 25) absentSamples.push(`${f.slice(0, 12)} ${field}: "${t.raw}"`);

        // CORPUS SWAP: the number is in the source, but every occurrence there is preceded by a different
        // corpus word. That is the C1 shape exactly.
        if (present && t.prefix) {
          const near = new Set<string>();
          const re = new RegExp(`(${CORPUS})[\\s,]*(?:part |subpart |section |table )?${t.num.replace(/[.\-]/g, "\\$&")}`, "gi");
          for (const m of src.matchAll(re)) near.add(m[1].replace(/\./g, "").toUpperCase());
          if (near.size > 0 && !near.has(t.prefix)) {
            tally.corpusSwapCandidate++;
            if (swapSamples.length < 25) swapSamples.push(`${f.slice(0, 12)} ${field}: emitted "${t.raw}" — source pairs ${t.num} with [${[...near].join(", ")}]`);
          }
        }
      }
    }
  }
}

rows.push(`records ${recs} · findings ${findings}`);
rows.push(`tokens ${tally.total}  (prefixed ${tally.prefixed} · bare ${tally.bare})`);
rows.push(`present in source ${tally.presentInSource} · ABSENT ${tally.absentFromSource} (${((tally.absentFromSource / Math.max(1, tally.total)) * 100).toFixed(1)}%)`);
rows.push(`malformed for stated corpus ${tally.malformed}`);
rows.push(`corpus-swap candidates ${tally.corpusSwapCandidate}`);
rows.push("");
rows.push("── MALFORMED ──"); rows.push(...malformedSamples);
rows.push(""); rows.push("── ABSENT FROM SOURCE ──"); rows.push(...absentSamples);
rows.push(""); rows.push("── CORPUS SWAP ──"); rows.push(...swapSamples);
console.log(rows.join("\n"));
