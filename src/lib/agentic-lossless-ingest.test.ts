// $0 REGRESSION for the LOSSLESS ingest (map-reduce compressor replacement).
// Run: npx tsx src/lib/agentic-lossless-ingest.test.ts
import { assembleFullSourceLossless, filterBindingContent } from "./agentic-lossless-ingest";
import { assembleFullSource } from "./agentic-executor";
import type { AgenticDoc } from "./agentic-orchestrator";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${l}`); };
const eq = (l: string, g: unknown, w: unknown) => { const c = JSON.stringify(g) === JSON.stringify(w); c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${l}${c ? "" : ` — got ${JSON.stringify(g)} want ${JSON.stringify(w)}`}`); };
const D = (name: string, text: string): AgenticDoc => ({ name, text, bytes: Buffer.from(text, "utf8") });

// ── filterBindingContent ─────────────────────────────────────────────────────────────────────────────
{
  const noise = "GRID A-1\n3'-6\"\n   \n=====\nSHEET 12";
  const f = filterBindingContent(noise);
  eq("F1 pure drawing/dimension noise → fully dropped", f.kept.trim(), "");
}
{
  const binding = "The Contractor shall furnish performance and payment bonds per 52.228-15.";
  const f = filterBindingContent(binding);
  ok("F2 a binding obligation line survives verbatim", f.kept.includes("shall furnish performance and payment bonds"));
}
{
  const table = "SCALE 1:100\nCARPENTER            $34.12\nGRID B-2";
  const f = filterBindingContent(table);
  ok("F3 a wage/$ table row survives (dropped its noise neighbors)", f.kept.includes("$34.12"));
}
{
  // context window: a bare noise line adjacent to a binding hit is kept as context (±2).
  const ctx = "noise-line-0\nSHEET 3\nOfferor must submit the bid schedule.\nnoise-after\nGRID Z";
  const f = filterBindingContent(ctx);
  ok("F4 ±context around a binding hit is retained", f.kept.includes("Offeror must submit") && f.kept.includes("noise-after"));
}

// ── assembleFullSourceLossless ───────────────────────────────────────────────────────────────────────
{
  // FITS WHOLE → byte-identical to the budgeted whole read (no filtering), no content loss.
  const docs = [D("primary", "The offeror shall submit a proposal."), D("attA", "Davis-Bacon wages apply per 52.222-6.")];
  const la = assembleFullSourceLossless(docs, 1_000_000);
  eq("L1 fits-whole → source is the untouched whole assembly", la.source, assembleFullSource(docs));
  eq("L1 fits-whole → truncated=false", la.truncated, false);
  eq("L1 fits-whole → no doc filtered, no content loss", [la.filteredDocs.length, la.contentLossDocs.length], [0, 0]);
}
{
  // OVER BUDGET → binding survives verbatim, noise dropped, fits the budget, NOT flagged content loss.
  const noiseBlock = Array.from({ length: 400 }, (_, i) => `GRID ${i}-${i}\n${i}'-${i}"\nSCALE 1:${i}`).join("\n");
  const bindingBlock = "FACTOR 1 PERFORMANCE\nBASIS FOR AWARD: highest technically rated.\nThe Contractor shall furnish performance and payment bonds.\nDavis-Bacon wage determination WD 22-0001 applies.\nBid guarantee 20% required.";
  const big = D("giant", `${noiseBlock}\n${bindingBlock}\n${noiseBlock}`);
  const maxChars = big.text.length - 100; // force over budget
  const la = assembleFullSourceLossless([big], maxChars);
  ok("L2 over-budget → source fits the budget", la.source.length <= maxChars);
  ok("L2 §M FACTOR/basis-for-award survives", /FACTOR 1|BASIS FOR AWARD/.test(la.source));
  ok("L2 Davis-Bacon wage survives", /Davis-Bacon|WD 22-0001/.test(la.source));
  ok("L2 bonding survives", /performance and payment bonds|Bid guarantee/.test(la.source));
  eq("L2 dropping NOISE is NOT content loss", la.contentLossDocs, []);
  eq("L2 the doc is reported as binding-filtered", la.filteredDocs, ["giant"]);
  ok("L2 the giant shrank materially", la.source.length < big.text.length / 2);
}
{
  // BINDING CONTENT ITSELF exceeds the window → honest INCOMPLETE (whole non-binding-first drop), never silent.
  const allBinding = "The Contractor shall furnish and install and provide and submit and deliver and comply.";
  const d1 = D("primary", allBinding.repeat(50));
  const d2 = D("attB", allBinding.repeat(50));
  const tiny = 200;
  const la = assembleFullSourceLossless([d1, d2], tiny);
  ok("L3 binding-exceeds-budget → truncated (honest INCOMPLETE)", la.truncated || la.contentLossDocs.length > 0);
  ok("L3 a dropped doc is named (never silent)", la.droppedDocs.length > 0 || la.contentLossDocs.length > 0);
}

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
