// $0 FORENSIC — REPORT-TRUTH fix #2. Census the AFFIRMATIVE NON-PRESENCE claim class on the real stored run 95698f91:
// findings that assert something is NOT in the source ("no X visible", "X is not reproduced", "unknown"). Each one is
// a claim about ABSENCE, and absence is the one claim the engine cannot ground in an excerpt — so it ships unchecked.
//
// The Gauntlet found 3 of these were FALSE against raw_pdf_text, one of them expensively so (52.222-43 SCA escalation:
// a bidder who believes there is no escalation clause pads 4 option years the clause reimburses, and loses a price-only
// buy). This enumerates the class and tests each claim's SUBJECT against the source, to size the gate before building it.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT_ID = "95698f91-ddeb-4ed2-b5c4-eda18495219a";

// SHAPE patterns, not a vocabulary list (Brain doctrine: no blocklists — shape allowlists only). Each describes a
// GRAMMATICAL form of asserted absence, independent of the subject being denied.
const NONPRESENCE_SHAPES: Array<[string, RegExp]> = [
  ["no X <perception-verb>", /\bno\s+[^.;]{3,60}?\s+(?:visible|found|present|stated|provided|included|specified|identified|indicated)\b/gi],
  ["X is/are not <perception-verb>", /\b(?:is|are|was|were)\s+not\s+(?:visible|found|present|stated|provided|included|specified|identified|reproduced|attached)\b/gi],
  ["X is unknown/undetermined", /\b(?:is|are|remain[s]?)\s+(?:unknown|undetermined|unspecified|unavailable)\b/gi],
  ["not X in the provided/available", /\bnot\s+[^.;]{0,40}?in\s+the\s+(?:provided|available|supplied|furnished)\b/gi],
  ["absent/omitted/missing from", /\b(?:absent|omitted|missing)\s+from\b/gi],
  ["does not <appear|contain|include>", /\bdoes\s+not\s+(?:appear|contain|include|reference|cite)\b/gi],
];

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row, error } = await admin.from("audits").select("compliance_json,raw_pdf_text").eq("id", AUDIT_ID).single();
  if (error) throw new Error(JSON.stringify(error));
  const cj = (row as { compliance_json: Record<string, any> }).compliance_json;
  const full: string = (row as { raw_pdf_text: string }).raw_pdf_text;
  const findings = cj.v3.findings as Array<Record<string, unknown>>;

  console.log(`source ${full.length} chars · ${findings.length} findings\n`);

  const hits: Array<{ i: number; shape: string; span: string; text: string; sev: string }> = [];
  findings.forEach((f, i) => {
    const text = `${String(f.requirement ?? "")} ${String(f.excerpt ?? "")}`;
    for (const [label, re] of NONPRESENCE_SHAPES) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) { hits.push({ i, shape: label, span: m[0].replace(/\s+/g, " "), text: String(f.requirement ?? ""), sev: String(f.severity ?? "?") }); break; }
    }
  });

  console.log(`===== AFFIRMATIVE NON-PRESENCE CLAIMS: ${hits.length} of ${findings.length} findings (${(hits.length / findings.length * 100).toFixed(0)}%) =====\n`);
  for (const h of hits) {
    console.log(`[#${h.i} ${h.sev}] shape="${h.shape}"`);
    console.log(`   asserted absence: "${h.span}"`);
    console.log(`   claim: ${h.text.slice(0, 200).replace(/\s+/g, " ")}`);
    console.log("");
  }

  // ---- the three the Gauntlet refuted, with the token that refutes each -----------------------------------------
  console.log("===== GAUNTLET-REFUTED CLAIMS · is the denied thing actually in the source? =====");
  const REFUTERS: Array<[string, RegExp]> = [
    ["SCA wage rates 'unknown'", /2015-5631/],
    ["'no set-aside visible'", /52\.219-6/],
    ["'no escalation clause visible'", /52\.222-43/],
  ];
  for (const [label, re] of REFUTERS) {
    const m = re.exec(full);
    const line = m ? full.slice(0, m.index).split("\n").length : -1;
    console.log(`   ${label.padEnd(34)} → ${m ? `REFUTED: ${re.source} present at line ${line}` : "not found"}`);
  }

  // ---- how cheap is the check? ----------------------------------------------------------------------------------
  console.log("\n===== FEASIBILITY: are FAR/DFARS clause cites extractable from the claim text? =====");
  const CLAUSE_RE = /\b(?:52|252)\.\d{3}-\d{1,2}\b/g;
  let claimsWithCite = 0;
  for (const h of hits) {
    const cites = [...new Set((`${h.text} ${findings[h.i].excerpt ?? ""}`).match(CLAUSE_RE) ?? [])];
    if (cites.length) claimsWithCite++;
    console.log(`   #${h.i}: cites in claim text = ${cites.length ? cites.join(", ") : "(none — needs a subject extractor, not a cite match)"}`);
  }
  console.log(`\n   ${claimsWithCite}/${hits.length} non-presence claims name a clause number in their own text.`);
})();
