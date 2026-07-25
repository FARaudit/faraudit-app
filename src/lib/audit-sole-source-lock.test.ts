// UNIT (DRY) — the deterministic sole-source-lock DETECTOR + over-fire CARVE-OUT pre-gate
// (card #746). LOAD-BEARING: proves detection FIRES on the exact T1 live specimen
// (SPRRA2-26-R-0034 "Sole Source to Raytheon", audit a7727dfc) — where the lens field
// sole_source_named_vendor_raw came back EMPTY — and that the carve-out pre-gate produces
// ZERO over-fires on the five biddable specimens. Pure functions; no flag (they are only
// WIRED under AUDIT_SOLE_SOURCE_LOCK — see audit-decide-sole-source.test.ts).
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { detectSoleSourceLock, soleSourceCarveOut } from "./audit-sole-source-lock";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// ── T1 GROUND TRUTH — the exact strings pulled from raw_pdf_text of a7727dfc ──────────────
// Masthead (repeated 3× as page headers) + OCI offeror-obligation prose addressed to Raytheon.
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
  assert(!!lock && /Raytheon/.test(lock.excerpt), "T1: excerpt names Raytheon (report headline is grounded)");
  // and it does NOT get carved out — it is a REAL lock (null profile ⇒ firm_is_vendor cannot fire)
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

// ── 3. CARVE-OUTS — the real work. ZERO over-fires: each biddable specimen must be suppressed.
const CARVE = (title: string, src: string, expect: string) => {
  const lock = detectSoleSourceLock(src);
  const carve = lock ? soleSourceCarveOut(lock, src, { samSetAside: null }) : null;
  // Either the detector never fires (no vendor), OR the carve-out suppresses it. Both = "does not kill a biddable buy".
  const biddable = lock === null || (carve !== null && carve.kind === expect);
  assert(biddable, `carve-out: ${title} → biddable (lock=${lock ? "fired" : "none"}, carve=${carve?.kind ?? "none"}, expected ${expect})`);
};

CARVE("brand-name OR EQUAL",
  "Sole source to Acme Systems for the pump. This is a brand name or equal acquisition; an approved equal meeting the salient characteristics will be accepted.",
  "or_equal");

CARVE("FAR 5.207 intent synopsis",
  "Notice of intent to sole source to Northrop Grumman Systems. This is a synopsis under FAR 5.207; interested capable sources may submit a capability statement, which the Government will consider before proceeding.",
  "intent_synopsis_5207");

CARVE("descriptive incumbent on open recompete",
  "This is a full and open competitive recompete. The incumbent contractor is currently Lockheed Martin Corporation. All responsible sources may submit a proposal.",
  "descriptive_incumbent");

CARVE("set-aside pool present (T2 SDVOSB mirror)",
  "Sole source to Boeing Company noted historically. This acquisition is a 100% total small business set-aside under FAR 52.219-6.",
  "setaside_firm_qualifies");

// firm_is_vendor: the customer IS the vendor (only fires when firmIdentity supplied).
{
  const src = "Sole source to Raytheon Company. Raytheon shall submit its proposal by the deadline.";
  const lock = detectSoleSourceLock(src);
  const carve = lock ? soleSourceCarveOut(lock, src, { samSetAside: null, firmIdentity: "Raytheon Company" }) : null;
  assert(carve?.kind === "firm_is_vendor", `carve-out: firm IS the vendor → suppressed (got ${carve?.kind})`);
  // and WITHOUT firmIdentity (production null profile) it does NOT carve → conditional lock stands
  const carve2 = lock ? soleSourceCarveOut(lock, src, { samSetAside: null }) : null;
  assert(carve2 === null, "carve-out: null profile ⇒ firm_is_vendor cannot fire ⇒ lock stands (conditional 'confirm you are not the vendor')");
}

// ── 4. NEGATIVE — no false lock on an ordinary open solicitation naming no vendor ─────────
{
  const open = "==== DOCUMENT: notice ====\nThis is a competitive small business set-aside for janitorial services. The offeror shall submit a technical and price proposal. Award to the lowest-priced technically acceptable offeror.";
  assert(detectSoleSourceLock(open) === null, "open sol (no named-vendor sole-source signal) → no lock (no false fire)");
}
{
  // "sole source" phrase but no capitalized proper-noun vendor after "to" → no lock (avoids "to be determined")
  const vague = "The requirement may be met on a sole source basis to the extent justified. Award to be determined.";
  assert(detectSoleSourceLock(vague) === null, "'sole source ... to be determined' → no vendor → no false lock");
}

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS");
if (failures) process.exit(1);
