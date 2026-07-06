// $0 REGRESSION for the LOSSLESS ingest (map-reduce compressor replacement) — DROP-NOISE design.
// Run: npx tsx src/lib/agentic-lossless-ingest.test.ts
import { assembleFullSourceLossless, dropNoise, isProse } from "./agentic-lossless-ingest";
import { assembleFullSource } from "./agentic-executor";
import type { AgenticDoc } from "./agentic-orchestrator";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${l}`); };
const eq = (l: string, g: unknown, w: unknown) => { const c = JSON.stringify(g) === JSON.stringify(w); c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${l}${c ? "" : ` — got ${JSON.stringify(g)} want ${JSON.stringify(w)}`}`); };
const D = (name: string, text: string): AgenticDoc => ({ name, text, bytes: Buffer.from(text, "utf8") });

// ── isProse ──────────────────────────────────────────────────────────────────────────────────────────
ok("P1 a real sentence is prose", isProse("Firms lacking a Top Secret facility clearance are not eligible."));
ok("P2 a dimension callout is NOT prose", !isProse("12'-6\""));
ok("P3 a grid label is NOT prose", !isProse("GRID A-1"));

// ── dropNoise — the catastrophic misses the KEEP-BINDING filter had, now CLOSED (prose always kept) ────
ok("N1 pure drawing/dimension noise → dropped", dropNoise("GRID A-1\n12'-6\"\n   \n=====\nSHEET 12").kept.trim() === "");
ok("N2 ★ eligibility bar with NO obligation verb → KEPT (the false-BID hole, closed)",
  dropNoise("Firms lacking an active Top Secret facility clearance are not eligible for consideration.").kept.includes("not eligible"));
ok("N3 present-tense spec value → KEPT", dropNoise("Concrete for all structural elements attains a minimum compressive strength of 4,000 psi.").kept.includes("4,000 psi"));
ok("N4 third-person verb obligation → KEPT (regex-boundary gap closed)", dropNoise("The vendor furnishes all consumables and supplies.").kept.includes("furnishes"));
ok("N5 spelled-out §L page limit → KEPT", dropNoise("Technical proposals are limited to twenty-five single-sided pages.").kept.includes("twenty-five"));
ok("N6 a wage/$ table row (prose-ish) → KEPT", dropNoise("SCALE 1:100\nCARPENTER JOURNEYMAN $34.12 per hour\nGRID B-2").kept.includes("$34.12"));
{ const f = dropNoise("Line one is a full real sentence here.\n12x24\nLine two is another full real sentence.");
  ok("N7 prose kept, interstitial dimension noise dropped", f.kept.includes("Line one") && f.kept.includes("Line two") && !f.kept.includes("12x24")); }

// ── assembleFullSourceLossless ───────────────────────────────────────────────────────────────────────
{
  const docs = [D("primary", "The offeror shall submit a proposal by the deadline."), D("attA", "Only small businesses are eligible under this notice.")];
  const la = assembleFullSourceLossless(docs, 1_000_000);
  eq("L1 fits-whole → untouched whole assembly (byte-identical)", la.source, assembleFullSource(docs));
  eq("L1 fits-whole → no filtering, no content loss", [la.truncated, la.filteredDocs.length, la.contentLossDocs.length], [false, 0, 0]);
}
{
  // Over budget, NOISE-heavy → noise dropped, ALL prose survives, fits.
  const noise = Array.from({ length: 500 }, (_, i) => `${i}'-${i}"\nGRID ${i}\nSCALE 1:${i}`).join("\n");
  const prose = "The Contractor shall furnish performance and payment bonds.\nOnly HUBZone firms are eligible.\nConcrete attains 4,000 psi at twenty-eight days.";
  const big = D("giant", `${noise}\n${prose}\n${noise}`);
  const la = assembleFullSourceLossless([big], big.text.length - 100);
  ok("L2 over-budget noise-heavy → fits after noise-drop", la.source.length <= big.text.length - 100);
  ok("L2 obligation survives", /furnish performance and payment bonds/.test(la.source));
  ok("L2 eligibility bar survives (no verb)", /HUBZone firms are eligible/.test(la.source));
  ok("L2 spec value survives", /4,000 psi/.test(la.source));
  eq("L2 dropping NOISE is NOT content loss", la.contentLossDocs, []);
  eq("L2 doc reported as noise-filtered", la.filteredDocs, ["giant"]);
}
{
  // PROSE alone exceeds the window → honest INCOMPLETE (whole non-binding-first drop, named — never silent).
  const prose = "The contractor shall furnish and install and provide and submit and deliver everything herein. ";
  const d1 = D("primary", prose.repeat(60)), d2 = D("attB", prose.repeat(60));
  const la = assembleFullSourceLossless([d1, d2], 200);
  ok("L3 prose-exceeds-budget → truncated / content loss (honest INCOMPLETE)", la.truncated || la.contentLossDocs.length > 0);
  ok("L3 a dropped doc is named (never silent)", la.droppedDocs.length > 0 || la.contentLossDocs.length > 0);
}

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
