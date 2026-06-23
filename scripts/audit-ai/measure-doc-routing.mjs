// Stage-2 PRE-BUILD MEASUREMENT — prove (or disprove) that per-call section
// routing actually drops tokens enough to hit ~$2, BEFORE writing the router
// into the engine. Zero Opus spend: text extraction is local, token counts use
// the FREE /count_tokens endpoint.
//
// For each real package on disk it: extracts each doc's text (same extractor
// the engine uses), counts its tokens, classifies its section roles from the
// filename (same regex the engine uses), then simulates two routing policies
// per call (overview / compliance / risks) against the full-set baseline.
//
// Run: npx tsx scripts/audit-ai/measure-doc-routing.mjs
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// pdf-parse directly (the engine's extractor pulls an OCR chain that won't load
// standalone). For clean text PDFs this yields ~the same text → token magnitudes
// are representative, which is all the routing decision needs.
const pdfParseMod = require("pdf-parse");
const PdfParseCtor = pdfParseMod?.PDFParse ?? pdfParseMod?.default ?? pdfParseMod;
async function extractText(buf) {
  const inst = new PdfParseCtor({ data: buf });
  const out = await inst.getText();
  return { rawText: String(out?.text ?? "") };
}

// Inlined VERBATIM from src/lib/sam-attachments.ts (the import chain pulls @/
// aliases that tsx can't resolve standalone). Keep in sync with the source.
function classifySectionRoles(name) {
  const n = name.toLowerCase();
  const nspace = n.replace(/[_.\-+]+/g, " ");
  const roles = new Set();
  const add = (s) => { roles.add(s.toUpperCase()); };
  const grab = (cluster) => (cluster.match(/[chlm]/gi) ?? []).forEach(add);
  const C = "[chlm](?![a-z])(?:(?:[\\s_.\\-+,&\\/]|and)+[chlm](?![a-z]))*";
  let m;
  const secRe = new RegExp(`sections?\\s*[_.\\- ]?\\s*(${C})`, "gi");
  while ((m = secRe.exec(n)) !== null) grab(m[1]);
  const lead = new RegExp(`^(${C})[ _.\\-]`, "i").exec(n);
  if (lead) grab(lead[1]);
  const desigRe = /(?:^|[\s+_(§-])([chlm])\./gi;
  while ((m = desigRe.exec(n)) !== null) add(m[1]);
  if (/statement of work|\bsow\b|\bpws\b|performance work statement|\bsoo\b|scope of work|statement of objectives|project description|bid description/.test(nspace)) add("c");
  if (/instructions?\b[\s\w]{0,40}\bofferors?\b|notices to offerors/.test(nspace)) add("l");
  if (/evaluation factors?\b|basis of award\b/.test(nspace)) add("m");
  if (/special contract requirements?\b/.test(nspace)) add("h");
  return ["C", "H", "L", "M"].filter((x) => roles.has(x));
}

const DIR = "ceo/Solicitation + Export Reviews";
const MODEL = "claude-opus-4-8";
const M = 1_000_000;
const PRICE_IN = 5.0, CACHE_WRITE = 1.25, CACHE_READ = 0.10, OUT_COST = (20_000 / M) * 25.0;

async function countTokens(text) {
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, system: "You output one JSON object.", messages: [{ role: "user", content: text || "(empty)" }] }),
  });
  if (!res.ok) throw new Error(`count_tokens ${res.status}: ${await res.text()}`);
  return (await res.json()).input_tokens;
}

// ── Routing policies (per call → which roles ride) ──
// A doc rides a call if: it's the form (no role at all → conservative ALL), OR
// any of its roles is in that call's role set.
// overview extracts §L submission reqs + §M eval factors + §C scope summary.
// compliance/risks need the section bodies. Clauses can hide anywhere → both
// keep all section roles. The lever is what we do with NO-ROLE docs.
const CALL_ROLES = {
  overview:   new Set(["C", "L", "M"]),
  compliance: new Set(["C", "H", "L", "M"]),
  risks:      new Set(["C", "H", "L", "M"]),
};

// Policy A (scoped/conservative): no-role docs ride EVERY call.
// Policy B (reference-exclusion): no-role docs ride NO analysis call (they're
//   reference data — wage dets, DD254, specs — that the reasoning doesn't need
//   token-by-token; the completeness guard is the safety net).
function ridesA(roles /* string[] */, callSet) {
  if (roles.length === 0) return true;                 // no-role → all calls
  return roles.some((r) => callSet.has(r));
}
function ridesB(roles, callSet) {
  if (roles.length === 0) return false;                // no-role → excluded
  return roles.some((r) => callSet.has(r));
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
  // group by leading "N." package prefix
  const groups = {};
  for (const f of files) {
    const m = /^(\d+)\./.exec(f);
    const key = m ? m[1] : "x";
    (groups[key] ??= []).push(f);
  }

  for (const [key, group] of Object.entries(groups).sort()) {
    const docs = [];
    for (const f of group.sort()) {
      const buf = fs.readFileSync(path.join(DIR, f));
      let tokens = 0, ok = true;
      try {
        const { rawText } = await extractText(buf);
        tokens = await countTokens(rawText);
      } catch (e) { ok = false; }
      // shorten display name; classify on the SAM-style portion after "N. SOL - "
      const namePart = f.replace(/^\d+\.\s*[A-Z0-9]+\s*-\s*/i, "").replace(/\.pdf$/i, "");
      const roles = classifySectionRoles(namePart);
      docs.push({ f: namePart.slice(0, 48), tokens, roles, ok });
    }
    const total = docs.reduce((s, d) => s + d.tokens, 0);
    if (total === 0) continue;

    console.log(`\n══ PACKAGE ${key} ══ ${group.length} docs · ${total.toLocaleString()} tokens total`);
    for (const d of docs) {
      console.log(`   ${String(d.tokens).padStart(7)}  [${(d.roles.join("") || "—").padEnd(4)}]  ${d.f}${d.ok ? "" : "  (extract FAILED)"}`);
    }

    // per-call routed totals under each policy
    for (const [pol, rides] of [["A conservative", ridesA], ["B ref-exclude", ridesB]]) {
      const perCall = {};
      for (const call of Object.keys(CALL_ROLES)) {
        perCall[call] = docs.filter((d) => rides(d.roles, CALL_ROLES[call])).reduce((s, d) => s + d.tokens, 0);
      }
      // cost: each call's payload is its own prefix. Shared overlap across calls
      // is cached: model the LARGEST call as the cache-WRITE, the rest as READ of
      // THEIR OWN payload (conservative — real cache only covers the overlap, so
      // this slightly UNDER-counts savings of B, fine for a floor).
      const baselineInput = total * CACHE_WRITE + 2 * total * CACHE_READ; // Stage-1: full set, cached
      const calls = Object.values(perCall);
      const routedInput = Math.max(...calls) * CACHE_WRITE + calls.filter((c) => c !== Math.max(...calls)).reduce((s, c) => s + c, 0) * CACHE_READ;
      const baseCost = (baselineInput / M) * PRICE_IN + OUT_COST;
      const routedCost = (routedInput / M) * PRICE_IN + OUT_COST;
      console.log(`   ▸ policy ${pol}: ov=${perCall.overview.toLocaleString()} comp=${perCall.compliance.toLocaleString()} risk=${perCall.risks.toLocaleString()}  →  $${routedCost.toFixed(2)}  (Stage-1 baseline $${baseCost.toFixed(2)})`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
