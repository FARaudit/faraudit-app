// STANDING CERT-10 "floor-on-real-noticedesc" PROJECTION (Brain card #516 R5). Run:
//   npx tsx src/lib/audit-orchestrator-cert10-floor-projection.test.ts
//
// WHY THIS EXISTS — the #516 projection-gap finding: the seq-1 FA303026Q0020 paid runs kept false-NHR'ing because the
// $0 pre-fire only ever tested the demotion predicate on ISOLATED sentence probes (`isBareSizeStandardSentence("$13M")`)
// — it proved the fix's MECHANISM, never its EFFECT on the REAL notice body. A sentence probe cannot reveal the NEXT
// benign layer (size std → WOSB set-aside → SAM registration → generic-eligible fragment) that the floor will trip on.
// The faithful check is the ACTUAL floor (`noticeBodyEligibilityUngrounded`) run over the WHOLE fetched notice body with
// realistic findings. This test banks that check as a standing regression so a class fix is proven on the real notice
// BEFORE any paid re-run, and stays proven on every future touch of the eligibility family.
//
// FIDELITY — the four BAR sentences below are PRODUCTION-VERBATIM (card #516 residual-sentence ledger + the live
// `bid_recommendation` string on run 7bf73cbd: "type of set-aside: this acquisition is a 100% women owned small
// business set-aside."). The floor's `.!?` splitter breaks "…registration in SAM.gov…" at the period in "SAM.gov" into
// a SAM-registration fragment + a bare "gov to be eligible…" fragment — exactly the two layers the ledger lists. The
// connective synopsis prose is representative AF-RFQ boilerplate that carries NO additional ELIGIBILITY_BAR_RE match
// (asserted below) — so the floor acts on precisely the four production bars, nothing more.
import { noticeBodyEligibilityUngrounded } from "./audit-orchestrator";
import { NOTICE_BODY_DOC_NAME } from "./agentic-executor";

// The reconstructed real seq-1 SAM notice body (bar sentences = production-verbatim; prose = representative).
const REAL_NOTICE_BODY = [
  "COMBINED SYNOPSIS/SOLICITATION",
  "The 17th Contracting Squadron at Goodfellow AFB, TX intends to award a single firm-fixed-price contract for Catholic Music Director services (NAICS 813110).",
  "This is a Request for Quote (RFQ); the Government will award to the Lowest Priced Technically Acceptable quote.",
  "TYPE OF SET-ASIDE: This acquisition is a 100% Women Owned Small Business set-aside.",
  "The small business size standard is no greater than $13 million.",
  "REGISTRATIONS: Offerors shall have and shall maintain an active registration in SAM.gov to be eligible for a Government contract award.",
  "Quotes are due no later than 30 Jul 2026 at 12:00 PM CDT and shall be submitted by email to the Contracting Officer.",
  "All questions shall be submitted in writing no later than 10 Jul 2026.",
].join(" ");

const DECLARED_SET_ASIDE = "Women-Owned Small Business";   // the record's structured `set_aside` metadata (R3)
const mk = (t: string) => `\n\n==== DOCUMENT: Primary ====\n\nSF1449 solicitation.\n\n==== DOCUMENT: ${NOTICE_BODY_DOC_NAME} ====\n\n${t}`;
const SRC = mk(REAL_NOTICE_BODY);

// Realistic findings — the run completed with 4/4 docs read and decision-bearing findings, but NONE grounded on the
// four bar sentences (that is the whole reason the floor fired). Model that: one benign LPTA finding grounded on the
// award-basis sentence, which does NOT overlap any bar span.
const REALISTIC_FINDINGS: any[] = [
  { requirement: "Award is LPTA — lowest priced technically acceptable.", citation: NOTICE_BODY_DOC_NAME,
    excerpt: "the Government will award to the Lowest Priced Technically Acceptable quote", kind: "evaluation",
    controllability: "bidder_controls", curableInWindow: true, grounded: true, lens: "test_fixture" },
];

let fail = 0;
const check = (label: string, got: boolean, want: boolean) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}: floorEscalates=${got} (want ${want})`);
};
const run = (findings: any[]) => noticeBodyEligibilityUngrounded(SRC, findings, null, DECLARED_SET_ASIDE);

// ── STATE 1: both flags OFF — reproduces the ORIGINAL seq-1 false-punt (floor fires → NHR). ──
console.log("── flags OFF (pre-#509 baseline) — floor SHOULD fire (reproduces the false-punt) ──");
delete process.env.AUDIT_SIZE_STANDARD_SELF_CERT;
delete process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS;
check("empty-findings", run([]), true);
check("realistic-findings", run(REALISTIC_FINDINGS), true);

// ── STATE 2: §509 size-standard flag ONLY (current prod) — STILL fires on the WOSB/SAM layers (the 7bf73cbd cycle). ──
console.log("── AUDIT_SIZE_STANDARD_SELF_CERT only (current prod) — floor STILL fires (WOSB/SAM residual layers) ──");
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
delete process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS;
check("size-only-still-nhr", run(REALISTIC_FINDINGS), true);

// ── STATE 3: #516 CLASS flag ON — the fix. Every bar is bidder-self-determinable → floor stays SILENT → committal. ──
console.log("── AUDIT_SELF_DETERMINABLE_ELIG_CLASS ON (#516 fix) — floor SILENT → committal ──");
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
check("class-empty-findings", run([]), false);
check("class-realistic-findings", run(REALISTIC_FINDINGS), false);

console.log(`\n${fail === 0 ? "✅ ALL GREEN — R5 projection DRY (fix proven on the REAL notice body)" : `❌ ${fail} FAILURE(S) — NOT DRY`}`);
process.exit(fail === 0 ? 0 : 1);
