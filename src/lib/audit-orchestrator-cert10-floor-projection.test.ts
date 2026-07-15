// STANDING CERT-10 "floor-on-real-noticedesc" PROJECTION (Brain card #516 R5 · #518 R2). Run:
//   npx tsx src/lib/audit-orchestrator-cert10-floor-projection.test.ts
//
// WHY THIS EXISTS — the #516 projection-gap finding: the seq-1 FA303026Q0020 paid runs kept false-NHR'ing because the
// $0 pre-fire only ever tested the demotion predicate on ISOLATED sentence probes — it proved the fix's MECHANISM,
// never its EFFECT on the REAL notice body. This test runs the ACTUAL floor (`noticeBodyEligibilityUngrounded`) over the
// WHOLE fetched notice body so a class fix is proven on the real notice BEFORE any paid re-run.
//
// FIXTURE DOCTRINE (Brain card #518 R2, PERMANENT): the projection fixture is the BYTE-EXACT captured input from a real
// run — NEVER a reconstruction. The #516 R5 fixture WAS a reconstruction (card-derived) that dropped the SAM sentence's
// trailing URL "… (SAM) database at http://www.sam.gov"; it projected DEMOTE while production run 56ef9717 NHR'd on
// exactly those URL tokens (proof-shape ≠ production ctx — the recurring failure). This fixture is now the byte-exact
// "SAM Notice Body" region consumed by run 56ef9717, SHA-256 attested below. Re-bank ONLY from a real run's persisted
// input; update the hash in lockstep.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { noticeBodyEligibilityUngrounded, emitSelfDeterminableCaveats } from "./audit-orchestrator";
import { NOTICE_BODY_DOC_NAME } from "./agentic-executor";

// ── Production-exact fixture — byte-exact "SAM Notice Body" region from paid run 56ef9717 (2026-07-15). ──
const FIXTURE_PATH = "src/lib/__fixtures__/seq1-FA303026Q0020-noticebody.56ef9717.txt";
const EXPECTED_SHA256 = "00e7655c43101e4bbd2f383b4a46e244097e3816bf44b807407cf8c4ab38f40d";
const REAL_NOTICE_BODY = readFileSync(FIXTURE_PATH, "utf8");
const actualSha = createHash("sha256").update(REAL_NOTICE_BODY, "utf8").digest("hex");

const DECLARED_SET_ASIDE = "Women-Owned Small Business";   // the record's structured `set_aside` metadata (R3)
const mk = (t: string) => `\n\n==== DOCUMENT: Primary ====\n\nSF1449 solicitation.\n\n==== DOCUMENT: ${NOTICE_BODY_DOC_NAME} ====\n\n${t}`;
const SRC = mk(REAL_NOTICE_BODY);

// Realistic findings — the run completed 4/4 docs read but NONE grounded on the bar sentences (why the floor fired).
const REALISTIC_FINDINGS: any[] = [
  { requirement: "Award is LPTA — lowest priced technically acceptable.", citation: NOTICE_BODY_DOC_NAME,
    excerpt: "lowest priced technically acceptable", kind: "evaluation",
    controllability: "bidder_controls", curableInWindow: true, grounded: true, lens: "test_fixture" },
];

let fail = 0;
const check = (label: string, got: boolean, want: boolean) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}: floorEscalates=${got} (want ${want})`);
};
const run = (findings: any[]) => noticeBodyEligibilityUngrounded(SRC, findings, null, DECLARED_SET_ASIDE);

// ── FIXTURE IDENTITY (R2) — the fixture must be byte-exact from run 56ef9717. ──
console.log(`── fixture identity (byte-exact from run 56ef9717) ──`);
console.log(`  ${actualSha === EXPECTED_SHA256 ? "✅" : "❌"} sha256 ${actualSha === EXPECTED_SHA256 ? "matches" : "MISMATCH — fixture drifted!\n    got  " + actualSha + "\n    want " + EXPECTED_SHA256}`);
if (actualSha !== EXPECTED_SHA256) fail++;
console.log(`  notice-body bytes: ${Buffer.byteLength(REAL_NOTICE_BODY, "utf8")}`);

// ── STATE 1: both flags OFF — reproduces the ORIGINAL false-punt (floor fires → NHR). ──
console.log("── flags OFF (pre-#509 baseline) — floor SHOULD fire (reproduces the false-punt) ──");
delete process.env.AUDIT_SIZE_STANDARD_SELF_CERT;
delete process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS;
check("empty-findings", run([]), true);
check("realistic-findings", run(REALISTIC_FINDINGS), true);

// ── STATE 2: §509 size-standard flag ONLY (prior prod) — STILL fires on the WOSB/SAM layers. ──
console.log("── AUDIT_SIZE_STANDARD_SELF_CERT only — floor STILL fires (WOSB/SAM residual layers) ──");
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
delete process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS;
check("size-only-still-nhr", run(REALISTIC_FINDINGS), true);

// ── STATE 3: #516/#518 CLASS flag ON — the fix. Every bar (incl. the URL-tailed SAM sentence) demotes → committal. ──
console.log("── AUDIT_SELF_DETERMINABLE_ELIG_CLASS ON (#516/#518 fix) — floor SILENT → committal ──");
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
check("class-empty-findings", run([]), false);
check("class-realistic-findings", run(REALISTIC_FINDINGS), false);

// ── CAVEAT ENUMERATION (the projected committal's self-cert caveats). ──
console.log("── projected committal caveats (flags ON) ──");
const caveats = emitSelfDeterminableCaveats(SRC, [], null, DECLARED_SET_ASIDE);
for (const c of caveats) console.log(`  • [${c.controllability}] ${c.requirement.slice(0, 110)}…`);
if (caveats.length < 3) { console.log("  ❌ expected ≥3 self-cert caveats"); fail++; }

console.log(`\n${fail === 0 ? "✅ ALL GREEN — R5 projection DRY (fix proven on the BYTE-EXACT run-56ef9717 notice body)" : `❌ ${fail} FAILURE(S) — NOT DRY`}`);
process.exit(fail === 0 ? 0 : 1);
