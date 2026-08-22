// AUDIT_ADAPTER_ROUTER_PRECEDENCE — OFF vs ON over the banked corpus. $0, deterministic, no model call.
//
// WHAT THIS ANSWERS, and what it deliberately does NOT.
//   MEASURED HERE: how much source each lens seat actually receives, how many lens PASSES that becomes (the
//   direct cost/wall driver — the runner calls the model once per pass), how many binding lines route to no
//   lens, and how many packages consequently trip `enforceCoverageFloor`, which DISCARDS the chief judge's
//   verdict/eligible/fit_score/show_stoppers and forces INCOMPLETE.
//   NOT MEASURED HERE: findings and model-authored verdicts. Those need a live paid run — this probe cannot
//   produce them and does not estimate them. What it CAN state about verdicts is the deterministic floor:
//   whether the coverage guard fires at all. Reporting anything more from a $0 replay would be the placebo
//   shape (see feedback: static review cannot replace execution).
//
// IT DRIVES THE PRODUCTION ENTRY POINT. `buildPanelInputs(fullSource)` and `assembleLensPasses(lens, …,
// { docClass })` are called exactly as `agentic-panel-runner.ts:442` calls them — no reconstructed merge, no
// hand-built section map. Three probes in one session produced confident WRONG numbers by rebuilding a
// pipeline instead of calling it; this one calls it.
export {};
import { applyStampedConfig, configStamp } from "./_instrument";
import { readFileSync, readdirSync } from "node:fs";

applyStampedConfig("live");

// Banked records are gitignored, so they exist ONLY in the primary checkout. A worktree must be told where
// they are — never by symlinking the tracked path, which shows up as a deleted .gitkeep in the commit.
const RECORD_DIR = process.env.RECORD_DIR ?? "scripts/audit-ai/run-records";
const num = (n: number) => n.toLocaleString();
const pct = (a: number, b: number) => (b === 0 ? "0.0" : (100 * a / b).toFixed(1));

(async () => {
  const { buildPanelInputs } = await import("../../src/lib/panel-adapter");
  const { assembleLensPasses, LENS_SECTIONS } = await import("../../src/lib/agentic-sections") as any;
  const LENSES = Object.keys(LENS_SECTIONS);

  console.log(configStamp().split("\n")[0]);
  console.log(`lens seats: ${LENSES.length} · budget: production default (assembleLensPasses called as runner:442 calls it)\n`);

  // Both states measured in ONE process on the SAME input, so nothing but the flag differs.
  const measure = (raw: string, on: boolean) => {
    const prev = process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE;
    process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE = on ? "true" : "false";
    const log = console.log; console.log = () => {};            // silence the per-run routing line
    try {
      const pi = buildPanelInputs(raw);
      let lensChars = 0, passes = 0, starved = 0;
      for (const l of LENSES) {
        const a = assembleLensPasses(l, pi.sectionText, { docClass: pi.documentClass });
        lensChars += a.passes.reduce((s: number, p: any) => s + (p.source ?? p.text ?? "").length, 0);
        passes += a.passes.length;
        if (a.passes.length === 0) starved++;
      }
      return {
        cls: pi.documentClass,
        sectionChars: Object.values(pi.sectionText).reduce((s: number, v: any) => s + String(v).length, 0),
        keys: Object.keys(pi.sectionText).length,
        unrouted: pi.unroutedBinding.length,
        manifestOk: !!pi.manifest?.ok,
        lensChars, passes, starved,
      };
    } finally {
      console.log = log;
      if (prev === undefined) delete process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE; else process.env.AUDIT_ADAPTER_ROUTER_PRECEDENCE = prev;
    }
  };

  const rows: any[] = [];
  let skipped = 0;
  for (const f of readdirSync(RECORD_DIR).filter((x) => x.endsWith(".json")).sort()) {
    let raw: string | undefined;
    try { raw = JSON.parse(readFileSync(`${RECORD_DIR}/${f}`, "utf8"))?.input?.fullSource; } catch { skipped++; continue; }
    if (typeof raw !== "string" || !raw.trim()) { skipped++; continue; }
    const { ucfHeaderCount } = await import("../../src/lib/panel-doc-class");
    const off = measure(raw, false), on = measure(raw, true);
    rows.push({ id: f.replace(/\.(run-record\.)?json$/, "").slice(0, 30), hdr: ucfHeaderCount(raw), off, on });
  }

  // ── ELIGIBLE POPULATION. The flag can only act where it fires: commercial class AND zero UCF headers.
  const fired = rows.filter((r) => r.off.sectionChars !== r.on.sectionChars || r.off.unrouted !== r.on.unrouted || r.off.passes !== r.on.passes);
  const eligible = rows.filter((r) => r.hdr === 0 && r.off.cls === "commercial");

  console.log(`records with a usable fullSource: ${rows.length}   (skipped, no source: ${skipped})`);
  console.log(`  commercial + ucfHeaderCount===0 (where the flag CAN fire): ${eligible.length}`);
  console.log(`  records the flag actually CHANGES:                        ${fired.length}`);
  console.log(`  records byte-identical OFF vs ON:                         ${rows.length - fired.length}   ← inertness, measured not asserted\n`);

  const sum = (k: (r: any) => number) => rows.reduce((s, r) => s + k(r), 0);
  const T = [
    ["section-map chars (what the merge produces)", sum((r) => r.off.sectionChars), sum((r) => r.on.sectionChars)],
    ["chars delivered to lens seats (post-assembly)", sum((r) => r.off.lensChars), sum((r) => r.on.lensChars)],
    ["lens passes = model calls in the panel phase", sum((r) => r.off.passes), sum((r) => r.on.passes)],
    ["binding lines routed to NO lens", sum((r) => r.off.unrouted), sum((r) => r.on.unrouted)],
    ["lens seats receiving NOTHING (starved)", sum((r) => r.off.starved), sum((r) => r.on.starved)],
  ] as Array<[string, number, number]>;

  console.log("── CORPUS TOTALS ──────────────────────────────────────────────────────────────────────────");
  console.log(`${"".padEnd(46)}${"OFF".padStart(14)}${"ON".padStart(14)}${"Δ".padStart(14)}${"Δ%".padStart(9)}`);
  for (const [label, o, n] of T)
    console.log(`${label.padEnd(46)}${num(o).padStart(14)}${num(n).padStart(14)}${((n - o >= 0 ? "+" : "") + num(n - o)).padStart(14)}${((n - o >= 0 ? "+" : "") + pct(n - o, o)).padStart(8)}%`);

  // ── THE COVERAGE FLOOR. Non-empty unroutedBinding ⇒ enforceCoverageFloor REPLACES the chief judge's verdict
  //    with INCOMPLETE. This is the one verdict-side effect a $0 replay can state, because it is deterministic.
  const floorOff = rows.filter((r) => r.off.unrouted > 0).length;
  const floorOn = rows.filter((r) => r.on.unrouted > 0).length;
  console.log(`\n── DETERMINISTIC VERDICT FLOOR (enforceCoverageFloor) ─────────────────────────────────────`);
  console.log(`packages whose chief judge is DISCARDED for unrouted binding content:`);
  console.log(`  OFF: ${floorOff}/${rows.length} (${pct(floorOff, rows.length)}%)   ON: ${floorOn}/${rows.length} (${pct(floorOn, rows.length)}%)   Δ ${floorOn - floorOff}`);
  console.log(`  (findings and model verdicts are NOT measured here — they require a live paid run.)`);

  console.log(`\n── PER-PACKAGE, where the flag fires (top 15 by chars restored) ───────────────────────────`);
  console.log(`${"package".padEnd(32)}${"hdr".padStart(5)}${"sect OFF".padStart(12)}${"sect ON".padStart(12)}${"lens OFF".padStart(12)}${"lens ON".padStart(12)}${"passes".padStart(9)}${"unrouted".padStart(11)}`);
  for (const r of fired.sort((a, b) => (b.on.sectionChars - b.off.sectionChars) - (a.on.sectionChars - a.off.sectionChars)).slice(0, 15))
    console.log(`${r.id.padEnd(32)}${String(r.hdr).padStart(5)}${num(r.off.sectionChars).padStart(12)}${num(r.on.sectionChars).padStart(12)}${num(r.off.lensChars).padStart(12)}${num(r.on.lensChars).padStart(12)}${`${r.off.passes}→${r.on.passes}`.padStart(9)}${`${r.off.unrouted}→${r.on.unrouted}`.padStart(11)}`);

  // ── NEGATIVE CONTROL. Any record the flag changes MUST have zero UCF headers. If one does not, the scope
  //    leaked and every number above is describing a different change than the one under review.
  const leaked = fired.filter((r) => r.hdr !== 0);
  console.log(`\n── SCOPE CONTROL ─────────────────────────────────────────────────────────────────────────`);
  console.log(leaked.length === 0
    ? `✓ every changed record has ucfHeaderCount === 0 (${fired.length}/${fired.length}) — inert on genuine UCF, measured`
    : `❌ SCOPE LEAK — ${leaked.length} changed record(s) carry UCF headers: ${leaked.map((r) => `${r.id}(${r.hdr})`).join(", ")}`);
  process.exit(leaked.length === 0 ? 0 : 1);
})();
