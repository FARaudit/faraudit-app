// BYTE-IDENTITY PROOF for the softWrapJoinAt extraction. `recitalContinuation` is live behind an ARMED
// flag; extracting its inline newline rule may not change one character of its output. This replays the
// PRE-extraction inline rule against the post-extraction shared predicate over every newline in every
// banked fullSource, and over a hand-built adversarial set covering each branch.
//
// Exit 1 on ANY divergence. Run with --self-test to confirm the harness can actually go red.
export {};
import { readFileSync, readdirSync } from "node:fs";
import { softWrapJoinAt } from "../../src/lib/audit-gate-v2";

/** The rule EXACTLY as it read before the extraction (audit-gate-v2.ts:741-747 @ a271ce0d), transcribed
 *  from the pre-image and kept here as the oracle. */
function inlineOracle(after: string, p: number): number {
  let q = p + 1;
  while (q < after.length && (after[q] === " " || after[q] === "\t" || after[q] === "\r")) q++;
  if (q >= after.length || after[q] === "\n") return -1;
  const rest = after.slice(q, q + 6);
  if (/^(?:[-*•·]|\(?[a-z0-9]{1,3}[.)]|§|#)\s/i.test(rest)) return -1;
  if (/[a-z0-9$]/.test(after[q])) return q;
  return -1;
}

const SELF_TEST = process.argv.includes("--self-test");
let checked = 0, diverged = 0;
const report = (where: string, s: string, i: number, exp: number, got: number) => {
  diverged++;
  if (diverged <= 8) console.log(`   ✗ ${where} @${i}: oracle=${exp} shared=${got} · ${JSON.stringify(s.slice(i, i + 40))}`);
};

// ── 1. Adversarial set — one specimen per branch, so a real corpus that happens to miss a branch
//      cannot let a divergence through unseen.
const SPECIMENS: Array<[string, string]> = [
  ["soft wrap (lowercase)",      "coverage at a\nminimum of $1M"],
  ["soft wrap (digit)",          "not less than\n30 calendar days"],
  ["soft wrap ($)",              "a value of\n$1,000,000 or more"],
  ["soft wrap (leading spaces)", "shall be approved\n    by DOL prior to award"],
  ["capital → stop",             "shall be approved\nProof of insurance is needed"],
  ["blank line → stop",          "shall be approved\n\nThe offeror shall"],
  ["EOF → stop",                 "shall be approved\n"],
  ["bullet → stop",              "the following:\n- the first item"],
  ["enumerator (a) → stop",      "the following:\n(a) the first item"],
  ["enumerator 12. → stop",      "the following:\n12. the first item"],
  ["section mark → stop",        "see below:\n§ 7.1 applies"],
  ["tab-indented wrap",          "coverage at a\n\tminimum of $1M"],
  ["CRLF (known limit)",         "coverage at a\r\nminimum of $1M"],
];
console.log("── adversarial specimens ──");
for (const [name, s] of SPECIMENS) {
  const i = s.indexOf("\n") >= 0 ? Math.min(...[s.indexOf("\n"), s.indexOf("\r")].filter((x) => x >= 0)) : -1;
  if (i < 0) continue;
  const exp = inlineOracle(s, i), got = softWrapJoinAt(s, i);
  checked++;
  if (exp !== got) report(name, s, i, exp, got);
  else console.log(`   ✓ ${name.padEnd(28)} → ${got < 0 ? "stop" : `join@${got}`}`);
}

// ── 2. Every newline in every banked fullSource ────────────────────────────────────────────────────
const DIR = "scripts/audit-ai/run-records";
let sources = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let src: string | undefined;
  try { src = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"))?.input?.fullSource; } catch { continue; }
  if (typeof src !== "string" || !src) continue;
  sources++;
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "\n" && src[i] !== "\r") continue;
    checked++;
    let exp = inlineOracle(src, i);
    // SELF-TEST: corrupt the oracle on one in every 5,000 positions and confirm the harness reports it.
    if (SELF_TEST && checked % 5000 === 0) exp = exp === -1 ? 999999 : -1;
    const got = softWrapJoinAt(src, i);
    if (exp !== got) report(f.slice(0, 22), src, i, exp, got);
  }
}

console.log(`\nsources: ${sources} · newline positions checked: ${checked.toLocaleString()} · divergences: ${diverged}`);
if (SELF_TEST) {
  if (diverged === 0) { console.log("❌ SELF-TEST FAILED — planted divergences were NOT detected."); process.exit(1); }
  console.log(`✅ SELF-TEST PASSED — the harness reported ${diverged} planted divergence(s), so it can go red.`);
  process.exit(0);
}
if (diverged) { console.log("❌ EXTRACTION IS NOT BYTE-IDENTICAL"); process.exit(1); }
console.log("✅ softWrapJoinAt is byte-identical to the pre-extraction inline rule.");
