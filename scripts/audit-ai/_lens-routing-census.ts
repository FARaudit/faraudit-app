// LENS ROUTING CENSUS — what each seat actually receives, driven through the PRODUCTION entry point.
//
// $0, deterministic, no model call.
//
// ⚠ THIS PROBE'S FIRST VERSION WAS WRONG IN TWO WAYS, recorded so the next one is not.
//   (1) It called `detectSections` directly. That is the UCF branch only. `buildPanelInputs` dispatches on
//       `detectDocumentClass` and takes `routeCommercialSections` for a commercial package — and the four
//       banked packages where the spec partition actually fires are ALL commercial (ucfHeaders=0). So the
//       "0.0% effect" it reported was measured on a branch those packages never take.
//   (2) It called `assembleLensPasses(lens, st, {})` with no `docClass`, which silently selects the UCF
//       assignment map (`LENS_SECTIONS`) even for a commercial package, where production uses
//       `LENS_SECTIONS_COMMERCIAL`.
// Both are the same mistake: reconstructing the pipeline instead of calling it. This version calls
// `buildPanelInputs(fullSource)` — the one production caller, audit-executor-v3.ts:613 — and threads the
// document class into `assembleLensPasses` exactly as agentic-panel-runner.ts:442 does.
export {};
import { applyStampedConfig, configStamp } from "./_instrument";
import { readFileSync, readdirSync } from "node:fs";

applyStampedConfig("live");

(async () => {
  const { buildPanelInputs } = await import("../../src/lib/panel-adapter");
  const { assembleLensPasses, LENS_SECTIONS } = await import("../../src/lib/agentic-sections") as any;
  const { partitionLensSource, classifyDocPurpose } = await import("../../src/lib/audit-doc-purpose") as any;
  const { parseDocRegions } = await import("../../src/lib/primary-doc-resolve");
  console.log(configStamp().split("\n")[0]);

  const LENSES: string[] = Object.keys(LENS_SECTIONS);
  type Row = {
    id: string; cls: string; ok: boolean; unrouted: number; srcChars: number;
    withheldDocs: number; withheldChars: number; withheldObligationDocs: number;
    seat: Record<string, { passes: number; chars: number }>;
  };
  const rows: Row[] = [];

  for (const f of readdirSync("scripts/audit-ai/run-records").filter((x) => x.endsWith(".json"))) {
    let src: string | undefined;
    try { src = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${f}`, "utf8"))?.input?.fullSource; } catch { continue; }
    if (typeof src !== "string" || !src) continue;

    let inputs: any;
    try { inputs = buildPanelInputs(src); } catch (e) { console.log(`  ⚠ ${f}: buildPanelInputs threw — ${(e as Error).message.slice(0, 70)}`); continue; }

    const seat: Row["seat"] = {};
    for (const L of LENSES) {
      const { passes } = assembleLensPasses(L, inputs.sectionText, { docClass: inputs.documentClass });
      seat[L] = { passes: passes.length, chars: passes.reduce((n: number, p: any) => n + (p.text?.length ?? 0), 0) };
    }

    // Partition effect, measured on its own terms rather than via a fake bypass: how much was withheld, and
    // how much of it carried an obligation at all (a spec book with no duty sentence costs nothing to drop).
    const part = partitionLensSource(src, parseDocRegions);
    let withheldObligationDocs = 0;
    for (const r of parseDocRegions(src))
      if (classifyDocPurpose(r.name, r.text).lensExcluded && /\b(shall|must|required)\b/i.test(r.text)) withheldObligationDocs++;

    rows.push({ id: f.replace(/\.json$/, "").slice(0, 38), cls: inputs.documentClass, ok: !!inputs.manifest?.ok,
                unrouted: (inputs.unroutedBinding ?? []).length, srcChars: src.length,
                withheldDocs: part.withheld.length, withheldChars: part.withheldChars, withheldObligationDocs, seat });
  }

  // ── 1. WHAT THE PANEL SEES, BY CLASS ───────────────────────────────────────────────────────────
  const byCls = new Map<string, Row[]>();
  for (const r of rows) byCls.set(r.cls, [...(byCls.get(r.cls) ?? []), r]);
  console.log(`\nsources measured: ${rows.length}`);
  for (const [cls, rs] of byCls)
    console.log(`   class=${cls.padEnd(11)} ${String(rs.length).padStart(3)} package(s) · manifest.ok ${rs.filter((r) => r.ok).length}/${rs.length} · median unroutedBinding ${rs.map((r) => r.unrouted).sort((a, b) => a - b)[Math.floor(rs.length / 2)]}`);

  // ── 2. PER SEAT, PER CLASS ─────────────────────────────────────────────────────────────────────
  for (const [cls, rs] of byCls) {
    console.log(`\n── SEAT LOAD · class=${cls} · ${rs.length} package(s) ──`);
    console.log(`${"lens".padEnd(30)}${"Σpasses".padStart(9)}${"max".padStart(6)}${"Σchars".padStart(13)}${"max chars".padStart(12)}`);
    const acc = LENSES.map((L) => ({
      L, p: rs.reduce((n, r) => n + r.seat[L].passes, 0), mp: Math.max(...rs.map((r) => r.seat[L].passes)),
      c: rs.reduce((n, r) => n + r.seat[L].chars, 0), mc: Math.max(...rs.map((r) => r.seat[L].chars)),
    })).sort((a, b) => b.p - a.p);
    for (const a of acc)
      console.log(`${a.L.padEnd(30)}${String(a.p).padStart(9)}${String(a.mp).padStart(6)}${a.c.toLocaleString().padStart(13)}${a.mc.toLocaleString().padStart(12)}`);
    const hi = acc[0], lo = acc[acc.length - 1];
    console.log(`   imbalance ${hi.L} / ${lo.L} = ${(hi.p / Math.max(lo.p, 1)).toFixed(1)}x by passes, ${(hi.c / Math.max(lo.c, 1)).toFixed(1)}x by chars`);
  }

  // ── 3. THE SPEC PARTITION, WHERE IT FIRES ──────────────────────────────────────────────────────
  const fired = rows.filter((r) => r.withheldDocs > 0);
  console.log(`\n── SPEC PARTITION · fires on ${fired.length}/${rows.length} packages ──`);
  console.log(`${"package".padEnd(40)}${"class".padStart(11)}${"withheld".padStart(10)}${"chars".padStart(12)}${"% of src".padStart(10)}${"w/ duties".padStart(11)}${"busiest seat".padStart(14)}`);
  for (const r of fired) {
    const busiest = LENSES.reduce((a, b) => (r.seat[a].passes >= r.seat[b].passes ? a : b));
    console.log(`${r.id.padEnd(40)}${r.cls.padStart(11)}${String(r.withheldDocs).padStart(10)}${r.withheldChars.toLocaleString().padStart(12)}${(100 * r.withheldChars / r.srcChars).toFixed(0).padStart(9)}%${String(r.withheldObligationDocs).padStart(11)}${(busiest.slice(0, 12) + ":" + r.seat[busiest].passes).padStart(14)}`);
  }

  // ── 4. THE WORST SEAT ANYWHERE ─────────────────────────────────────────────────────────────────
  let worst = { id: "", L: "", passes: 0, chars: 0, cls: "" };
  for (const r of rows) for (const L of LENSES)
    if (r.seat[L].passes > worst.passes) worst = { id: r.id, L, passes: r.seat[L].passes, chars: r.seat[L].chars, cls: r.cls };
  console.log(`\n── WORST SINGLE SEAT: ${worst.L} on ${worst.id} (class=${worst.cls}) — ${worst.passes} passes, ${worst.chars.toLocaleString()} chars ──`);
  console.log(`   flagship comparison: capture_strategist took 37 passes / 629,737 in-tok on W911SG27BA002,`);
  console.log(`   whose source is NOT in this banked set — so that number is not reproduced here, in either direction.`);
})();
