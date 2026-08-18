// $0 regression lock for PANEL TELEMETRY (plan step 1).
// Run: npx tsx src/lib/audit-panel-telemetry.test.ts
//
// WHAT THIS PROTECTS. The whole point is that "the gate suppressed the panel" and "the panel ran and
// produced nothing" must never again be indistinguishable. So the assertions that matter are the ones
// that would FAIL if the two states collapsed into each other, or if a field quietly stopped being
// populated. A suite that only checked the happy path would pass while the record went blind again.
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { buildPanelTelemetry, panelTelemetryLine } = await import("./audit-panel-telemetry");

  // ---- 1. SUPPRESSED: the gate stopped it. No calls, no cost. -----------------------------------------
  const suppressed = buildPanelTelemetry({
    fired: false, manifest: { ok: false, missing: ["submission instructions"] },
    panelists: [], verifier: null, judgment: null, typedFindings: [],
  });
  ok("suppressed: fired=false", suppressed.fired === false);
  ok("suppressed: the gate's own missing list is kept verbatim",
    suppressed.manifestMissing.join() === "submission instructions");
  ok("suppressed: produced nothing", suppressed.producedFindings === 0);

  // ---- 2. FIRED-BUT-LANDED-NOTHING: the 3b5bba30 signature -------------------------------------------
  // Panel ran, made findings, and NONE reached the customer. This is the state that cost $5.67 and was
  // previously indistinguishable from case 1.
  const landedNothing = buildPanelTelemetry({
    fired: true, manifest: { ok: true, missing: [] },
    panelists: [{ key: "ko", name: "Ex-Contracting Officer" }, { key: "atty", name: "Contracts Attorney" }],
    verifier: {}, judgment: { verdict: "NEEDS_HUMAN_REVIEW" },
    typedFindings: [{}, {}, {}],
  }, {
    finalFindings: [{ lens: "capture_strategist" }, { lens: "pricing_analyst" }],   // no panel display names
    seatDisplayNames: ["Ex-Contracting Officer", "Contracts Attorney"],
    judgeCommittal: false, foldApplied: false,
  });
  ok("fired-but-landed-nothing: fired=true", landedNothing.fired === true);
  ok("...produced 3", landedNothing.producedFindings === 3);
  ok("...survived 0 — the signature", landedNothing.survivingFindings === 0);
  ok("...and is DISTINGUISHABLE from suppressed",
    landedNothing.fired !== suppressed.fired && landedNothing.producedFindings !== suppressed.producedFindings);
  ok("...non-committal judge recorded", landedNothing.judgeCommittal === false && landedNothing.judgeVerdict === "NEEDS_HUMAN_REVIEW");
  ok("...fold correctly not applied", landedNothing.foldApplied === false);

  // ---- 3. THE HEALTHY CASE: panel work actually reaches the customer -----------------------------------
  const landed = buildPanelTelemetry({
    fired: true, manifest: { ok: true, missing: [] },
    panelists: [{ key: "ko", name: "Ex-Contracting Officer" }],
    verifier: {}, judgment: { verdict: "BID_WITH_CAUTION" }, typedFindings: [{}, {}],
  }, {
    finalFindings: [{ lens: "Ex-Contracting Officer" }, { lens: "pricing_analyst" }],
    seatDisplayNames: ["Ex-Contracting Officer"],
    judgeCommittal: true, foldApplied: true,
  });
  ok("healthy: a panel-attributed finding IS counted", landed.survivingFindings === 1);
  ok("healthy: committal judge + fold applied", landed.judgeCommittal && landed.foldApplied);

  // ---- 4. ATTRIBUTION IS BY DISPLAY NAME, and must not over-count --------------------------------------
  // panel-findings-bridge stamps `lens: p.name` (DISPLAY name). A lens key must never be mistaken for a seat.
  const noSeats = buildPanelTelemetry({ fired: true, panelists: [], typedFindings: [{}] }, {
    finalFindings: [{ lens: "capture_strategist" }], seatDisplayNames: [],
  });
  ok("no seat names ⇒ nothing is attributed to the panel", noSeats.survivingFindings === 0);
  const nullLens = buildPanelTelemetry({ fired: true, panelists: [], typedFindings: [] }, {
    finalFindings: [{ lens: null }, {}], seatDisplayNames: ["Ex-Contracting Officer"],
  });
  ok("findings with no lens are not attributed", nullLens.survivingFindings === 0);

  // ---- 5. SEAT ERRORS are captured (a failed seat is invisible in the cost ledger) ---------------------
  const seatErr = buildPanelTelemetry({
    fired: true, panelists: [{ key: "ko", name: "Ex-KO", error: "timeout after 240s" }], typedFindings: [],
  });
  ok("a failed seat is recorded with its reason", seatErr.seatErrors.length === 1 && seatErr.seatErrors[0].key === "ko");

  // ---- 6. VERIFIER null-with-reason is distinguishable from verifier-ran ------------------------------
  const verErr = buildPanelTelemetry({ fired: true, verifier: null, verifierError: "schema refusal", typedFindings: [] });
  ok("verifier nulled WITH its captured reason", verErr.verifierRan === false && verErr.verifierError === "schema refusal");

  // ---- 7. ROUTING: dropped-for-budget sections are recorded at the moment they happen -------------------
  const dropped = buildPanelTelemetry({ fired: true, typedFindings: [], droppedSectionsForBudget: ["C", "I"] });
  ok("sections dropped for budget are recorded", dropped.droppedSectionsForBudget.join() === "C,I");

  // ---- 8. TOTALITY: a null panel yields a real record, never an absent one ------------------------------
  const none = buildPanelTelemetry(null);
  ok("null panel ⇒ fired=false record, not a throw", none.fired === false && none.producedFindings === 0);
  ok("undefined panel ⇒ same", buildPanelTelemetry(undefined).fired === false);

  // ---- 9. The log line SAYS which state it is ----------------------------------------------------------
  ok("suppressed line says SUPPRESSED", panelTelemetryLine(suppressed).includes("SUPPRESSED"));
  ok("fired line says FIRED and carries the survivor count",
    panelTelemetryLine(landedNothing).includes("FIRED") && panelTelemetryLine(landedNothing).includes("0 survived"));

  console.log(`\npanel telemetry: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
