// $0 proof for the map-reduce chunked ingest (Brain card 271, R1/R2/R3) — hardened after adversarial review.
// Run: npx tsx src/lib/agentic-chunked-ingest.test.ts
//
// Load-bearing NEGATIVE + the fix, on a W9126G26RA087-shaped package (giant primary + an amendment):
//   • OLD assembleFullSourceBudgeted DROPS the amendment → truncated=true (the Rule-66 run-1 bug).
//   • NEW assembleFullSourceChunked drops NOTHING; PRIMARY kept whole (structure preserved); amendment COMPRESSED.
//   • Canonical header — no read-mode suffix pollutes the parsed doc name (docRegions stays intact).
//   • Grounding (R2-b): a hallucinated span is REJECTED; only verbatim spans enter the digest.
//   • Deterministic floor (R2-c): a FAR clause in a COMPRESSED doc survives even if the MAP missed it.
//   • CONTENT-LOSS FAIL-SAFE (R1, never false-COMPLETE): a BINDING doc that compresses to an empty digest is
//     flagged → truncated=true → honest INCOMPLETE. A NON-binding blank template is NOT a loss.
//   • Verdict-gate flip: nothing dropped ⇒ agenticManifestComplete=true ⇒ no INCOMPLETE cap (committal flows).

import { assembleFullSourceChunked, mapReduceDoc, wouldOverflow, isAmendmentDoc, deterministicFloor, overlappingWindows, MAP_CHUNK_CHARS, type ChunkMapCall } from "./agentic-chunked-ingest";
import { assembleFullSourceBudgeted } from "./agentic-executor";
import { agenticManifestComplete } from "./audit-executor-v3";
import type { AgenticDoc } from "./agentic-orchestrator";
import type { IngestionMeta } from "./sam-attachments";

const mk = (name: string, text: string): AgenticDoc => ({ name, bytes: Buffer.from(""), text });

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// A W9126G26RA087-shaped package: a giant primary that alone blows the budget + a material amendment.
const PRIMARY_MARKER = "TOTAL SMALL BUSINESS SET-ASIDE per FAR 19.502-2";
const AMEND_MARKER = "AMENDMENT 0002 changes the offer due date to 17 July 2026";
const primaryText = `${PRIMARY_MARKER}. ` + "filler compliance prose ".repeat(4000) + " clause 52.204-7 System for Award Management applies.";
const amendText = `${AMEND_MARKER}. clause 52.219-6 Notice of Total Small Business Set-Aside applies. ` + "amendment body ".repeat(200);
const docs: AgenticDoc[] = [mk("g26ra087.pdf", primaryText), mk("am_2.pdf", amendText)];
const BUDGET = 50_000; // primary alone (~100k chars) overflows → compress path engages (attachments only)

// A stub MAP: returns one GROUNDED span (a verbatim slice of the chunk) + one HALLUCINATED span (not in source).
// Grounding must keep the first and reject the second (R2-b). Counts invocations for the "fits ⇒ $0" test.
let mapCalls = 0;
const stubMap: ChunkMapCall = async ({ chunk }) => {
  mapCalls++;
  return { excerpts: [chunk.slice(0, 60), "‡HALLUCINATED SPAN THAT IS NOT PRESENT IN ANY SOURCE CHUNK‡"] };
};

async function main() {
// ── 1 · THE NEGATIVE — old budgeted assembler DROPS the amendment (the bug) ────────────────────────────
{
  const r = assembleFullSourceBudgeted(docs, BUDGET);
  check("T1 · OLD path truncates (bug reproduced)", r.truncated === true, `truncated=${r.truncated}`);
  check("T2 · OLD path DROPS the amendment am_2.pdf", r.droppedDocs.includes("am_2.pdf"), `dropped=[${r.droppedDocs.join(",")}]`);
}

// ── 2 · THE FIX — chunked ingest drops NOTHING; primary WHOLE, amendment COMPRESSED ────────────────────
{
  mapCalls = 0;
  const r = await assembleFullSourceChunked(docs, stubMap, BUDGET);
  check("T3 · NEW path never truncates (nothing dropped, no content-loss, not aborted)", r.truncated === false, `truncated=${r.truncated}`);
  check("T4 · NEW path drops ZERO docs", r.droppedDocs.length === 0, `dropped=${r.droppedDocs.length}`);
  check("T5 · amendment am_2.pdf present in perDoc (R2-c always material)", r.perDoc.some((d) => d.name === "am_2.pdf"), "amendment missing");
  const amend = r.perDoc.find((d) => d.name === "am_2.pdf");
  const primary = r.perDoc.find((d) => d.name === "g26ra087.pdf");
  // FIX C — the PRIMARY is NEVER compressed (its §L/§M/§C structure is load-bearing). The attachment compresses.
  check("T6 · primary is kept WHOLE (mode=full — structure preserved)", primary?.mode === "full", `primary mode=${primary?.mode}`);
  check("T6b · attachment am_2.pdf was COMPRESSED (map-reduce), not dropped", amend?.mode === "map-reduce", `amend mode=${amend?.mode}`);
  // FIX B — canonical DOCUMENT header (no read-mode suffix polluting the parsed name).
  check("T7 · canonical header — clean doc name, no read-mode suffix in header", r.source.includes("==== DOCUMENT: g26ra087.pdf ====") && !/DOCUMENT: [^=]*\[read-mode/.test(r.source), "header polluted");
  // R2-b GROUNDING on the compressed doc: the hallucinated span is rejected; only verbatim spans in the digest.
  check("T8 · grounding REJECTS the hallucinated span (R2-b)", (amend?.spansRejected ?? 0) >= 1 && !r.source.includes("‡HALLUCINATED"), `rejected=${amend?.spansRejected}`);
  // R2-c deterministic floor on the COMPRESSED doc: FAR clause 52.219-6 survives even from a compressed digest.
  check("T9 · deterministic clause floor keeps 52.219-6 on the COMPRESSED doc (R2-c)", r.source.includes("52.219-6"), "clause floor missing on compressed doc");
  check("T10 · amendment content was READ into the source", r.source.includes("AMENDMENT 0002"), "amendment content missing");
  check("T11 · MAP ran on the attachment (paid calls on a genuine overflow)", mapCalls > 0, `mapCalls=${mapCalls}`);
  check("T12 · READ-MODE disclosure note is in the body, not the header", r.source.includes("[READ-MODE: map-reduce"), "read-mode note missing");
}

// ── 3 · FITS UNDER BUDGET ⇒ whole read, ZERO paid map calls (byte-identical) ────────────────────────────
{
  mapCalls = 0;
  const small = [mk("a.pdf", "short one"), mk("b.pdf", "short two")];
  check("T13 · wouldOverflow=false when it fits", wouldOverflow(small, 1_000_000) === false, "false overflow");
  const r = await assembleFullSourceChunked(small, stubMap, 1_000_000);
  check("T14 · fits ⇒ ZERO paid map calls", mapCalls === 0, `mapCalls=${mapCalls}`);
  check("T15 · fits ⇒ nothing compressed (all full)", r.perDoc.every((d) => d.mode === "full"), "some compressed");
  check("T16 · fits ⇒ both docs' content present", r.source.includes("short one") && r.source.includes("short two"), "content missing");
}

// ── 4 · CONTENT-LOSS FAIL-SAFE (Fix A — never a false-COMPLETE) ─────────────────────────────────────────
{
  const emptyMap: ChunkMapCall = async () => ({ excerpts: [] }); // model surfaces nothing
  // A BINDING amendment with NO extractable spans AND no clause numbers → content loss (honest INCOMPLETE).
  const bindingEmpty = await mapReduceDoc(mk("amendment_0009.pdf", "this amendment prose carries no clause numbers at all"), emptyMap);
  check("T17 · BINDING doc compressed to empty digest ⇒ contentLoss=true (fail-safe, not false-COMPLETE)", bindingEmpty.contentLoss === true, `contentLoss=${bindingEmpty.contentLoss}`);
  // A NON-binding blank template (reps-certs) with no spans is NOT a loss (blank-by-design).
  const nonBindingEmpty = await mapReduceDoc(mk("reps-certs.pdf", "offeror fill-in template, intentionally blank"), emptyMap);
  check("T18 · NON-binding blank template ⇒ contentLoss=false (blank-by-design, not a loss)", nonBindingEmpty.contentLoss === false, `contentLoss=${nonBindingEmpty.contentLoss}`);
  // Assembly-level: a package whose only over-budget attachment is a binding doc the map empties → truncated=true.
  const bigPrimary = mk("primary.pdf", "P".repeat(60_000));
  const bindingAtt = mk("amendment_0009.pdf", "amendment prose with no clause numbers " + "x".repeat(20_000));
  const r = await assembleFullSourceChunked([bigPrimary, bindingAtt], emptyMap, 50_000);
  check("T19 · content-loss on a binding attachment ⇒ assembly truncated=true (honest INCOMPLETE)", r.truncated === true && r.contentLossDocs.includes("amendment_0009.pdf"), `truncated=${r.truncated} loss=[${r.contentLossDocs.join(",")}]`);
}

// ── 5 · exact-equality dedup keeps a distinct short span (Fix D) ────────────────────────────────────────
{
  const doc = mk("att.pdf", "The form SF-30 revision applies. Separately, SF-30 is referenced. " + "y".repeat(60_000));
  const twoSpanMap: ChunkMapCall = async () => ({ excerpts: ["form SF-30 revision applies", "SF-30", "form SF-30 revision applies"] });
  const r = await mapReduceDoc(doc, twoSpanMap);
  // Both distinct spans grounded; the exact duplicate collapses; the short substring "SF-30" is NOT dropped (Fix D).
  check("T20 · exact-equality dedup keeps distinct short span, drops only exact dup", r.spansKept === 2, `spansKept=${r.spansKept}`);
}

// ── 6 · THE VERDICT-GATE FLIP (the end-to-end $0 proof) ────────────────────────────────────────────────
// A complete SAM ingestion (every posted doc read, text present). The ONLY difference is `truncated`:
//   OLD drop path → truncated=true → agenticManifestComplete=false → deriveVerdict caps to INCOMPLETE.
//   NEW compress path → truncated=false → agenticManifestComplete=true → NO INCOMPLETE cap → committal flows.
{
  const ing: IngestionMeta = {
    files_total: 2, files_ingested: 2, overflow: false,
    files: [
      { name: "g26ra087.pdf", role: "primary", ingested: true, has_text: true, truncated: false },
      { name: "am_2.pdf", role: "attachment", ingested: true, has_text: true, truncated: false },
    ],
  } as unknown as IngestionMeta;
  check("T21 · OLD drop path (truncated=true) ⇒ manifestComplete=false ⇒ INCOMPLETE cap fires",
    agenticManifestComplete(ing, true, true) === false, "old path did not cap");
  check("T22 · NEW compress path (truncated=false) ⇒ manifestComplete=true ⇒ NO INCOMPLETE cap (committal flows)",
    agenticManifestComplete(ing, false, true) === true, "fix did not release the cap");
}

// ── 7 · fail-safe + predicate sanity ───────────────────────────────────────────────────────────────────
{
  const throwing: ChunkMapCall = async () => { throw new Error("simulated map failure"); };
  const r = await mapReduceDoc(mk("x-att.pdf", "body with clause 52.212-4 present and prose"), throwing, undefined);
  check("T23 · a failing MAP is fail-safe (no throw, doc still produced)", r.mode === "map-reduce" && typeof r.text === "string", "threw or empty");
  check("T24 · clause floor survives a total MAP failure (52.212-4)", r.text.includes("52.212-4"), "floor lost on map failure");
  check("T25 · isAmendmentDoc recognizes SF-30 / amendment names", isAmendmentDoc("am_2.pdf") && isAmendmentDoc("SF30-amend-0002.pdf"), "amendment not recognized");
  check("T26 · MAP_CHUNK_CHARS is a sane positive size", MAP_CHUNK_CHARS >= 1000, `chunk=${MAP_CHUNK_CHARS}`);
}

// ── 8 · CODE-REVIEW ROUND-2 FIXES — stronger floor (#1) + overlapping windows (#3) ─────────────────────
{
  // #1 — the deterministic floor now covers DATES + set-aside + CLINs, not just clauses, so an amendment's
  // MATERIAL change survives even when the MAP surfaces nothing.
  const floor = deterministicFloor("Offers are due no later than 17 July 2026 at 2:00 PM. This is a TOTAL SMALL BUSINESS set-aside. CLIN 0001 and clause 52.219-6 apply.");
  check("T27 · floor extracts the due DATE (17 July 2026)", floor.join(" ").includes("17 July 2026"), `floor=${floor.join(" | ")}`);
  check("T28 · floor extracts the SET-ASIDE marker", /small business/i.test(floor.join(" ")), "set-aside missing");
  check("T29 · floor extracts CLIN + clause", floor.join(" ").includes("52.219-6") && /CLIN/i.test(floor.join(" ")), "clin/clause missing");

  // A BINDING doc whose MAP surfaces nothing but whose prose carries a due-date change → floor is NON-empty →
  // contentLoss=false (the material change is preserved deterministically). This is the #1 completeness gain.
  const emptyMap: ChunkMapCall = async () => ({ excerpts: [] });
  const dated = await mapReduceDoc(mk("amendment_0003.pdf", "AMENDMENT 0003 moves the offer due date to 25 August 2026. No other changes."), emptyMap);
  check("T30 · binding doc, map surfaced nothing but a DATE is in prose ⇒ floor keeps it, contentLoss=false", dated.contentLoss === false && dated.text.includes("25 August 2026"), `contentLoss=${dated.contentLoss} text-has-date=${dated.text.includes("25 August 2026")}`);

  // #3 — overlapping windows: a span straddling a window boundary appears WHOLE in the next window (never fragmented).
  const w = overlappingWindows("AAAA" + "x".repeat(96) + "BOUNDARY-SPAN-MARKER" + "y".repeat(80), 100, 40);
  check("T31 · overlapping windows keep a boundary span intact in some window", w.some((win) => win.includes("BOUNDARY-SPAN-MARKER")), `windows=${w.length}`);
  check("T32 · overlappingWindows: single short text → one window (no overlap needed)", overlappingWindows("short", 100, 40).length === 1, "unexpected split");
}

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
