// Weigh a real solicitation package on the FREE count_tokens endpoint. Zero
// Opus spend. Extracts each PDF (pdf-parse) + each XLSX (exceljs), counts tokens,
// classifies section roles, sums, and reports the cost picture under Stage-1
// caching (4 calls). CAVEAT: no OCR here — image-only/scanned pages contribute
// ~0 text, so this is a FLOOR. The live engine OCRs those, which is exactly what
// inflated this package to ~1.08M in the incident. Hogs + magnitude are real.
//
// Run: npx tsx scripts/audit-ai/weigh-package.mjs "ceo/Solicitation + Export Reviews/N4008526R0065"
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdfParseMod = require("pdf-parse");
const PdfParseCtor = pdfParseMod?.PDFParse ?? pdfParseMod?.default ?? pdfParseMod;
const ExcelJS = require("exceljs");

const MODEL = "claude-opus-4-8";
const CONTEXT_LIMIT = 1_000_000;
const M = 1_000_000;
const PRICE_IN = 5.0, CACHE_WRITE = 1.25, CACHE_READ = 0.10;
const OUT_TOKENS = 30_000, OUT_COST = (OUT_TOKENS / M) * 25.0; // ~4 calls output

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

async function countTokens(text) {
  if (!text || !text.trim()) return 0;
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, system: "You output one JSON object.", messages: [{ role: "user", content: text.slice(0, 8_000_000) }] }),
  });
  if (!res.ok) throw new Error(`count_tokens ${res.status}: ${await res.text()}`);
  return (await res.json()).input_tokens;
}

async function pdfText(buf) {
  try {
    const inst = new PdfParseCtor({ data: buf });
    const out = await inst.getText();
    return String(out?.text ?? "");
  } catch { return ""; }
}
async function xlsxText(buf) {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const lines = [];
    wb.eachSheet((ws) => {
      lines.push(`# Sheet: ${ws.name}`);
      ws.eachRow((row) => {
        const cells = [];
        row.eachCell({ includeEmpty: false }, (c) => cells.push(String(c.text ?? c.value ?? "")));
        if (cells.length) lines.push(cells.join("\t"));
      });
    });
    return lines.join("\n");
  } catch (e) { return ""; }
}

async function main() {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: weigh-package.mjs <dir>"); process.exit(1); }
  const files = fs.readdirSync(dir, { recursive: true })
    .map((f) => path.join(dir, f))
    .filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } })
    .filter((f) => /\.(pdf|xlsx)$/i.test(f));

  const rows = [];
  for (const f of files) {
    const buf = fs.readFileSync(f);
    const base = path.basename(f);
    const text = /\.pdf$/i.test(f) ? await pdfText(buf) : await xlsxText(buf);
    let tokens = 0, note = "";
    try { tokens = await countTokens(text); } catch (e) { note = "count FAILED"; }
    if (tokens === 0 && /\.pdf$/i.test(f)) note = "0 text — likely SCANNED → engine OCRs this (adds tokens here)";
    rows.push({ base, tokens, roles: classifySectionRoles(base), kb: Math.round(buf.length / 1024), note });
  }
  rows.sort((a, b) => b.tokens - a.tokens);

  const total = rows.reduce((s, r) => s + r.tokens, 0);
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log(`  WEIGH · ${path.basename(dir)} · ${rows.length} files`);
  console.log(`  (FREE count_tokens · no OCR → FLOOR · no Opus spend)`);
  console.log("══════════════════════════════════════════════════════════════════════");
  for (const r of rows) {
    console.log(`${String(r.tokens).padStart(8)} tok  ${String(r.kb).padStart(5)}KB  [${(r.roles.join("") || "—").padEnd(4)}]  ${r.base.slice(0, 52)}${r.note ? "  ⚠ " + r.note : ""}`);
  }
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  TEXT-EXTRACTABLE TOTAL: ${total.toLocaleString()} tokens (FLOOR — OCR adds more)`);
  console.log(`  Context limit (Opus): ${CONTEXT_LIMIT.toLocaleString()}  →  ${total > CONTEXT_LIMIT ? "❌ OVERFLOWS already, pre-OCR" : `fits text-only by ${(CONTEXT_LIMIT - total).toLocaleString()} (before OCR)`}`);
  // cost under Stage-1 caching, 4 calls, if it FITS (the doc set rides calls 1-3; call 4 = facts only ~ negligible)
  const docCalls = 3;
  const cachedInput = total * CACHE_WRITE + (docCalls - 1) * total * CACHE_READ;
  const cost = (cachedInput / M) * PRICE_IN + OUT_COST;
  console.log(`  IF it fit, Stage-1 cached cost (3 doc-calls): ~$${cost.toFixed(2)} input+output (call 4 facts-only negligible)`);
  console.log(`  Memory: live incident assembled to ~1,081,830 tokens AFTER OCR → overflowed 1M → retried 3× at full Opus.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
