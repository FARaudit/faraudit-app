// U-B · STEP 0 MEASUREMENT ($0, read-only) — quantify the two panel-measured classes across the banked cohort:
//   (1) SILENT RELEASE: ungrounded READ obligations importanceOf() drops as "boilerplate" with no record
//       (the audit-gate-v2 sweep's silent `continue`);
//   (2) SEVERED CONSEQUENCE: released items whose kill consequence (reject/unacceptable/ineligible…) sits in
//       the immediately-following source sentence — the obligationsOf sentence-split severance class;
//   (3) TINA/NMR CO-SENTENCE: obligations isConditionalTinaBoilerplate() would demote that carry NMR/kill-class
//       vocab hasBarSignal is measured blind to (nonmanufacturer / 52.219-33 / bid guarantee / SPRS / 50%-rule).
// Runs under the ARMED prod flagEnv (banked bb1d6997). Numbers define the U-B probes; no engine change here.
import { readFileSync, readdirSync } from "fs";

const bb = JSON.parse(readFileSync("scripts/audit-ai/run-records/_ua-bb1d6997.json", "utf8"));
for (const [k, v] of Object.entries(bb.meta?.flagEnv ?? {})) if (v !== undefined) process.env[k] = v as string;

const CONSEQUENCE_RE = /\b(?:reject(?:ed|ion)?|unacceptable|ineligible|non-?responsive|will\s+not\s+be\s+considered|disqualif\w*|no\s+further\s+consideration|removed\s+from\s+consideration)\b/i;
const NMR_KILL_RE = /\b(?:non-?manufacturer|52\.219-33|small\s+business\s+manufacturer|bid\s+guarantee|bid\s+bond|sprs|50\s*(?:%|percent)\b|fifty\s+percent)\b/i;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

(async () => {
  const { importanceOf, isConditionalTinaBoilerplate } = await import("../../src/lib/audit-gate-v2");
  const dir = "scripts/audit-ai/run-records/_ua-cohort";
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  let recs = 0, obs = 0, released = 0, severed = 0, tinaNmr = 0;
  const severedSamples: string[] = [];
  const tinaSamples: string[] = [];
  const perRecord: Array<{ f: string; released: number; severed: number }> = [];

  for (const f of files) {
    const rec = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    const atts = rec?.result?.coverage?.attestations;
    const src: string = rec?.input?.fullSource ?? "";
    if (!Array.isArray(atts) || !src) continue;
    recs++;
    const srcNorm = norm(src);
    let rRel = 0, rSev = 0;
    for (const a of atts) {
      if (a.status !== "obligations_ungrounded") continue; // sweep-reachable only (plant exposed the over-count)
      for (const ob of a.ungrounded ?? []) {
        if (/^\[(truncated|compressor-dropped)\]/i.test(ob)) continue;
        obs++;
        if (isConditionalTinaBoilerplate(ob) && NMR_KILL_RE.test(ob)) {
          tinaNmr++;
          if (tinaSamples.length < 4) tinaSamples.push(`[${f.slice(0, 24)}] ${norm(ob).slice(0, 150)}`);
        }
        if (importanceOf(ob) !== "boilerplate") continue;
        released++; rRel++;
        // consequence severance: locate the obligation in source, inspect the next ~300 chars (the severed tail)
        const i = srcNorm.toLowerCase().indexOf(norm(ob).toLowerCase().slice(0, 80));
        if (i >= 0) {
          const tail = srcNorm.slice(i + Math.min(norm(ob).length, 80), i + Math.min(norm(ob).length, 80) + 300);
          if (CONSEQUENCE_RE.test(tail)) {
            severed++; rSev++;
            if (severedSamples.length < 8) severedSamples.push(`[${f.slice(0, 24)}] DUTY: ${norm(ob).slice(0, 110)} ⟂ TAIL: ${tail.match(CONSEQUENCE_RE)?.[0]}`);
          }
        }
      }
    }
    if (rRel) perRecord.push({ f: f.slice(0, 44), released: rRel, severed: rSev });
  }

  console.log(`records with attestations+source: ${recs} · ungrounded READ obligations: ${obs}`);
  console.log(`SILENTLY RELEASED as boilerplate: ${released} (${obs ? ((100 * released) / obs).toFixed(0) : 0}%)`);
  console.log(`  …of which SEVERED-CONSEQUENCE (kill tail in next ~300 chars): ${severed}`);
  console.log(`TINA/NMR co-sentence demotion candidates: ${tinaNmr}`);
  console.log(`\nper-record (released/severed):`);
  for (const r of perRecord.sort((a, b) => b.severed - a.severed || b.released - a.released).slice(0, 12))
    console.log(`  ${r.f.padEnd(46)} ${r.released}/${r.severed}`);
  console.log(`\nSEVERED SAMPLES:`); for (const s of severedSamples) console.log(`  ${s}`);
  console.log(`\nTINA/NMR SAMPLES:`); for (const s of tinaSamples) console.log(`  ${s}`);
})();
