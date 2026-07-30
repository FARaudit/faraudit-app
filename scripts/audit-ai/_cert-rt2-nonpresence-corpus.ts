// $0 CERT — REPORT-TRUTH #2 at CORPUS SCALE. The unit test proves the gate fires on four known-bad claims and spares
// eleven hand-picked good ones; that sample is far too small to trust a regex that touches every finding we ship.
//
// This sweeps the gate across EVERY banked run record (real findings from real solicitations) and prints:
//   • the fire rate — a gate that flags a large fraction of all findings is mislabelling ordinary prose;
//   • EVERY distinct sentence it fires on, so a human can read them and judge precision directly.
// Absence-claims are rare by nature, so a high rate is itself the failure signal.
//
// Run: npx tsx scripts/audit-ai/_cert-rt2-nonpresence-corpus.ts
import fs from "fs";
import path from "path";

const DIR = "scripts/audit-ai/run-records";
// A gate that fires on more than a few percent of findings is not detecting a rare claim class — it is mislabelling
// ordinary prose. Set from the shape of the class, not fitted to the observed number.
const MAX_FIRE_RATE = 0.06;

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } };

(async () => {
  const { rescopeNonPresence, NONPRESENCE_PREFIX } = await import("../../src/lib/audit-nonpresence-honesty");

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));
  let total = 0, fired = 0, records = 0;
  const firedSentences: Array<{ sol: string; text: string }> = [];

  for (const f of files) {
    let rec: Record<string, unknown>;
    try { rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
    // run-record/v1 schema: {schema, meta, input, format, result, billing} — findings live at result.findings.
    const findings = (((rec as { result?: { findings?: unknown[] } }).result?.findings)
      ?? ((rec as { findings?: unknown[] }).findings)
      ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(findings) || !findings.length) continue;
    records++;
    const sol = f.split(".")[0];
    for (const fi of findings) {
      const req = String(fi.requirement ?? "");
      if (!req) continue;
      total++;
      const r = rescopeNonPresence(req);
      if (r.shapes.length) {
        fired++;
        // Record only the framed sentence, not the whole finding, so the output is readable.
        for (const s of r.text.split(/(?<=[.!?])\s+/)) if (s.startsWith(NONPRESENCE_PREFIX)) firedSentences.push({ sol, text: s });
      }
    }
  }

  console.log(`\nswept ${records} run records · ${total} findings with requirement text`);
  console.log(`fired on ${fired} (${(fired / Math.max(1, total) * 100).toFixed(1)}%)\n`);

  console.log("===== EVERY SENTENCE THE GATE FRAMED — read these and judge precision =====");
  const seen = new Set<string>();
  for (const s of firedSentences) {
    const key = s.text.slice(0, 110);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`\n[${s.sol}]`);
    console.log(`  ${s.text.replace(/\s+/g, " ").slice(0, 300)}`);
  }

  console.log("\n===== ASSERTIONS =====");
  ok(`the sweep actually reached a corpus (≥8 records, ≥200 findings)`, records >= 8 && total >= 200);
  ok(`fire rate ${(fired / Math.max(1, total) * 100).toFixed(1)}% is under the ${(MAX_FIRE_RATE * 100).toFixed(0)}% ceiling`, fired / Math.max(1, total) <= MAX_FIRE_RATE);
  ok(`the gate is not inert — it fired on something`, fired > 0);

  // The deadline idiom is the highest-consequence collision: it appears in nearly every solicitation and framing it
  // would be worse than the defect this gate fixes. Assert it never got framed anywhere in the corpus.
  const deadlineFramed = firedSentences.filter((s) => /\bno (?:later|earlier|fewer|more|less) than\b/i.test(s.text));
  ok(`no deadline idiom ("no later than") was framed anywhere in the corpus`, deadlineFramed.length === 0);
  if (deadlineFramed.length) for (const d of deadlineFramed.slice(0, 5)) console.log(`      ↳ ${d.text.slice(0, 160)}`);

  console.log(`\nCERT RT2-CORPUS · non-presence at scale: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
