// ARC #747 · E1 — GATE 1 INVESTIGATION ($0, real record, no build yet).
//
// QUESTION: how often does a stored excerpt begin MID-CLAUSE, and what does the dropped head contain?
// Gate 4 found three (C1 · S2 · S7) by reading. This measures the class across a real audit's whole finding
// set, so the detector is designed against observed shapes rather than imagined ones.
//
// For every finding excerpt that IS verbatim in the stored source, it looks at what immediately PRECEDES the
// match and reports the excerpts whose head was cut. It deliberately reports raw observations, not verdicts.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const ID_PREFIX = process.argv[2] ?? "d0664ba2";

function canonChar(c: string): string {
  if (c === "‘" || c === "’") return "'";
  if (c === "“" || c === "”") return '"';
  return c;
}
function normMap(source: string): { norm: string; map: number[] } {
  let norm = ""; const map: number[] = []; let prevSpace = false;
  for (let i = 0; i < source.length; i++) {
    const c = canonChar(source[i]);
    if (/\s/.test(c)) { if (prevSpace) continue; norm += " "; map.push(i); prevSpace = true; }
    else { norm += c.toLowerCase(); map.push(i); prevSpace = false; }
  }
  return { norm, map };
}
function canon(s: string): string {
  let out = "", prevSpace = false;
  for (const raw of s) {
    const c = canonChar(raw);
    if (/\s/.test(c)) { if (!prevSpace) { out += " "; prevSpace = true; } }
    else { out += c.toLowerCase(); prevSpace = false; }
  }
  return out.trim();
}

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  // id is a uuid column — LIKE is not available on it, so match the prefix client-side over recent rows.
  const { data, error } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  if (error) { console.error(error.message); process.exit(1); }
  const row = ((data ?? []) as Record<string, any>[]).find((r) => String(r.id).startsWith(ID_PREFIX));
  if (!row) { console.error(`no audit row matching ${ID_PREFIX}`); process.exit(1); }

  const source: string = row.raw_pdf_text ?? "";
  const cj = row.compliance_json ?? {};
  const findings: any[] = cj.findings ?? cj.typed_findings ?? cj.v3?.findings ?? [];
  console.log(`audit ${row.id}  sol=${row.solicitation_number}  engine=${cj.engine ?? "?"}`);
  console.log(`source chars: ${source.length}   findings: ${findings.length}\n`);
  if (!source || !findings.length) {
    console.log("keys on compliance_json:", Object.keys(cj).join(", "));
    process.exit(1);
  }

  const { norm, map } = normMap(source);
  const rows: any[] = [];
  let grounded = 0, notLocatable = 0, ambiguous = 0;

  for (const f of findings) {
    const ex: string = f.excerpt ?? "";
    if (!ex.trim()) continue;
    const c = canon(ex);
    const at = norm.indexOf(c);
    if (at < 0) { notLocatable++; rows.push({ id: f.id, lens: f.lens, state: "NOT-IN-SOURCE", excerpt: ex.slice(0, 80) }); continue; }
    const dup = norm.indexOf(c, at + 1) >= 0;
    if (dup) ambiguous++;
    grounded++;

    // What sits immediately before the match, back to the start of the physical source line.
    const startOrig = map[at];
    const lineStart = source.lastIndexOf("\n", startOrig - 1) + 1;
    const droppedHead = source.slice(lineStart, startOrig);
    const firstChar = ex.trim()[0];
    const signals: string[] = [];
    if (droppedHead.trim().length > 0) signals.push("head-on-same-line");
    if (/^[a-z]/.test(ex.trim())) signals.push("starts-lowercase");
    if (/^[\d)\].,;:-]/.test(ex.trim())) signals.push("starts-nonalpha");
    // The C1 shape: the excerpt's first token is a SUFFIX of a longer token on the source line
    // ("15-2" inside "Table 15-2"). Checked against the character immediately before the match.
    const prevChar = startOrig > 0 ? source[startOrig - 1] : "\n";
    if (/[\w.-]/.test(prevChar)) signals.push("cuts-inside-a-token");
    if (droppedHead.trim().length > 0) {
      rows.push({
        id: f.id, lens: f.lens, state: "HEAD-CLIPPED", signals,
        droppedHead: droppedHead.slice(-90).replace(/\s+/g, " "),
        excerpt: ex.slice(0, 70).replace(/\s+/g, " "),
        firstChar, ambiguous: dup,
      });
    }
  }

  const clipped = rows.filter((r) => r.state === "HEAD-CLIPPED");
  console.log(`grounded excerpts: ${grounded}   not-locatable: ${notLocatable}   ambiguous (>1 occurrence): ${ambiguous}`);
  console.log(`HEAD-CLIPPED (text precedes the match on the same source line): ${clipped.length}\n`);
  for (const r of clipped) {
    console.log(`── ${r.id ?? "?"} · ${r.lens}   [${r.signals.join(", ")}]${r.ambiguous ? "  ⚠ambiguous" : ""}`);
    console.log(`   dropped head: …${r.droppedHead}`);
    console.log(`   excerpt     : ${r.excerpt}…\n`);
  }
  for (const r of rows.filter((r) => r.state === "NOT-IN-SOURCE")) {
    console.log(`── ${r.id ?? "?"} · ${r.lens}   NOT VERBATIM IN SOURCE: ${r.excerpt}`);
  }

  const out = `/private/tmp/claude-501/-Users-josearodriguezjr--faraudit-app/51e0b241-d7b8-4552-a55a-d58348a15227/scratchpad/e1-headclip-${ID_PREFIX}.json`;
  writeFileSync(out, JSON.stringify({ id: row.id, sol: row.solicitation_number, grounded, notLocatable, ambiguous, rows }, null, 2));
  console.log(`\nwritten: ${out}`);
})();
