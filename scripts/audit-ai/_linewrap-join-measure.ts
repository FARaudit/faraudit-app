// MEASURE AUDIT_OBLIGATION_LINEWRAP_JOIN, at the point the flag actually acts.
//
// ⚠ WHY THIS DOES NOT REPLAY VERDICTS. The first version of this probe fed the banked ATTESTATIONS back
// into gradeCoverageV2 → deriveVerdict under both flag states and reported 50/50 records unchanged. That
// result was worthless: a run record stores `obligationsOf`'s OUTPUT (the attestation, with its frozen
// `ungrounded` array), never its INPUT (the section text). The split had already happened before anything
// the record preserves, so the probe reported "no effect" for every flag state — including states where
// the effect is total. It was a probe agreeing with the wrong thing, not evidence of a no-op.
//
// So this measures the SPLIT directly, on real source text, and reports:
//   · how the obligation set changes (count, merges, the exact sentences)
//   · how `importanceOf` re-classifies them — the disqualifier delta is the whole point of the fix
//   · both error directions: fragments that STOP escalating, and whole sentences that START
//
// The end-to-end verdict effect is NOT measurable on banked records and is not claimed here. It needs a
// live run. $0, deterministic, no model call.
export {};
import { applyStampedConfig, configStamp } from "./_instrument";
import { readFileSync, readdirSync } from "node:fs";

applyStampedConfig("live");
const DIR = "scripts/audit-ai/run-records";
const FLAG = "AUDIT_OBLIGATION_LINEWRAP_JOIN";

(async () => {
  const { obligationsOf, docRegions } = await import("../../src/lib/audit-orchestrator") as any;
  const { gradeCoverageV2, verifyRecitalInSource, consequenceTailsAfter } = await import("../../src/lib/audit-gate-v2");
  const { locateObligationContext } = await import("../../src/lib/audit-orchestrator") as any;
  console.log(configStamp().split("\n")[0]);

  const sources: Array<{ id: string; src: string }> = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
    let src: string | undefined;
    try { src = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"))?.input?.fullSource; } catch { continue; }
    if (typeof src === "string" && src) sources.push({ id: f.replace(/\.json$/, "").slice(0, 44), src });
  }

  const run = (flag: "false" | "true", text: string) => { process.env[FLAG] = flag; return obligationsOf(text); };
  // THE ESCALATION DECISION IS THE WHOLE CHAIN, not `importanceOf` alone. importanceOf returns
  // "disqualifier" only on a DISQUALIFIER_RE hit; almost everything that actually escalates arrives via the
  // AMBIGUOUS fall-through in gradeCoverageV2, after the boilerplate release, the benign-recital triage, the
  // performance-upkeep caveat, the bar-signal demotion and its tail veto. Counting importanceOf hits scored
  // 0 → 2 on a corpus where the real bucket is in the hundreds. So ask the real function: hand it a section
  // whose ungrounded set IS the obligation set (worst case, applied identically to both flag states) and read
  // `disqualifierUncovered`.
  const escalating = (obs: string[], src: string): string[] => {
    if (!obs.length) return [];
    const cov = gradeCoverageV2(
      [{ section: "L", status: "obligations_ungrounded", obligations: obs, citedFindingIds: [], ungrounded: obs }] as any,
      { locate: (ob: string) => locateObligationContext(src, ob),
        verifyRecitalPresence: (ob: string) => verifyRecitalInSource(src, ob),
        consequenceTails: (ob: string) => consequenceTailsAfter(src, ob) },
    );
    return (cov.disqualifierUncovered ?? []).map((d: any) => d.obligation);
  };

  let totOff = 0, totOn = 0, dqOff = 0, dqOn = 0, docs = 0, truncOff = 0, truncOn = 0;
  const stopped: string[] = [], started: string[] = [];

  for (const { src } of sources) {
    // Per DOCUMENT REGION, which is the granularity the section router works at — measuring one 276k-char
    // blob would hide per-document behaviour and let one pathological region dominate the totals.
    for (const r of docRegions(src)) {
      docs++;
      const off = run("false", r.text), on = run("true", r.text);
      totOff += off.obligations.length; totOn += on.obligations.length;
      if (off.truncated) truncOff++; if (on.truncated) truncOn++;
      const eOff = escalating(off.obligations, src), eOn = escalating(on.obligations, src);
      dqOff += eOff.length; dqOn += eOn.length;

      const dqSetOff = new Set(eOff), dqSetOn = new Set(eOn);
      for (const o of dqSetOff) if (!dqSetOn.has(o)) stopped.push(o);
      for (const o of dqSetOn) if (!dqSetOff.has(o)) started.push(o);
    }
  }
  delete process.env[FLAG];

  console.log(`\nsources: ${sources.length} · document regions: ${docs}\n`);
  console.log("── THE OBLIGATION SET ────────────────────────────────────────");
  console.log(`   obligation sentences extracted : ${totOff.toLocaleString()} → ${totOn.toLocaleString()}  (${totOn - totOff >= 0 ? "+" : ""}${(totOn - totOff).toLocaleString()})`);
  console.log(`   regions hitting the 200 cap    : ${truncOff} → ${truncOn}`);
  console.log("\n── CLASSIFIED AS DISQUALIFIER (what escalates) ───────────────");
  console.log(`   ${dqOff.toLocaleString()} → ${dqOn.toLocaleString()}  (${dqOn - dqOff >= 0 ? "+" : ""}${(dqOn - dqOff).toLocaleString()}, ${dqOff ? (100 * (dqOn - dqOff) / dqOff).toFixed(1) : "—"}%)`);

  const uniq = (a: string[]) => [...new Set(a.map((s) => s.trim()))];
  const uStopped = uniq(stopped), uStarted = uniq(started);
  console.log(`\n── STOPPED escalating (${uStopped.length} unique) — sentences that were fragments ──`);
  for (const o of uStopped.slice(0, 14)) console.log(`   − ${JSON.stringify(o.slice(0, 120))}`);
  if (uStopped.length > 14) console.log(`   … and ${uStopped.length - 14} more`);
  console.log(`\n── STARTED escalating (${uStarted.length} unique) — the OVER-FIRE direction ──`);
  for (const o of uStarted.slice(0, 14)) console.log(`   + ${JSON.stringify(o.slice(0, 120))}`);
  if (uStarted.length > 14) console.log(`   … and ${uStarted.length - 14} more`);

  console.log("\n── THE TWO FRAGMENTS THE FIX WAS BUILT FOR ───────────────────");
  for (const frag of ["key personnel shall be approved", "these supplies and property shall be utilized during the performance of this"]) {
    const inOff = uniq(stopped.concat()).find((o) => o.toLowerCase() === frag);
    const grew = uStarted.find((o) => o.toLowerCase().startsWith(frag.slice(0, 30)));
    console.log(`   ${JSON.stringify(frag.slice(0, 62))}`);
    console.log(`     fragment stopped escalating : ${inOff ? "YES" : "no"}`);
    console.log(`     whole sentence now          : ${grew ? JSON.stringify(grew.slice(0, 130)) : "(not escalating — classified non-disqualifier)"}`);
  }
})();
