// STEP 4 — FALSIFICATION PROBE FOR THE GROUNDING THREADING.
//
// Written BEFORE reading any delta. The threading at audit-run-record.ts:161 is only worth
// believing if perturbing the banked groundingSource actually changes replay output. If it does
// not, the threading is inert and every number after it is worthless — the exact shape this arc
// keeps finding.
//
// METHOD. Take records that currently REPRODUCE (never one already flipping — that was the
// inert-probe error), corrupt ONLY input.groundingSource, and require the replay output to change.
// Corrupting groundingSource also makes it DIFFER from fullSource, which is what causes
// audit-expert.ts:36 to take the grounding branch at all.
//
// WHAT COUNTS AS "CHANGED". replayRunRecord derives the verdict from rec.result.inputs — the
// PERSISTED decision inputs — not from ctx. So grounding cannot move replayVerdict in this
// harness by design. It moves the per-section grounding replay and the drift list. The probe
// therefore compares the full section/drift surface, not just the verdict, and says so.
import * as fs from "fs";
import * as path from "path";
import { replayRunRecord, type RunRecord } from "../../src/lib/audit-run-record";

const CACHE = path.join(__dirname, ".run-record-cache");

const applyFlagEnv = (fe: Record<string, string>) => {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(fe)) process.env[k] = v;
  return () => {
    for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  };
};

const surface = (r: ReturnType<typeof replayRunRecord>) =>
  JSON.stringify({ v: r.replayVerdict, drift: r.drift.length, sections: r.sections.map((s) => [s.section, s.grounded, s.ungroundedCount, s.pass]) });

let tested = 0, detected = 0;
for (const f of fs.readdirSync(CACHE)) {
  const rec = JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8")) as RunRecord;
  const fe = rec.meta?.flagEnv;
  if (!fe || !Object.keys(fe).length) continue;
  if (!rec.input.groundingSource) continue;

  const restore = applyFlagEnv(fe);
  let before;
  try { before = replayRunRecord(rec); } catch { restore(); continue; }
  if (!before.verdictReproduced) { restore(); continue; }   // reproducing records ONLY
  const s0 = surface(before);

  // PERTURB: replace the grounding corpus with text that grounds nothing. It now also DIFFERS
  // from fullSource, so audit-expert.ts:36 takes the grounding branch.
  const original = rec.input.groundingSource;
  rec.input.groundingSource = "GROUNDING CORPUS DELIBERATELY EMPTIED BY THE PROBE.";
  let after;
  try { after = replayRunRecord(rec); } catch { rec.input.groundingSource = original; restore(); continue; }
  rec.input.groundingSource = original;
  restore();

  const s1 = surface(after);
  tested++;
  const moved = s0 !== s1;
  if (moved) detected++;
  const groundedBefore = before.sections.reduce((n, s) => n + s.grounded, 0);
  const groundedAfter = after.sections.reduce((n, s) => n + s.grounded, 0);
  console.log(`  ${(rec.meta?.sol || f).slice(0, 22).padEnd(22)} grounded ${groundedBefore} -> ${groundedAfter}  drift ${before.drift.length} -> ${after.drift.length}  ${moved ? "DETECTED" : "NO CHANGE"}`);
}

console.log(`\n  reproducing records perturbed : ${tested}`);
console.log(`  perturbation DETECTED         : ${detected}/${tested}`);
console.log(
  detected > 0
    ? "  ✅ THREADING IS LIVE — the replay reads the banked groundingSource and responds to it."
    : "  ❌ THREADING IS INERT — groundingSource is still ignored; any delta after this is worthless.",
);
