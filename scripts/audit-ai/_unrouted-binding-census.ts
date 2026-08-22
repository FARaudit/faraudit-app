// UNROUTED BINDING CENSUS — what is in the binding content no lens ever receives?
//
// $0, deterministic, no model call. `buildPanelInputs` reports `unroutedBinding`: binding-verb lines
// present in the (post-spec-partition) source but contained in NONE of the routed section texts. Median
// across the banked corpus is 112 lines PER PACKAGE. This asks the only question that matters about that
// number: is it furniture, or is it obligations — and does any of it carry an eligibility BAR?
//
// A bar routed to no section is invisible to every lens seat by construction. No turn budget, no model
// upgrade and no threshold change can recover it, because it is never in anyone's input.
export {};
import { applyStampedConfig, configStamp } from "./_instrument";
import { readFileSync, readdirSync } from "node:fs";

applyStampedConfig("live");

(async () => {
  const { buildPanelInputs } = await import("../../src/lib/panel-adapter");
  const { importanceOf, hasBarSignal } = await import("../../src/lib/audit-gate-v2");
  console.log(configStamp().split("\n")[0]);

  // Page furniture / structural noise — a line that is a heading, a TOC entry, a page marker or a bare
  // table row is "binding" only because a verb appears in it. Positive shapes only; anything unmatched
  // counts as PROSE, so the furniture share can only be UNDER-stated, never inflated.
  const FURNITURE = [
    { name: "page marker",   re: /^-{2,}\s*\d+\s+of\s+\d+\s*-{2,}$|^page\s+\d+\s*(of\s+\d+)?$/i },
    { name: "TOC dot-leader", re: /\.{4,}\s*\d+\s*$/ },
    { name: "section heading", re: /^(?:SECTION\s+[A-M]\b|\d+(?:\.\d+)*\.?\s+[A-Z][A-Z \-/&]{6,}$)/ },
    { name: "all-caps banner", re: /^[A-Z0-9 ,.\-/()&']{18,}$/ },
    { name: "clause-number only", re: /^\d{2}\.\d{3}-\d+\b[^.]{0,60}$/ },
    { name: "table/number row", re: /^[\d.,$%\s|—–-]{10,}$/ },
  ];
  const classify = (l: string) => FURNITURE.find((f) => f.re.test(l))?.name ?? "PROSE";

  let pkgs = 0, total = 0;
  const shape = new Map<string, number>();
  const barLines: Array<{ pkg: string; line: string; why: string }> = [];
  const proseSample: string[] = [];
  const perPkg: Array<{ id: string; n: number; prose: number; bars: number }> = [];

  for (const f of readdirSync("scripts/audit-ai/run-records").filter((x) => x.endsWith(".json"))) {
    let src: string | undefined;
    try { src = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${f}`, "utf8"))?.input?.fullSource; } catch { continue; }
    if (typeof src !== "string" || !src) continue;
    let inputs: any; try { inputs = buildPanelInputs(src); } catch { continue; }
    const lines: string[] = inputs.unroutedBinding ?? [];
    pkgs++; total += lines.length;
    let prose = 0, bars = 0;
    for (const l of lines) {
      const k = classify(l);
      shape.set(k, (shape.get(k) ?? 0) + 1);
      if (k !== "PROSE") continue;
      prose++;
      if (proseSample.length < 400) proseSample.push(l);
      const imp = importanceOf(l), bar = hasBarSignal(l);
      if (imp === "disqualifier" || bar) {
        bars++;
        if (barLines.length < 500) barLines.push({ pkg: f.slice(0, 22), line: l, why: imp === "disqualifier" ? "DISQUALIFIER_RE" : "barSignal" });
      }
    }
    perPkg.push({ id: f.replace(/\.json$/, "").slice(0, 36), n: lines.length, prose, bars });
  }

  console.log(`\npackages: ${pkgs} · unrouted binding lines total: ${total.toLocaleString()} · mean ${(total / pkgs).toFixed(0)}/pkg`);
  console.log("\n── WHAT THE LINES ARE ────────────────────────────────────────");
  for (const [k, n] of [...shape.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`   ${k.padEnd(20)} ${String(n).padStart(6)}  ${(100 * n / total).toFixed(1)}%`);

  const proseTotal = shape.get("PROSE") ?? 0;
  console.log(`\n── THE PROSE SHARE — real sentences no lens receives ──`);
  console.log(`   ${proseTotal.toLocaleString()} lines (${(100 * proseTotal / total).toFixed(1)}% of unrouted), mean ${(proseTotal / pkgs).toFixed(0)}/pkg`);

  console.log(`\n── ⛔ BAR-CARRYING LINES ROUTED TO NO SECTION: ${barLines.length} ──`);
  const seen = new Set<string>();
  let shown = 0;
  for (const b of barLines) {
    const k = b.line.slice(0, 70).toLowerCase();
    if (seen.has(k)) continue; seen.add(k);
    if (shown++ >= 18) break;
    console.log(`   [${b.why}] ${JSON.stringify(b.line.slice(0, 132))}`);
  }
  console.log(`   (${seen.size} unique of ${barLines.length})`);

  const withBars = perPkg.filter((p) => p.bars > 0);
  console.log(`\n── PACKAGES WITH ≥1 UNROUTED BAR LINE: ${withBars.length}/${pkgs} ──`);
  for (const p of withBars.sort((a, b) => b.bars - a.bars).slice(0, 12))
    console.log(`   ${p.id.padEnd(38)} ${String(p.bars).padStart(4)} bar · ${String(p.prose).padStart(4)} prose · ${String(p.n).padStart(4)} unrouted total`);

  console.log(`\n── PROSE SAMPLE (non-bar, to show what the rest is) ──`);
  for (const l of proseSample.filter((l) => !barLines.some((b) => b.line === l)).slice(0, 8))
    console.log(`   ${JSON.stringify(l.slice(0, 130))}`);
})();
