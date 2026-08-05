// PROBE for src/lib/audit-noop-rep-bar-signal-parity.test.ts. Not a gate — it asserts nothing.
//
// The five NOOP_REP_FAMILY member flags are MODULE-LOAD consts, so the production configuration (all five
// armed) is only reachable in a process whose env was set before import. The suite spawns this once; the
// parity flag itself is read at CALL time, so both of its states are toggled here in-process and reported
// together. One subprocess, both cells, no re-import games.
import { importanceOf, hasBarSignal } from "../../src/lib/audit-gate-v2";

/** Sentences that reach the NOOP-REP release AND carry a bar only hasBarSignal() can see. */
const ASYMMETRIC: Array<[string, string]> = [
  ["precedence + airworthiness certificate",
   "In the event of any conflict between the offeror's airworthiness certificate and this order, the order of precedence in FAR 52.215-8 shall govern."],
  ["precedence + DD Form 254",
   "Where a discrepancy exists between DD Form 254 and this document, the order of precedence shall control."],
  ["protest + authorized distributor for a named OEM",
   "Any protest shall be served on the Contracting Officer, and the offeror shall maintain its status as an authorized distributor for Caterpillar at all times."],
  ["debrief + Part 145 repair station certificate",
   "Offerors desiring a debriefing under FAR 15.506 should note the Part 145 repair station certificate referenced herein."],
];

/** Genuinely benign NOOP-REP sentences — the release these members exist to grant. If the fix breaks these it
 *  is over-firing, which is the whole risk of adding escalation. */
const BENIGN: Array<[string, string]> = [
  ["plain protest procedure", "The copy of any protest shall be served on the Contracting Officer within the period prescribed."],
  ["plain debriefing right", "Offerors desiring a debriefing may make a request in accordance with FAR 15.506."],
  ["plain order of precedence", "This ITO shall take precedence should there be any conflict between the Basic Ordering Agreement and this ITO."],
];

const cell = (cases: Array<[string, string]>) =>
  cases.map(([label, ob]) => ({ label, importance: importanceOf(ob), bar: hasBarSignal(ob) }));

function snapshot() {
  return { asymmetric: cell(ASYMMETRIC), benign: cell(BENIGN) };
}

delete process.env.AUDIT_NOOP_REP_BAR_SIGNAL_PARITY;
const off = snapshot();
process.env.AUDIT_NOOP_REP_BAR_SIGNAL_PARITY = "true";
const on = snapshot();
// The one direction the fix LOOSENS: hasBarSignal carries the #587b bond-paper carve-out, so a paper-stock
// false hit that the raw regex refused is released under the flag. Reported so the suite can assert it
// deliberately rather than discover it as a surprise.
const BOND_PAPER = "Any protest shall be served on the Contracting Officer; quotations shall be submitted on SF-1444 or bond paper.";
process.env.AUDIT_NOOP_REP_BAR_SIGNAL_PARITY = "";
const bondOff = importanceOf(BOND_PAPER);
process.env.AUDIT_NOOP_REP_BAR_SIGNAL_PARITY = "true";
const bondOn = importanceOf(BOND_PAPER);

console.log(JSON.stringify({ off, on, bondPaper: { off: bondOff, on: bondOn } }));
