// B4 (Brain ruling on cards #690/#691) — the banner must not characterize an UNRANKED sentence as a bar.
// Flag `AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM`, default-OFF. CAP-INVARIANT · REASON-VARIANT · VERDICT-INERT.
// The defect it closes: `disqualifierUncovered` is document-ordered and unranked, so `[0]` is merely the first
// ungrounded obligation — yet the banner asserted it was "a potential disqualifying requirement". At protest
// standard that mischaracterization is worse than naming no bar: the bidder relies on it and is misdirected.
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { gateV2Outcome, type CoverageV2 } from "./audit-gate-v2";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM;
  process.env.AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM = on ? "true" : "false";
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM; else process.env.AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM = prev; }
};
const cov = (over: Partial<CoverageV2>): CoverageV2 => ({ unreadable: [], ungroundedRead: [], disqualifierUncovered: [], coverageGrade: 1, ...over });

// The measured `be69ce16` shape: a DEBRIEFING sentence first in document order, a real BID GUARANTEE behind it.
const DEBRIEF = { section: "L", obligation: "The offeror may request a debriefing in accordance with FAR 15.506." };
const BOND = { section: "L", obligation: "The offeror shall furnish a bid guarantee in the amount of 20 percent of the bid price." };

// ── 1. THE MISCHARACTERIZATION — flag-OFF asserts a bar; flag-ON does not ───────────────────────────────────
{
  const c = cov({ disqualifierUncovered: [DEBRIEF, BOND] });
  const off = withFlag(false, () => gateV2Outcome(c));
  const on = withFlag(true, () => gateV2Outcome(c));
  assert(/potential disqualifying requirement/i.test(off.reason), "flag-OFF reproduces the defect: an unranked sentence is called a potential disqualifying requirement");
  assert(!/disqualif/i.test(on.reason), `flag-ON: the banner makes NO disqualifier claim about an unranked sentence (got: ${on.reason.slice(0, 80)})`);
  assert(/could not be grounded/i.test(on.reason), "flag-ON: still states the true fact — the obligation could not be grounded");
}

// ── 2. CAP-INVARIANT — this is prose only; the verdict cap is untouched ─────────────────────────────────────
for (const c of [
  cov({ disqualifierUncovered: [DEBRIEF] }),
  cov({ disqualifierUncovered: [DEBRIEF, BOND] }),
  cov({ unreadable: ["C"], disqualifierUncovered: [DEBRIEF] }),
  cov({}),
  cov({ ungroundedRead: ["L"], coverageGrade: 0.8 }),
]) {
  const off = withFlag(false, () => gateV2Outcome(c));
  const on = withFlag(true, () => gateV2Outcome(c));
  assert(off.cap === on.cap, `CAP-INVARIANT across the flag (off=${off.cap} on=${on.cap})`);
}

// ── 3. HONESTY — the customer is told how many are ungrounded and that this one is FIRST, not WORST ─────────
{
  const on = withFlag(true, () => gateV2Outcome(cov({ disqualifierUncovered: [DEBRIEF, BOND] })));
  assert(/2 obligations/.test(on.reason), "flag-ON: names the COUNT of ungrounded obligations");
  assert(/first in document order, not necessarily the most significant/.test(on.reason),
    "flag-ON: states plainly that the excerpt is first in document order, not the most significant");
  assert(on.reason.includes(DEBRIEF.obligation.slice(0, 40)), "flag-ON: still quotes the excerpt verbatim (no fabrication either way)");
}
{ // single-obligation case must NOT claim a misleading plural or a ranking that does not exist
  const on = withFlag(true, () => gateV2Outcome(cov({ disqualifierUncovered: [BOND] })));
  assert(!/obligations in this package/.test(on.reason), "flag-ON: a single ungrounded obligation gets no plural/ordering qualifier");
  assert(!/disqualif/i.test(on.reason), "flag-ON: single case still makes no disqualifier claim");
}

// ── 4. FLAG-OFF BYTE-IDENTITY — every reason string unchanged when the flag is off ──────────────────────────
{
  const cases = [cov({}), cov({ unreadable: ["C"] }), cov({ disqualifierUncovered: [DEBRIEF] }), cov({ ungroundedRead: ["L"], coverageGrade: 0.7 })];
  const a = cases.map((c) => withFlag(false, () => JSON.stringify(gateV2Outcome(c))));
  const b = cases.map((c) => withFlag(false, () => JSON.stringify(gateV2Outcome(c))));
  assert(JSON.stringify(a) === JSON.stringify(b), "flag-OFF deterministic and unchanged");
  const moved = cases.some((c) => withFlag(true, () => gateV2Outcome(c)).reason !== withFlag(false, () => gateV2Outcome(c)).reason);
  assert(moved, "flag-ON changes at least one reason — the fix is real, not a no-op");
}

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS — B4 banner: no bar claim on an unranked sentence");
if (failures) process.exit(1);
