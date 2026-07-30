// INDEPENDENT JUDGE probe — real-record fidelity. Written from scratch, does NOT reuse generator probes.
import { readFileSync } from "node:fs";
import {
  detectQuantityAmbiguities,
  applyQuantityAmbiguityFidelity,
  disposeFinding,
} from "../../src/lib/audit-decide";

const rec = JSON.parse(readFileSync("/tmp/seq2-runrecord.json", "utf8"));
const src: string = rec.input.fullSource;
const findings = rec.result.findings;

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("  PASS", m); } else { fail++; console.log("  FAIL", m); } };

// 1. detect fires exactly once, on the 520/1040 pair
const amb = detectQuantityAmbiguities(src);
ok(amb.length === 1, `detect fires EXACTLY ONCE (got ${amb.length})`);
if (amb.length) {
  const a = amb[0];
  ok((a.a === 520 && a.b === 1040) || (a.a === 1040 && a.b === 520), `pair is 520/1040 (got ${a.a}/${a.b})`);
  ok(a.unit === "hour", `unit family is hour (got ${a.unit})`);
  // verbatim span present in source
  ok(src.includes(a.sentence), `emitted sentence is a VERBATIM source span`);
  ok(/520/.test(a.sentence) && /1,?040/.test(a.sentence), `span carries both numbers`);
  ok(/\?\s*$/.test(a.sentence), `span is interrogative (ends with ?)`);
  console.log("  SPAN:", JSON.stringify(a.sentence.slice(0, 160)));
}

// 2. OFF = byte-identical (same ref)
const off = applyQuantityAmbiguityFidelity(findings, src, { enabled: false });
ok(off === findings, `OFF returns SAME array ref (byte-identical no-op)`);

// 3. ON = +1 finding, all prior byte-identical
const on = applyQuantityAmbiguityFidelity(findings, src, { enabled: true });
ok(on.length === findings.length + 1, `ON adds EXACTLY one (${findings.length} -> ${on.length})`);
let allSame = true;
for (let i = 0; i < findings.length; i++) if (on[i] !== findings[i]) allSame = false;
ok(allSame, `ON: every pre-existing finding is the SAME object ref (non-destructive)`);

// 4. the added finding: caution-floored, gate-to-clear, curable, NOT disqualifying
const added = on[on.length - 1];
ok(added.controllability === "bidder_controls", `added: bidder_controls`);
ok(added.cautionFloor === true, `added: cautionFloor === true`);
ok(added.curableInWindow === true, `added: curableInWindow`);
ok(disposeFinding(added) === "gate_to_clear", `added: disposeFinding = gate_to_clear (NOT disqualifying)`);
ok(disposeFinding(added) !== "disqualifying", `added: NEVER disqualifying`);
ok(added.grounded === true, `added: grounded`);
ok(/520/.test(added.requirement) && /1,?040/.test(added.requirement), `added.requirement names both horns`);
ok(/2×|2x/i.test(added.requirement), `added.requirement states the 2x spread`);

// 5. idempotent — ON∘ON does not double-emit
const on2 = applyQuantityAmbiguityFidelity(on, src, { enabled: true });
ok(on2.length === on.length, `ON∘ON idempotent (no double emit): ${on.length} -> ${on2.length}`);

console.log(`\n=== JUDGE real-record: ${pass} pass / ${fail} fail ===`);
process.exit(fail ? 1 : 0);
