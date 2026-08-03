// $0 read-only. GATE 1 of the Gauntlet — reproduce the run-in heading hoist on the engine's OWN assembled
// source before designing anything. Answers three questions and NOTHING else:
//   Q1  Is `Debriefings disclose the following information` really in the assembled region? (the claimed defect)
//   Q2  What is the SHAPE of a hoist site, character by character? (so a fix can key on structure, not a guess)
//   Q3  How many sites are there, and are they confined to the primary region?
// It deliberately does NOT decide whose bug it is — that needs the source PDF, and is probe 02.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT = "eab43ada-2baf-49e2-b224-a968df7864f3";

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("FATAL: supabase env missing (url set=%s key set=%s)", !!url, !!key); process.exit(1); }
  const db = createClient(url, key);

  const { data, error } = await db.from("audits").select("raw_pdf_text, solicitation_number").eq("id", AUDIT).single();
  if (error || !data) { console.error("FATAL: audit not readable:", error?.message); process.exit(1); }
  const full = (data as any).raw_pdf_text as string;
  if (!full) { console.error("FATAL: raw_pdf_text is empty — nothing to probe"); process.exit(1); }
  console.log(`audit ${AUDIT}  sol=${(data as any).solicitation_number}  raw_pdf_text=${full.length} chars\n`);

  // Split into the per-document regions the assembler writes, so every count below is attributable.
  const heads = [...full.matchAll(/^====\s*DOCUMENT:\s*(.+?)\s*====$/gm)]
    .map((m) => ({ name: m[1], at: m.index as number, len: m[0].length }));
  const regions: Array<{ name: string; text: string }> = [];
  if (!heads.length) regions.push({ name: "(no DOCUMENT markers — single region)", text: full });
  for (let i = 0; i < heads.length; i++) {
    const s = heads[i].at + heads[i].len;
    regions.push({ name: heads[i].name, text: full.slice(s, i + 1 < heads.length ? heads[i + 1].at : full.length) });
  }
  console.log("=== regions ===");
  for (const r of regions) console.log(`  ${String(r.text.length).padStart(7)} chars  ${r.name}`);

  // ── Q1 ──────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\n=== Q1 — the claimed defect, verbatim ===");
  for (const [label, needle] of [
    ["hoisted form (claimed present)", "Debriefings disclose the following information"],
    ["true FAR form (claimed absent)", "the Government will disclose the following information"],
    ["the deleted subject", "the Government will"],
    ["heading token alone", "Debriefings"],
  ] as Array<[string, string]>) {
    const hits = regions.filter((r) => r.text.includes(needle)).map((r) => r.name);
    console.log(`  ${label.padEnd(34)} ${hits.length ? `PRESENT in ${hits.length} region(s): ${hits.join(", ").slice(0, 90)}` : "ABSENT everywhere"}`);
  }

  // ── Q2 ── show the raw bytes around the site so the shape is not inferred from a paraphrase.
  console.log("\n=== Q2 — raw context around the first 'Debriefings' occurrence ===");
  const dIdx = full.indexOf("Debriefings");
  if (dIdx < 0) console.log("  'Debriefings' not present at all");
  else console.log("  " + JSON.stringify(full.slice(Math.max(0, dIdx - 260), dIdx + 320)));

  // ── Q3 ── census. The reported shape is a run-in heading landing INSIDE the sentence it introduces,
  // leaving an orphan terminator: "(b) . The Vendor agrees …" / "word . Word". Count that shape, per region.
  // Two independent recognizers, because one recognizer is a guess and two that agree are a measurement.
  const ORPHAN_TERMINATOR = /(?:^|[^.\s])\s+\.\s+[A-Z]/g;          // a period floating between spaces
  const ENUM_THEN_ORPHAN = /\(\s*[a-z0-9]{1,3}\s*\)\s+\.\s/g;      // "(b) . " — enumerator, gap, stray period
  console.log("\n=== Q3 — hoist-shape census, per region ===");
  console.log("  region".padEnd(58) + "orphan-term  enum+orphan");
  let totOrphan = 0, totEnum = 0;
  for (const r of regions) {
    const a = [...r.text.matchAll(ORPHAN_TERMINATOR)].length;
    const b = [...r.text.matchAll(ENUM_THEN_ORPHAN)].length;
    totOrphan += a; totEnum += b;
    console.log("  " + r.name.slice(0, 54).padEnd(56) + String(a).padStart(9) + String(b).padStart(12));
  }
  console.log("  " + "TOTAL".padEnd(56) + String(totOrphan).padStart(9) + String(totEnum).padStart(12));

  console.log("\n=== Q3b — the first 12 enum+orphan sites, verbatim ===");
  let shown = 0;
  for (const r of regions) {
    for (const m of r.text.matchAll(ENUM_THEN_ORPHAN)) {
      if (shown >= 12) break;
      const i = m.index as number;
      console.log(`  [${r.name.slice(0, 28)}] ` + JSON.stringify(r.text.slice(Math.max(0, i - 70), i + 140)));
      shown++;
    }
    if (shown >= 12) break;
  }
})();
