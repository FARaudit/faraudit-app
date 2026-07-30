/* R4 — systematic field audit: which finding fields does deriveVerdict/disposeFinding/firmStatus read,
   and does each come from the `worst` bundle or ride from `primary`? Then probe cross-products where a
   marker rides from primary while disposition comes from a different worst member. */
import { applyFindingDedup, deriveVerdict, disposeFinding, firmStatus, NMR_ATTRIBUTE } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs, BidderProfile } from "../../src/lib/audit-findings";

const ON = { enabled: true };
const base = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: "x", citation: "FAR 52.222-1", excerpt: "x", kind: "other",
  controllability: "bidder_controls", grounded: true, lens: "L", ...o,
});
const vi = (findings: TypedFinding[], profile: BidderProfile | null): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false });

function pole(fs: TypedFinding[], profile: BidderProfile | null) {
  const d = deriveVerdict(vi(fs, profile));
  return `${d.verdict}/${d.eligible}`;
}
function comparePole(name: string, fs: TypedFinding[], profile: BidderProfile | null) {
  const off = pole(fs, profile);
  const deduped = applyFindingDedup(fs, ON);
  const on = pole(deduped, profile);
  const flip = off !== on ? "  <<< POLE FLIP" : "";
  console.log(`[${name}] OFF=${off}  ON=${on}  (${fs.length}->${deduped.length})${flip}`);
  if (off !== on) {
    console.log(`   survivors ON:`, deduped.map(f => `{ctrl:${f.controllability},kind:${f.kind},cure:${f.curableInWindow},attr:${f.requiredAttribute},nmr:${f.nmrGuard},mm:${f.mmEvidenceFactor}}`));
  }
  return off !== on;
}

process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; // tristate ON is the prod state (clamp active)
let breaks = 0;

// ── SUSPECT A: curableInWindow rides from primary when worst is NOT a bar (line 1941 isBar gate).
// Build a group where worst=bidder_controls (not a bar) with curableInWindow=true, but primary (forced protected)
// carries curableInWindow=false. Does the survivor read curable=false into any deriveVerdict branch?
// A protected member (has a marker) becomes forced primary; a plain bidder_controls member becomes worst.
const A_protected = base({ citation: "FAR 52.222-1", requirement: "clause A protected",
  controllability: "bidder_controls", curableInWindow: false, structuralWhitelistGuard: true }); // marker => protected => forced primary
const A_plain = base({ citation: "FAR 52.222-1", requirement: "clause A plain",
  controllability: "bidder_controls", curableInWindow: true });
breaks += comparePole("A curable-from-primary/nonbar", [A_protected, A_plain], null) ? 1 : 0;

// ── SUSPECT B: nmrGuard rides from primary; worst controllability from a NON-nmr bar.
// primary carries nmrGuard + requiredAttribute=NMR_ATTRIBUTE (protected), worst is a bidder_cannot_move
// non-nmr bar. R3 takes requiredAttribute from worst. So survivor: nmrGuard=true (primary) + requiredAttribute
// from worst (non-NMR). firmStatus needs BOTH nmrGuard AND attr===NMR to hit nmrFirmStatus — worst attr breaks it.
// But branch 5b nonCurable EXCLUDES nmrGuard===true; branch 5b-NMR INCLUDES nmrGuard===true. So a real
// non-nmr structural bar that becomes a survivor with nmrGuard=true from primary gets routed to the NMR
// curability-path message instead of the structural hold-it-or-walk. Pole may be same (both NHR) but reason differs;
// worse: does it change eligible or drop it from the structural showstopper set?
const B_nmr = base({ citation: "FAR 52.219-33", requirement: "NMR compliance",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false,
  requiredAttribute: NMR_ATTRIBUTE, nmrGuard: true }); // protected (nmrGuard/requiredAttribute)
const B_struct = base({ citation: "FAR 52.219-33", requirement: "TDP / facility clearance structural bar",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false,
  requiredAttribute: "facility-clearance" }); // protected (requiredAttribute) — both protected!
breaks += comparePole("B nmrGuard+struct (both protected)", [B_nmr, B_struct], null) ? 1 : 0;

// B2 — make the structural bar PLAIN so it can be worst absorbed under the nmr primary.
// A plain bar carries controllability+curableInWindow but NO requiredAttribute (else protected).
const B2_nmr = base({ citation: "FAR 52.219-33", requirement: "NMR compliance",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false,
  requiredAttribute: NMR_ATTRIBUTE, nmrGuard: true });
const B2_plainbar = base({ citation: "FAR 52.219-33", requirement: "structural non-curable bar",
  controllability: "bidder_cannot_move", kind: "eligibility_bar", curableInWindow: false }); // plain (no attr/marker)
breaks += comparePole("B2 nmr-primary absorbs plain struct bar", [B2_nmr, B2_plainbar], null) ? 1 : 0;

// ── SUSPECT C: mmEvidenceFactor rides from primary; worst is a REAL eligibility_bar with requiredAttribute.
// unverifiedGates filter: kind===eligibility_bar && requiredAttribute && !mmEvidenceFactor && firmStatus!==satisfies.
// If primary carries mmEvidenceFactor=true (protected) and worst gives kind=eligibility_bar + requiredAttribute,
// the survivor is EXCLUDED from unverifiedGates (mmEvidenceFactor true) => the eligibility clamp does NOT fire =>
// committalEligible stays true where the full set would have clamped eligible=null. THAT is a pole/eligible change.
const C_mm = base({ citation: "FAR 52.212-3", requirement: "M-factor evidenced in quote",
  controllability: "bidder_controls", kind: "submission", curableInWindow: true, cautionFloor: true,
  mmEvidenceFactor: true }); // protected (mmEvidenceFactor)
const C_bar = base({ citation: "FAR 52.212-3", requirement: "socioeconomic set-aside eligibility",
  controllability: "already_satisfied", kind: "eligibility_bar", requiredAttribute: "se:wosb" }); // plain-ish? has requiredAttribute => protected
breaks += comparePole("C mmEvidenceFactor primary + elig worst", [C_mm, C_bar], null) ? 1 : 0;

console.log(`\n=== field-audit breaks: ${breaks} ===`);
