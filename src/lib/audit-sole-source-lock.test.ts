// UNIT (DRY) — the deterministic sole-source-lock DETECTOR + over-fire CARVE-OUT pre-gate
// (card #746). LOAD-BEARING: proves detection FIRES on the exact T1 live specimen
// (SPRRA2-26-R-0034 "Sole Source to Raytheon", audit a7727dfc) — where the lens field
// sole_source_named_vendor_raw came back EMPTY — and that the carve-out pre-gate produces
// ZERO over-fires on biddable specimens AND (post-ultracode) does NOT clear genuine closed
// sole sources. Pure functions; WIRED only under AUDIT_SOLE_SOURCE_LOCK (see the decide test).
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { detectSoleSourceLock, soleSourceCarveOut } from "./audit-sole-source-lock";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// ── T1 GROUND TRUTH — the exact strings pulled from raw_pdf_text of a7727dfc ──────────────
const T1_SOURCE = [
  "==== DOCUMENT: notice ====",
  "24K Environmental Control Unit (ECU) Sole Source to Raytheon",
  "1\tFeb 13, 2026 05:18:24 PM GMT",
  "The Government intends to procure the 24K ECU on a sole source basis.",
  "If Raytheon intends to subcontract more than 70% of the value-added, Raytheon shall identify in its proposal all actual or potential organizational conflicts of interest.",
  "Raytheon shall submit a mitigation plan if any OCIs are identified.",
  "Raytheon shall not contact any other Government personnel other than the Contracting Officer.",
].join("\n");

// ── 1. DETECTION — the load-bearing gate. The lock MUST populate on T1. ───────────────────
{
  const lock = detectSoleSourceLock(T1_SOURCE);
  assert(lock !== null, "T1: a sole-source lock is DETECTED (was null before this build — lens field empty)");
  assert(lock?.vendor === "Raytheon", `T1: vendor extracted = "Raytheon" (got "${lock?.vendor}")`);
  assert(lock?.titleSignal === true, "T1: titleSignal true (from the masthead 'Sole Source to Raytheon')");
  assert((lock?.proseSignals.length ?? 0) >= 2, `T1: ≥2 offeror-obligation prose corroborations (got ${lock?.proseSignals.length})`);
  const carve = lock ? soleSourceCarveOut(lock, T1_SOURCE, { samSetAside: null }) : { kind: "x" } as never;
  assert(carve === null, `T1: NO carve-out fires → lock STANDS → NHR-conditional (got ${carve ? (carve as { kind: string }).kind : "null"})`);
}

// ── 2. J&A / only-known-source title-less specimen still detects ──────────────────────────
{
  const ja = "==== DOCUMENT: jaform ====\nJustification and Approval under FAR 6.302-1. The only known source is Chelton Avionics Inc; no other source can meet the safety-of-flight requirement.";
  const lock = detectSoleSourceLock(ja);
  assert(lock !== null && lock.jaSignal === true, "J&A: detected via 6.302 + only-known-source (jaSignal)");
  assert(/Chelton Avionics/.test(lock?.vendor ?? ""), `J&A: vendor = Chelton Avionics Inc (got "${lock?.vendor}")`);
}

// ── 3. FABRICATION GUARD (ultracode #2) — a capitalized purpose-verb is NEVER a vendor. ───
{
  for (const bad of ["Sole Source to Maintain the ECU Fleet", "Sole Source to Ensure Continued Support", "Sole Source to Sustain the Legacy System", "SOLE SOURCE TO OVERHAUL THE ENGINE"]) {
    assert(detectSoleSourceLock(bad) === null, `fabrication guard: "${bad}" → NO vendor (uncorroborated verb, not a proper noun)`);
  }
  // corroborated by a company suffix → real vendor even with no prose
  assert(detectSoleSourceLock("Sole Source to Raytheon Company")?.vendor === "Raytheon Company", "corroboration: 'Raytheon Company' (suffix) fires without prose");
  // corroborated by prose → real vendor even with no suffix
  assert(detectSoleSourceLock("Sole Source to Raytheon. Raytheon shall submit its proposal.")?.vendor === "Raytheon", "corroboration: 'Raytheon' + prose fires");
}

// ── 4. ALL-CAPS masthead (ultracode #3) — DoD/DLA titles are frequently all-caps. ─────────
{
  const caps = "24K ENVIRONMENTAL CONTROL UNIT SOLE SOURCE TO RAYTHEON COMPANY. RAYTHEON COMPANY SHALL SUBMIT ITS PROPOSAL.";
  const lock = detectSoleSourceLock(caps);
  assert(lock !== null && /RAYTHEON/.test(lock.vendor), `all-caps title: detected (got "${lock?.vendor}")`);
}

// ── 5. Abbreviation / 2-char vendor head (ultracode #4) is NOT dropped. ───────────────────
{
  assert(/L3/.test(detectSoleSourceLock("Sole Source to L3 Harris Technologies")?.vendor ?? ""), "abbrev head: 'L3 Harris Technologies' detected (head length 2 kept)");
}

// ── 6. CARVE-OUTS — biddable specimens are suppressed. ────────────────────────────────────
const CARVE = (title: string, src: string, expect: string) => {
  const lock = detectSoleSourceLock(src);
  const carve = lock ? soleSourceCarveOut(lock, src, { samSetAside: null }) : null;
  const biddable = lock === null || (carve !== null && carve.kind === expect);
  assert(biddable, `carve-out: ${title} → biddable (lock=${lock ? "fired" : "none"}, carve=${carve?.kind ?? "none"}, expected ${expect})`);
};
CARVE("brand-name OR EQUAL",
  "Sole source to Acme Systems for the pump. This is a brand name or equal acquisition; an approved equal meeting the salient characteristics will be accepted.",
  "or_equal");
CARVE("FAR 5.207 intent synopsis",
  "Notice of intent to sole source to Northrop Grumman Systems. This is a synopsis under FAR 5.207; interested capable sources may submit a capability statement, which the Government will consider before proceeding.",
  "intent_synopsis_5207");
CARVE("incidental set-aside (J&A, no directed vendor)",
  "Justification and approval: market research shows the only known source is Acme Systems Inc. This acquisition is a 100% total small business set-aside under FAR 52.219-6.",
  "setaside_firm_qualifies");

// firm_is_vendor: the customer IS the vendor (only fires when firmIdentity supplied).
{
  const src = "Sole source to Raytheon Company. Raytheon shall submit its proposal by the deadline.";
  const lock = detectSoleSourceLock(src);
  const carve = lock ? soleSourceCarveOut(lock, src, { samSetAside: null, firmIdentity: "Raytheon Company" }) : null;
  assert(carve?.kind === "firm_is_vendor", `carve-out: firm IS the vendor → suppressed (got ${carve?.kind})`);
  const carve2 = lock ? soleSourceCarveOut(lock, src, { samSetAside: null }) : null;
  assert(carve2 === null, "carve-out: null profile ⇒ firm_is_vendor cannot fire ⇒ lock stands (conditional)");
}

// ── 7. OVER-SUPPRESSION GUARDS — genuine closed sole sources must NOT be cleared. ─────────
// (7a) ultracode #1/#5/#7 — bare "market research"/"sources sought" in a J&A does NOT carve.
{
  const ja = "Sole Source to Raytheon Company. Market research was conducted; no other source is capable of meeting the requirement. No responses to the sources sought notice were received.";
  const lock = detectSoleSourceLock(ja);
  const carve = lock ? soleSourceCarveOut(lock, ja, { samSetAside: null }) : null;
  assert(carve === null, `over-suppress guard: closed J&A with bare 'market research'/'sources sought' → NOT carved (got ${carve?.kind})`);
}
// (7b) ultracode #6/#8 — brand-name-ONLY spec with "salient characteristics" but NO "or equal".
{
  const bno = "Sole source to Acme Systems Inc. The salient characteristics of the required pump are specified; no substitutions are permitted and no exceptions will be considered.";
  const lock = detectSoleSourceLock(bno);
  const carve = lock ? soleSourceCarveOut(lock, bno, { samSetAside: null }) : null;
  assert(carve === null, `over-suppress guard: brand-name-ONLY 'salient characteristics' (no 'or equal') → NOT carved (got ${carve?.kind})`);
}
// (7c) ultracode #9 — an 8(a)/SDVOSB SOLE-SOURCE DIRECTED award is NOT cleared by the set-aside carve.
{
  const directed = "8(a) sole source to XYZ Solutions. This is a total small business set-aside under FAR 52.219-6. XYZ Solutions shall submit its proposal.";
  const lock = detectSoleSourceLock(directed);
  const carve = lock ? soleSourceCarveOut(lock, directed, { samSetAside: "8A" }) : null;
  assert(lock !== null, "over-suppress guard #9: 8(a) sole-source directed award IS detected");
  assert(carve === null, `over-suppress guard #9: 8(a) sole-source directed award → NOT carved (lock stands) (got ${carve?.kind})`);
}

// ── 8. NEGATIVE — no false lock on an ordinary open solicitation naming no vendor. ────────
{
  const open = "==== DOCUMENT: notice ====\nThis is a competitive small business set-aside for janitorial services. The offeror shall submit a technical and price proposal.";
  assert(detectSoleSourceLock(open) === null, "open sol (no named-vendor sole-source signal) → no lock");
}
{
  const vague = "The requirement may be met on a sole source basis to the extent justified. Award to be determined.";
  assert(detectSoleSourceLock(vague) === null, "'sole source ... to be determined' → no vendor → no false lock");
}

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS");
if (failures) process.exit(1);
