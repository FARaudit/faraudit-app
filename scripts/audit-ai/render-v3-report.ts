// $0 — render the GRADUATED engine's output into a real customer report so the
// verdict + reporting can be EYEBALLED before any live spend (GO-CONTRACT step 3).
// Reads the captured gold-proof result JSONs (ceo/proofs/v3-<sol>-result.json),
// pulls light facts from the gold FULL-SOURCE, and writes one HTML report per
// pole into ceo/v3-report-preview/. NO model calls, NO network.
//   Run: npx tsx scripts/audit-ai/render-v3-report.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderV3Report, buildV3Payload } from "../../src/lib/audit-v3-report";

const PROOFS = path.join(process.cwd(), "ceo/proofs");
const GOLD = path.join(process.cwd(), "scripts/audit-ai/gold-sets");
const OUT = path.join(process.cwd(), "ceo/v3-report-preview");
mkdirSync(OUT, { recursive: true });

function goldSource(sol: string): string {
  const a = path.join(GOLD, `${sol}-FULL-SOURCE.complete.txt`);
  const b = path.join(GOLD, `${sol}-FULL-SOURCE.txt`);
  if (existsSync(a)) return readFileSync(a, "utf8");
  if (existsSync(b)) return readFileSync(b, "utf8");
  return "";
}
function keyMeta(sol: string): { title?: string } {
  const f = readdirSync(GOLD).find((x) => x.startsWith(sol) && x.endsWith(".json") && !x.includes("registry"));
  if (!f) return {};
  try { const k = JSON.parse(readFileSync(path.join(GOLD, f), "utf8")); return { title: k._title }; } catch { return {}; }
}

const resultFiles = readdirSync(PROOFS).filter((f) => /^v3-.*-result\.json$/.test(f));
if (!resultFiles.length) { console.error("no ceo/proofs/v3-*-result.json files found — run v3-proof.ts first"); process.exit(1); }

const index: string[] = [];
for (const rf of resultFiles) {
  const r = JSON.parse(readFileSync(path.join(PROOFS, rf), "utf8"));
  const sol = r.sol as string;
  const src = goldSource(sol);
  const naics = src.match(/NAICS[^0-9]{0,40}(\d{6})/i)?.[1] ?? null;
  const setAside = /set[- ]?aside/i.test(src) ? (src.match(/set[- ]?aside[^.\n]{0,60}/i)?.[0]?.trim() ?? null) : null;
  const payload = buildV3Payload(r.decision, r.coverage, r.findings, "(captured gold-proof result — $0 render)");
  const html = renderV3Report(payload, {
    solicitationNumber: sol,
    title: keyMeta(sol).title ?? null,
    naicsCode: naics,
    setAside,
  });
  const outFile = path.join(OUT, `${sol}.html`);
  writeFileSync(outFile, html);
  console.log(`✓ ${sol.padEnd(18)} verdict=${String(r.decision.verdict).padEnd(18)} → ${outFile}`);
  index.push(`<li><a href="./${sol}.html">${sol}</a> — <b>${r.decision.verdict}</b> (expected ${r.expected})</li>`);
}

const indexHtml = `<!doctype html><meta charset="utf-8"><title>FARaudit V3 report previews</title>
<style>body{font:15px/1.6 -apple-system,sans-serif;max-width:680px;margin:40px auto;padding:0 20px}h1{font-size:20px}li{margin:6px 0}</style>
<h1>FARaudit · Agentic Engine — report previews ($0, from gold proofs)</h1>
<p>Each report below is the GRADUATED engine's real output, rendered through the new V3 report adapter. Eyeball the verdict + reporting before any live spend.</p>
<ul>${index.join("\n")}</ul>`;
writeFileSync(path.join(OUT, "index.html"), indexHtml);
console.log(`\n✓ index: file://${path.join(OUT, "index.html")}`);
