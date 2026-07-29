// U-C · PROFILE SCHEMA V2 — FALSIFICATION PROBE, written BEFORE the fix (probe-first doctrine).
//
// Panel-ratified U-C (ceo/VERDICT-INVERSION-PANEL-2026-07-29.md M2 + red-team design_verdict_inversion_q2):
// two false-BID vectors in shipped code, both reproduced here flag-OFF:
//   B1 — BidderProfile has NO time dimension: a decertified/expired cert string reads identical to a live one
//        → firmStatus "satisfies" → the finding leaves unverifiedGates → the card-206-A clamp never fires →
//        committal eligible=true with the "⚠ ELIGIBILITY NOT VERIFIED" caution DELETED. A stale cert is
//        strictly worse than a null profile.
//   B2 — the EXACT-match path bypasses NON_SELF_CLEARABLE_BAR_RE entirely: an open-world (customer-asserted)
//        profile carrying the exact attr string clears an FCL/QPL/size-class structural bar no customer can
//        self-clear.
// Fix (flag AUDIT_PROFILE_SCHEMA_V2, default-OFF, byte-identical OFF): attributes[] records with source +
// verifiedAt/expiresAt (inputs + provenance + expiry, never derived booleans) · profile.asOf freshness clock ·
// stale→unknown (the 206-A verify-caution path restores the banner) · exact-match gains the same
// NON_SELF_CLEARABLE guard the canonical path has (closed-world/gold exact path unchanged) · authoritative-
// namespace floor: se:/setaside:/naics:/size:/clearance:/fcl:/oem:/qpl:/sam:/registration: satisfy only from
// sam_api/sba_api/verified_import — never customer_asserted (SAM verified via API, not asserted) · closedWorld
// never honored on a profile carrying customer_asserted records.
import type { TypedFinding } from "../../src/lib/audit-findings";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

const barFinding = (requiredAttribute: string, requirement: string, excerpt: string): TypedFinding => ({
  citation: "52.204-X", requirement, band: "gate", kind: "eligibility_bar",
  controllability: "bidder_cannot_move", requiredAttribute, curableInWindow: false,
  excerpt, grounded: true,
} as never);

(async () => {
  const d = await import("../../src/lib/audit-decide");
  const FCL_BAR = barFinding("clearance:secret-facility", "Offeror must hold an active Secret facility clearance at time of award.", "must possess an active Secret facility security clearance");
  const SE_BAR = barFinding("se:sdvosb", "SDVOSB set-aside: offeror must be an SBA-certified SDVOSB.", "certified service-disabled veteran-owned small business");
  const VISIT_BAR = barFinding("sitevisit:attended-2026-05-28", "Attendance at the May 28 2026 site visit is required.", "offers will only be accepted from firms that attended the site visit");

  const flag = (on: boolean) => { process.env.AUDIT_PROFILE_SCHEMA_V2 = on ? "true" : "false"; };

  // ── S-legs: vectors REPRODUCED flag-OFF (the probe can fail) ──
  flag(false);
  const staleProfile = {
    satisfiedAttributes: ["se:sdvosb"],
    attributes: [{ attr: "se:sdvosb", source: "customer_asserted", verifiedAt: "2024-01-10", expiresAt: "2025-01-10" }],
    asOf: "2026-07-29",
  } as never;
  check("S1 flag-OFF: EXPIRED se cert (expiresAt 2025 < asOf 2026) still 'satisfies' (B1 vector)",
    d.firmStatus(SE_BAR, staleProfile) === "satisfies", `got ${d.firmStatus(SE_BAR, staleProfile)}`);
  const fclProfile = { satisfiedAttributes: ["clearance:secret-facility"] } as never;
  check("S2 flag-OFF: open-world EXACT match clears an FCL structural bar (B2 vector)",
    d.firmStatus(FCL_BAR, fclProfile) === "satisfies", `got ${d.firmStatus(FCL_BAR, fclProfile)}`);

  // ── P-legs: flag ON ──
  flag(true);
  check("P1 expired record → unknown (stale→unknown→206-A verify-caution)",
    d.firmStatus(SE_BAR, staleProfile) === "unknown", `got ${d.firmStatus(SE_BAR, staleProfile)}`);
  const freshSam = {
    satisfiedAttributes: ["se:sdvosb"],
    attributes: [{ attr: "se:sdvosb", source: "sba_api", verifiedAt: "2026-07-01", expiresAt: "2027-07-01" }],
    asOf: "2026-07-29",
  } as never;
  check("P1b FRESH authoritative record → satisfies",
    d.firmStatus(SE_BAR, freshSam) === "satisfies", `got ${d.firmStatus(SE_BAR, freshSam)}`);
  check("P2 open-world exact match on the FCL bar → unknown (NON_SELF_CLEARABLE guard now covers the exact path)",
    d.firmStatus(FCL_BAR, fclProfile) === "unknown", `got ${d.firmStatus(FCL_BAR, fclProfile)}`);
  const goldClosed = { satisfiedAttributes: ["clearance:secret-facility"], closedWorld: true } as never;
  check("P2b closed-world/gold exact match unchanged (trusted profile keeps the fast path)",
    d.firmStatus(FCL_BAR, goldClosed) === "satisfies", `got ${d.firmStatus(FCL_BAR, goldClosed)}`);
  const assertedSe = {
    satisfiedAttributes: ["se:sdvosb"],
    attributes: [{ attr: "se:sdvosb", source: "customer_asserted", verifiedAt: "2026-07-01", expiresAt: "2027-07-01" }],
    asOf: "2026-07-29",
  } as never;
  check("P3 se:* from customer_asserted (fresh) → unknown (authoritative-namespace floor)",
    d.firmStatus(SE_BAR, assertedSe) === "unknown", `got ${d.firmStatus(SE_BAR, assertedSe)}`);
  const legacySe = { satisfiedAttributes: ["se:sdvosb"] } as never;
  check("P4 LEGACY bare se token (no records → asserted-class) → unknown under the floor",
    d.firmStatus(SE_BAR, legacySe) === "unknown", `got ${d.firmStatus(SE_BAR, legacySe)}`);
  const visitProfile = { satisfiedAttributes: ["sitevisit:attended-2026-05-28"] } as never;
  check("P5 non-floor namespace (site-visit attendance, bidder-knowable) exact match → still satisfies",
    d.firmStatus(VISIT_BAR, visitProfile) === "satisfies", `got ${d.firmStatus(VISIT_BAR, visitProfile)}`);
  const sneakyClosed = {
    satisfiedAttributes: ["clearance:secret-facility"], closedWorld: true,
    attributes: [{ attr: "clearance:secret-facility", source: "customer_asserted" }],
  } as never;
  check("P6 closedWorld NOT honored when records carry customer_asserted (never closedWorld on customer profiles)",
    d.firmStatus(FCL_BAR, sneakyClosed) === "unknown", `got ${d.firmStatus(FCL_BAR, sneakyClosed)}`);

  // ── E2E: the deleted-caution vector through deriveVerdict (tristate armed, as prod) ──
  process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
  const baseInputs = {
    findings: [SE_BAR], bidderProfile: staleProfile, coverageComplete: true, verifierSound: true,
    conflict: false, documentsComplete: true, manifestComplete: true,
  } as never;
  flag(false);
  const off = d.deriveVerdict(baseInputs);
  check("E1 flag-OFF: stale cert deletes the safety net (committal, eligible=true, NO verify-caution)",
    off.eligible === true && !/ELIGIBILITY NOT VERIFIED/i.test(off.reason ?? ""),
    `eligible=${off.eligible} verdict=${off.verdict} :: ${(off.reason ?? "").slice(0, 100)}`);
  flag(true);
  const on = d.deriveVerdict(baseInputs);
  check("E2 flag-ON: caution RESTORED (eligible never true; the gate is back in the unverified set)",
    on.eligible !== true, `eligible=${on.eligible} verdict=${on.verdict} :: ${(on.reason ?? "").slice(0, 120)}`);

  // ── O1: flag-OFF byte-identity across all specimens ──
  flag(false);
  const offStates = [d.firmStatus(SE_BAR, staleProfile), d.firmStatus(FCL_BAR, fclProfile), d.firmStatus(SE_BAR, legacySe), d.firmStatus(VISIT_BAR, visitProfile)].join(",");
  check("O1 flag-OFF states identical to shipped behavior (satisfies,satisfies,satisfies,satisfies)",
    offStates === "satisfies,satisfies,satisfies,satisfies", `got ${offStates}`);

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
