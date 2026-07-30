// CODE-REVIEW ULTRA · SCOPE B2+B3 — adversarial probes against the temporal + incomplete-precedence claims.
// Run: npx tsx scripts/audit-ai/_ultra-b2-temporal.ts
// READ-ONLY of src/**. Flags set per-probe and logged. Dynamic import so load-time consts (AUDIT_GATE_V2) see env.
export {}; // force MODULE scope (env before dynamic import — feedback_tsx_dynamic_import_test_module_scope)

process.env.AUDIT_GATE_V2 = "true"; // load-time const — needed for coverage-pole collision probes

let failures = 0;
let n = 0;
const probe = (name: string, actual: string, expected: string, spec: string) => {
  n++;
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} [P${n}] ${name}\n      actual=${actual} expected=${expected} · ${spec}`);
  return ok;
};
const note = (name: string, actual: string, comment: string) => {
  n++;
  console.log(`NOTE [P${n}] ${name}\n      actual=${actual} · ${comment}`);
};

let unhandled = 0;
process.on("unhandledRejection", () => { unhandled++; });

async function main() {
  const { deriveTemporalDisposition, classifyTemporal, parseSolicitationDate, daysBetween } = await import("../../src/lib/audit-temporal");
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  const { fetchLiveSamStatus, parseSamActive } = await import("../../src/lib/sam");
  type TypedFinding = import("../../src/lib/audit-findings").TypedFinding;
  type VerdictInputs = import("../../src/lib/audit-findings").VerdictInputs;
  type LiveSamStatus = import("../../src/lib/audit-temporal").LiveSamStatus;

  const TODAY = "2026-07-22";
  const snapPast = classifyTemporal([{ date: "2026-07-15", label: "RESPONSE DATE" }], TODAY);

  console.log("\n════ B2.1 — attack every path to kind:CLOSED (pure disposition; flags: n/a — pure fn) ════");

  // ── A. TIMEZONE OFF-BY-ONE: executor:580 computes today as the UTC date; SAM responseDeadLine carries the
  //    agency-local offset. A deadline later TONIGHT (agency time) whose local date is "yesterday" in UTC terms
  //    reads dd=-1 → CLOSED while the clock has not run out.
  {
    // Real instant simulated: 2026-07-22T01:00:00Z = Jul 21, 9:00 PM EDT. Deadline Jul 21 10:00 PM EDT
    // (= 2026-07-22T02:00:00Z) is ONE HOUR IN THE FUTURE. Executor UTC-today = "2026-07-22".
    const utcToday = "2026-07-22";
    const liveDeadline = "2026-07-21T22:00:00-04:00"; // 10 PM EDT — still open at the simulated instant
    const d = deriveTemporalDisposition(snapPast, { fetched: true, active: true, responseDeadline: liveDeadline }, true, utcToday);
    const deadlineInstant = Date.parse(liveDeadline);
    const simulatedNow = Date.parse("2026-07-22T01:00:00Z");
    console.log(`      (deadline instant ${new Date(deadlineInstant).toISOString()} > simulated now ${new Date(simulatedNow).toISOString()} = ${deadlineInstant > simulatedNow} — solicitation is OPEN)`);
    probe("TZ off-by-one: 10PM-EDT deadline tonight + UTC today ⇒ must NOT be CLOSED (spec: datetime+tz, same-day → OPEN)",
      d.kind, "OPEN", "spec v2: 'CONFIDENT past-deadline = parse-confidence AND currency-confidence (datetime+tz; same-day/time-unknown → OPEN)'");
  }
  {
    // Hawaii: NAVFAC Pacific, deadline Jul 21 3:00 PM HST (= 2026-07-22T01:00:00Z). Audit fired at
    // 2026-07-22T00:30:00Z = Jul 21 2:30 PM HST — 30 minutes BEFORE close. UTC-today = "2026-07-22".
    const d = deriveTemporalDisposition(snapPast, { fetched: true, active: true, responseDeadline: "2026-07-21T15:00:00-10:00" }, true, "2026-07-22");
    probe("TZ off-by-one (HST): 3PM-HST deadline, audited 2:30PM HST same day ⇒ must NOT be CLOSED",
      d.kind, "OPEN", "same-day in the deadline's own timezone; only the UTC date rolled");
  }
  {
    // SUPERSEDED BY BRAIN RULING 4 (F1 fix, 2026-07-22). This probe originally asserted CLOSED from a DATE-ONLY
    // deadline — which is precisely the date-vs-date comparison the ruling forbids ("compare instants, never dates";
    // `today` is a UTC date, so a date compare arms the tz off-by-one FALSE-CLOSED). A date-only string carries no
    // knowable instant, so the correct disposition is now OPEN (conservative). Expectation updated; the ORIGINAL
    // finding this probe supported (F1: the live-deadline branch was dead on real SAM data) is FIXED and banked in
    // `audit-decide-temporal.test.ts` using REAL SAM-format datetimes per the fixture doctrine.
    const d = deriveTemporalDisposition(snapPast, { fetched: true, active: true, responseDeadline: "2026-07-15" }, true, TODAY);
    probe("control: date-only live deadline ⇒ OPEN (RULING 4: no instant ⇒ never CLOSED)", d.kind, "OPEN", "date-only carries no instant; superseded expectation");
    // Replacement control in the REAL SAM form — this is the closure that must actually fire.
    const dSam = deriveTemporalDisposition(snapPast, { fetched: true, active: true, responseDeadline: "2026-07-15T10:00:00-04:00" }, true, TODAY, "2026-07-22T12:00:00Z");
    probe("control: live deadline 7d past (REAL SAM datetime) ⇒ CLOSED", dSam.kind, "CLOSED", "F1 fixed — the branch that was dead in production");
  }
  {
    // Control: same-day date-only → OPEN (the banked datetime-granularity guard).
    const d = deriveTemporalDisposition(snapPast, { fetched: true, active: true, responseDeadline: "2026-07-22" }, true, TODAY);
    probe("control: same-day live deadline ⇒ OPEN", d.kind, "OPEN", "banked guard holds");
  }

  // ── B. ARCHIVED branch: active=false is taken as sufficient WITHOUT corroboration.
  {
    const d = deriveTemporalDisposition(snapPast, { fetched: true, active: false, responseDeadline: "2026-08-15" }, true, TODAY);
    note("archived-but-FUTURE-live-deadline (early archive / cancellation): active=false + live deadline 24d in the FUTURE",
      d.kind, "CLOSED wins on active=false alone. Cancelled sol → CLOSED correct; early-archive data error → false-CLOSED. Contradiction (archived + future deadline) is not routed to INDETERMINATE.");
  }
  {
    // parseSamActive tristate — unrecognized string must be null (→ INDETERMINATE), never false.
    const weird = parseSamActive("Archived (superseded)");
    probe("parseSamActive('Archived (superseded)') ⇒ null (unknown), never a confident closed",
      String(weird), "null", "sam.ts:14-22 — unrecognized → null");
    const d = deriveTemporalDisposition(snapPast, { fetched: true, active: null, responseDeadline: null }, true, TODAY);
    probe("active=null + no deadline ⇒ INDETERMINATE", d.kind, "INDETERMINATE", "branch (5)");
  }

  // ── C. ACTIVE + absent/unparseable live deadline → OPEN (permits committal) while the snapshot said PAST.
  {
    const d = deriveTemporalDisposition(snapPast, { fetched: true, active: true, responseDeadline: null }, true, TODAY);
    note("active=true + live deadline ABSENT + snapshot says PAST + zero amendments",
      d.kind, "OPEN → committal allowed. With zero amendments the snapshot deadline is the only deadline the family ever had and it is past; live active=true only proves 'not yet archived' (archive lags deadline). The snapshot contradiction is never consulted — a missed-real-closure (false-BID-enabling) seam.");
    const d2 = deriveTemporalDisposition(snapPast, { fetched: true, active: true, responseDeadline: "TBD — see amendment" }, true, TODAY);
    note("active=true + UNPARSEABLE live deadline + snapshot PAST", d2.kind, "same seam via unparseable string");
  }

  // ── D. Date-parser adversarial strings (leak paths into the CLOSED comparison).
  {
    probe("parse '1.2.3' (version-ish string) does not mint a past date driving CLOSED via live.responseDeadline",
      String(parseSolicitationDate("1.2.3")), String(parseSolicitationDate("1.2.3")), // report-only: show what it yields
      `yields ${parseSolicitationDate("1.2.3")} — contained: only SAM's own responseDeadLine feeds the live comparison`);
    probe("parse 'Feb 30' overflow rejected", String(parseSolicitationDate("2026-02-30")), "null", "round-trip guard");
    probe("daysBetween exact-day arithmetic (UTC midnights, DST-free)", String(daysBetween("2026-03-08", "2026-03-09")), "1", "no DST wobble");
  }

  // ── E. ingestedAmendmentComplete=false fails conservative on the CLOSED paths (banked, re-proven).
  {
    const d = deriveTemporalDisposition(snapPast, { fetched: true, active: false }, false, TODAY);
    probe("archived + amendment-set incomplete ⇒ INDETERMINATE (never CLOSED)", d.kind, "INDETERMINATE", "branch (2) precedes branch (3)");
    const d2 = deriveTemporalDisposition(snapPast, { fetched: true, active: true, responseDeadline: "2026-07-01", amendmentCount: 3 }, false, TODAY);
    probe("live-past-deadline + amendments advertised but not reconciled ⇒ INDETERMINATE", d2.kind, "INDETERMINATE", "the missing doc may BE the extension");
  }
  {
    // sam.ts amendmentCount math edge: versionCount=0 (ALL versions deleted/cancelled) → Math.max(0, -1) = 0 →
    // executor formula can mark ingestedAmendmentComplete=true. Replicates sam.ts:221.
    const versionCount = 0;
    const amendmentCount = versionCount === null ? null : Math.max(0, versionCount - 1);
    note("amendmentCount math @ versionCount=0 (all versions deleted/cancelled)", String(amendmentCount),
      "0 ⇒ 'zero amendments' ⇒ ingestedAmendmentComplete can be true on a fully-deleted notice → active=false → CLOSED. For a cancelled sol NO_BID is right; reason text says 'archived', not 'cancelled'.");
  }

  console.log("\n════ B2.2 — 12s live-SAM budget cannot stall / crash (executable shape probes) ════");

  // fetchLiveSamStatus with no SAM_API_KEY → immediate fail-safe (no network, no throw).
  {
    const saved = process.env.SAM_API_KEY;
    delete process.env.SAM_API_KEY;
    // NOTE: sam.ts captures SAM_API_KEY at module load. If it was set at load, this tests the loaded value;
    // in this probe env it is unset from the start (no .env injection) → immediate {fetched:false}.
    const r = await fetchLiveSamStatus("0123456789abcdef0123456789abcdef", null);
    probe("fetchLiveSamStatus without SAM_API_KEY ⇒ {fetched:false} immediately, no throw",
      JSON.stringify({ fetched: r.fetched, active: r.active }), JSON.stringify({ fetched: false, active: null }), "sam.ts:201");
    if (saved !== undefined) process.env.SAM_API_KEY = saved;
  }

  // Replicate the exact executor race shape (executor-v3:174-180) against a HUNG fetch and a REJECTING fetch.
  {
    const budget = 250; // scaled stand-in for the 12_000ms budget — semantics identical
    const race = (p: Promise<LiveSamStatus | null>) =>
      Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), budget))]).catch(() => null);

    const hung = new Promise<LiveSamStatus>(() => { /* never settles */ });
    const t0 = Date.now();
    const r1 = await race(hung);
    const took = Date.now() - t0;
    probe(`race vs HUNG socket ⇒ null within budget (took ${took}ms)`, JSON.stringify(r1) + ":" + String(took < budget + 200), "null:true", "timeout fires; wait bounded");

    const rejecting = Promise.reject(new Error("boom")) as Promise<LiveSamStatus>;
    const r2 = await race(rejecting);
    probe("race vs REJECTING fetch ⇒ null (caught), no crash", JSON.stringify(r2), "null", ".catch(()=>null) attached at construction");

    // late rejection AFTER the timeout already won — must not become an unhandledRejection
    const lateReject = new Promise<LiveSamStatus>((_res, rej) => setTimeout(() => rej(new Error("late boom")), budget + 100));
    const r3 = await race(lateReject);
    await new Promise((r) => setTimeout(r, budget + 300)); // let the late rejection fire
    probe("race vs LATE-rejecting fetch ⇒ null now, and the late rejection is still handled (race holds refs)",
      JSON.stringify(r3) + ":unhandled=" + unhandled, "null:unhandled=0", "Promise.race subscribes to all inputs — no orphan rejection");
  }

  // The REAL function under a fetch that always rejects: must resolve {fetched:false}, never reject.
  {
    const savedKey = process.env.SAM_API_KEY;
    process.env.SAM_API_KEY = process.env.SAM_API_KEY || ""; // key is load-time captured; if absent this path short-circuits — still a no-throw proof
    const savedFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    let threw = false;
    let r: { fetched: boolean } | null = null;
    try { r = await fetchLiveSamStatus("0123456789abcdef0123456789abcdef", "FA000000X0000"); } catch { threw = true; }
    globalThis.fetch = savedFetch;
    if (savedKey !== undefined) process.env.SAM_API_KEY = savedKey; else delete process.env.SAM_API_KEY;
    probe("fetchLiveSamStatus with fetch=REJECT-ALL ⇒ resolves {fetched:false}, never rejects",
      `threw=${threw},fetched=${r ? r.fetched : "n/a"}`, "threw=false,fetched=false", "all inner fetches try/caught (sam.ts tryQuery, sam-history fetchHal)");
  }

  console.log("\n════ B2.3 — INDETERMINATE caps ONLY committal exits (flags: AUDIT_TEMPORAL_VERDICT=true) ════");
  process.env.AUDIT_TEMPORAL_VERDICT = "true";

  const cleanish = (): TypedFinding => ({
    requirement: "Offeror shall submit a technical approach addressing all PWS tasks.",
    citation: "§ L.3", excerpt: "The offeror shall submit a technical approach addressing all PWS tasks.",
    kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "proposal_manager",
    curableInWindow: true,
  });
  const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
  const indeterminateLive: LiveSamStatus = { fetched: false, active: null };
  const withT = (over: Partial<VerdictInputs>, live: LiveSamStatus | null = indeterminateLive, amend = true): VerdictInputs =>
    ({ findings: [cleanish()], ...base, temporalSnapshot: snapPast, liveSam: live, ingestedAmendmentComplete: amend, today: TODAY, ...over });

  {
    const d = deriveVerdict(withT({}));
    probe("INDETERMINATE + clean committal ⇒ INCOMPLETE (the designed cap)", d.verdict, "INCOMPLETE", "decide:3594");
  }
  {
    const d = deriveVerdict(withT({ verifierSound: false }));
    probe("INDETERMINATE must NOT mask honest-fail: verifierSound=false ⇒ NHR stands", d.verdict, "NEEDS_HUMAN_REVIEW", "step 2 precedes the cap");
  }
  {
    const d = deriveVerdict(withT({ setAsideConflict: { sam: "WOSB", doc: "8(a)", note: "SAM and the document name different programs." } }));
    probe("INDETERMINATE must NOT mask set-aside conflict ⇒ NHR stands", d.verdict, "NEEDS_HUMAN_REVIEW", "1d precedes the cap");
  }
  {
    const bar: TypedFinding = {
      requirement: "Offeror must hold an active Secret facility clearance at time of award.",
      citation: "§ H.4", excerpt: "The offeror must hold an active Secret facility clearance at time of award.",
      kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "contracts",
      curableInWindow: false, requiredAttribute: "clearance:facility-secret",
    };
    const d = deriveVerdict(withT({ findings: [cleanish(), bar] }));
    probe("INDETERMINATE must NOT mask a real non-curable bar ⇒ NHR (hold-it-or-walk) stands", d.verdict, "NEEDS_HUMAN_REVIEW", "5b precedes the cap");
  }
  {
    const d = deriveVerdict(withT({ conflict: true }));
    probe("INDETERMINATE must NOT mask unresolved expert conflict ⇒ NHR stands", d.verdict, "NEEDS_HUMAN_REVIEW", "step 4 precedes the cap");
  }
  {
    // INDETERMINATE cannot upgrade: a would-be BWC (curable residual) → INCOMPLETE, never BID.
    const residual: TypedFinding = { ...cleanish(), kind: "eligibility_bar", requirement: "Confirm SAM registration active at offer.", requiredAttribute: "registration:sam", curableInWindow: true, controllability: "bidder_controls" };
    const d = deriveVerdict(withT({ findings: [cleanish(), residual] }));
    note("INDETERMINATE + would-be committal-with-residual", d.verdict, "capped to INCOMPLETE (never upgraded, never NHR-manufactured)");
  }

  console.log("\n════ B3 — documentsComplete=false precedence + CLOSED dominance (flags: +AUDIT_INCOMPLETE_PRECEDENCE=true, AUDIT_GATE_V2=true) ════");
  process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
  const covNHR = { unreadable: [], ungroundedRead: [], disqualifierUncovered: [{ section: "L", obligation: "Offeror must hold an active facility clearance at time of award." }], coverageGrade: 0.9 };

  {
    const d = deriveVerdict(withT({ documentsComplete: false, coverageV2: covNHR }, null));
    probe("docsComplete=false + coverage-pole NHR + temporal-null-live ⇒ INCOMPLETE (hoist wins over coverage NHR)",
      d.verdict, "INCOMPLETE", "1-PRE (decide:3341) precedes gateV2 NHR (3350)");
  }
  {
    const d = deriveVerdict(withT({ documentsComplete: false, noticeBodyBarUngrounded: true }, null));
    probe("docsComplete=false + noticeBodyBarUngrounded ⇒ INCOMPLETE (hoist wins over notice-body NHR)",
      d.verdict, "INCOMPLETE", "1-PRE precedes 1a-notice (3368)");
  }
  {
    // temporal CLOSED vs documentsComplete=false — CLOSED dominates (spec move 6: can't bid a closed RFQ).
    const d = deriveVerdict(withT({ documentsComplete: false, coverageV2: covNHR }, { fetched: true, active: false, responseDeadline: "2026-07-15" }));
    probe("CLOSED dominates INCOMPLETE: docsComplete=false + live-archived + zero-amendments ⇒ NO_BID(temporalClosed)",
      `${d.verdict}:${String(d.temporalClosed === true)}`, "NO_BID:true", "spec-sanctioned: 'a CLOSED solicitation is NO_BID regardless of read-completeness'; safe because CLOSED preconditions zero advertised amendments");
  }
  {
    // primaryIndeterminate precedes the hoist — NHR over documentsComplete=false. Identity failure, not coverage-pole.
    const d = deriveVerdict(withT({ documentsComplete: false, primaryIndeterminate: true }, null));
    note("primaryIndeterminate + docsComplete=false", d.verdict, "NHR before the hoist — identity failure (cannot name the base sol), not a coverage-pole NHR; outside the #664 class");
  }
  {
    // Comment-vs-code check (decide:3338 claims 1-PRE 'stays BELOW the show-stopper block'): a package with a
    // PROVEN universal-defect-class finding + docsComplete=false. Both 1b legacy and 1-PRE return INCOMPLETE
    // BEFORE step 3 is evaluated — consistent with v2 ('unread amendment caps read-bars to INCOMPLETE'),
    // inconsistent with the comment's wording.
    const bar: TypedFinding = {
      requirement: "Delivery required 10 days before the solicitation issue date.",
      citation: "§ F.2", excerpt: "Delivery required 10 days before the solicitation issue date.",
      kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "contracts", curableInWindow: false,
      requiredAttribute: "impossible:date",
    };
    const d = deriveVerdict(withT({ documentsComplete: false, findings: [bar] }, null));
    note("docsComplete=false + a disqualifying-class finding present", d.verdict,
      "returns before step 3 — the 3338 comment ('stays BELOW the show-stopper block') misdescribes the order; behavior itself is v2-conservative");
  }
  {
    // Flag-OFF regression: hoist inert, 1b still below the NHR poles (the preserved #664 defect, by design).
    delete process.env.AUDIT_INCOMPLETE_PRECEDENCE;
    const d = deriveVerdict(withT({ documentsComplete: false, coverageV2: covNHR }, null, true));
    probe("flag-OFF: docsComplete=false + coverage NHR ⇒ NHR (byte-identical legacy)", d.verdict, "NEEDS_HUMAN_REVIEW", "sanctioned flag-OFF state");
    process.env.AUDIT_INCOMPLETE_PRECEDENCE = "true";
  }

  console.log("\n════ upload-path exemption (executor gate isSamSol) — reasoning probe ════");
  {
    // deriveVerdict with NO temporal inputs at all (what the executor threads for an UPLOAD, flag ON):
    const d = deriveVerdict({ findings: [cleanish()], ...base });
    note("upload path (no temporal bundle threaded, flag ON)", d.verdict,
      "committal with ZERO currency check — executor:175 gates the live fetch on isSamSol; an uploaded years-stale RFQ can draw BID with the temporal layer silently absent (never INDETERMINATE). Design gap, not a code bug.");
  }

  delete process.env.AUDIT_TEMPORAL_VERDICT;
  delete process.env.AUDIT_INCOMPLETE_PRECEDENCE;
  console.log(`\n${failures === 0 ? "ALL ASSERTED PROBES PASS" : `${failures} PROBE FAILURE(S)`} · unhandledRejections=${unhandled}`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error("PROBE HARNESS ERROR:", e); process.exit(2); });
