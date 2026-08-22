// WHY BINDING LINES FAIL TO PLACE — and it is one line of code, not a long tail.
//
// $0, deterministic, no model call.
//
// THE DEFECT. `panel-adapter.ts:208` builds the panel's section map as:
//
//     const sectionText = { ...base, ...ucfSectionText };
//
// `base` is `routeCommercialSections(src)` — the content router that actually understands a commercial
// SF-1449 package. `ucfSectionText` is `detectSections(src)` — the UCF §A–M boundary detector, run
// UNCONDITIONALLY at the top of buildPanelInputs, including on packages with ZERO UCF headers. Because it
// is spread SECOND, it WINS every key the two share.
//
// On FA813726R0033 (ucfHeaderCount = 0) that is not a subtle difference:
//     routeCommercialSections   L:23926 M:16061 I:117134 B:6311 C:113406 A:1972   Σ 278,810
//     detectSections (UCF)      L:21871 M:14363 I:18307  B:555  C:160    A:279 …  Σ  72,182
// §C goes from 113,406 chars to 160. §I from 117,134 to 18,307. The commercial router did its job and the
// merge threw three quarters of it away — in favour of a detector that found one section header in the
// whole document.
//
// ⚠ FIRST VERSION OF THIS PROBE WAS WRONG, recorded so it is not repeated. It bucketed unrouted lines by
// inferred cause (HEAD / BOUNDARY-CUT / TINY-SLICE) using a hand-rolled anchor estimate, and reported
// "99.6% BOUNDARY-CUT" — implausible on its face, since a package has a handful of anchors. The estimate
// was reconstructed rather than instrumented. The number below is a straight A/B of the two maps the
// adapter itself merges.
export {};
import { applyStampedConfig, configStamp } from "./_instrument";
import { readFileSync, readdirSync } from "node:fs";

applyStampedConfig("live");

(async () => {
  const { routeCommercialSections, detectDocumentClass, ucfHeaderCount } = await import("../../src/lib/panel-doc-class") as any;
  const { detectSections } = await import("../../src/lib/section-boundary-detector") as any;
  const { partitionLensSource } = await import("../../src/lib/audit-doc-purpose") as any;
  const { parseDocRegions } = await import("../../src/lib/primary-doc-resolve");
  console.log(configStamp().split("\n")[0]);

  // ExtractedDocument shim — copied from panel-adapter.ts:104, not guessed at.
  const shim = (t: string) => ({ pages: [{ pageNum: 1, text: t, lines: t.split("\n").map((l) => l.trim()).filter(Boolean) }],
                                 rawText: t, pageCount: 1, extractionMethod: "fallback", warnings: [] });

  let n = 0, hurt = 0, lostTot = 0, baseTot = 0;
  const rows: Array<{ id: string; hdr: number; base: number; merged: number; lost: number; pct: number }> = [];

  for (const f of readdirSync("scripts/audit-ai/run-records").filter((x) => x.endsWith(".json"))) {
    let raw: string | undefined;
    try { raw = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${f}`, "utf8"))?.input?.fullSource; } catch { continue; }
    if (typeof raw !== "string" || !raw) continue;
    const src = partitionLensSource(raw, parseDocRegions).lensSource;
    if (detectDocumentClass(src) !== "commercial") continue;
    const routed = routeCommercialSections(src);
    if (!routed.routed) continue;                       // whole-source fallback is a different path
    const base: Record<string, string> = routed.sectionText;
    const bag: any = detectSections(shim(src));
    const ucf: Record<string, string> = {};
    for (const [k, s] of Object.entries(bag.sections as Record<string, any>)) if (s?.text?.trim()) ucf[k] = s.text;
    const merged = { ...base, ...ucf };                 // ← panel-adapter.ts:208, verbatim
    const bSum = Object.values(base).reduce((a, s) => a + s.length, 0);
    const mSum = Object.values(merged).reduce((a, s) => a + s.length, 0);
    const lost = bSum - mSum;
    n++; baseTot += bSum; lostTot += Math.max(0, lost);
    if (lost > 0) { hurt++; rows.push({ id: f.replace(/\.(run-record\.)?json$/, "").slice(0, 32), hdr: ucfHeaderCount(src), base: bSum, merged: mSum, lost, pct: 100 * lost / bSum }); }
  }

  rows.sort((a, b) => b.lost - a.lost);
  console.log(`\ncommercial + routed packages: ${n}`);
  console.log(`packages where the UCF merge REMOVES routed chars: ${hurt}/${n}`);
  console.log(`routed chars before the merge: ${baseTot.toLocaleString()}`);
  console.log(`⛔ discarded by the merge:      ${lostTot.toLocaleString()}  (${(100 * lostTot / baseTot).toFixed(1)}%)\n`);
  console.log(`${"package".padEnd(34)}${"ucfHdrs".padStart(8)}${"routed".padStart(12)}${"after".padStart(12)}${"lost".padStart(12)}${"lost%".padStart(8)}`);
  for (const r of rows.slice(0, 15))
    console.log(`${r.id.padEnd(34)}${String(r.hdr).padStart(8)}${r.base.toLocaleString().padStart(12)}${r.merged.toLocaleString().padStart(12)}${r.lost.toLocaleString().padStart(12)}${r.pct.toFixed(0).padStart(7)}%`);
  console.log(`\nNote the ucfHdrs column: these are packages with ZERO or ONE UCF section header. The detector`);
  console.log(`whose output wins the merge had essentially nothing to detect.`);
})();
