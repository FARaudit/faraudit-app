// $0 regression lock — NMR CITATION HONESTY (panel gate-4 on 150c3ab3 / 36C25626Q1137: AUTO-F, fabricated clause
// presence). Flag: AUDIT_NMR_CITATION_HONESTY (default-OFF ⇒ legacy strings byte-identical). Run:
//   npx tsx src/lib/nmr-citation-honesty.test.ts
//
// FABRICATION UNDER FIX (two sites, one chain):
//   (1) audit-keyfact-detector emitter #3 hardcodes citation "FAR 52.219-33 (source clause list)" on every NMR
//       keyfact finding — on 150c3ab3 the literal 52.219-33 has ZERO occurrences in the 41-page package (the
//       grounding excerpt lives in VAAR 852.219-73(d), sol.txt:1454).
//   (2) applyNmrNaicsDormancy rewrites the requirement to a template asserting "Present in the clause matrix" —
//       a document claim never verified against the package.
// INVARIANT (ROOT-5 analog, zero-tolerance): no clause number may be asserted as PRESENT IN THE SOURCE unless a
// deterministic substring check confirms it (Rule 64). Rule-identity naming of the NMR (13 CFR 121.406) is a
// regulatory fact and stays; document-presence claims must be derived or absent.
export {};
process.env.AUDIT_KEYFACT_DETECTOR = "true"; // the emitter must be on to produce the finding

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

// Mini-fixture reproducing the 150c3ab3 shape: SDVOSB set-aside context + supplyCtx satisfied ONLY by universal
// clause boilerplate ("manufactured" in the drone-prohibition clause) + NMR prose grounded in VAAR 852.219-73(d).
// The literal "52.219-33" appears NOWHERE (verified 0 occurrences in the real raw_pdf_text).
const SRC_NO_LITERAL = [
  "SERVICE-DISABLED VETERAN-OWNED SMALL BUSINESS SET-ASIDE.",
  "Prohibition on unmanned aircraft systems manufactured or assembled by American Security Drone Act covered foreign entities.",
  "852.219-73 VA Notice of Total Set-Aside for Certified Service-Disabled Veteran-Owned Small Businesses.",
  "including the non-manufacturer rule and limitations on subcontracting (LOS) requirements in 13 CFR 125.6.",
].join("\n");
// Control fixture: the literal clause number IS in the source clause list.
const SRC_WITH_LITERAL = [
  "TOTAL SMALL BUSINESS SET-ASIDE. Schedule of supplies: widgets, end items to be delivered.",
  "52.219-33 Notice of Nonmanufacturer Rule (SEP 2021) is incorporated.",
].join("\n");

const LEGACY_CITATION = "FAR 52.219-33 (source clause list) · 13 CFR 121.406(b)";

const withHonesty = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_NMR_CITATION_HONESTY;
  if (on) process.env.AUDIT_NMR_CITATION_HONESTY = "true"; else delete process.env.AUDIT_NMR_CITATION_HONESTY;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_NMR_CITATION_HONESTY; else process.env.AUDIT_NMR_CITATION_HONESTY = prev; }
};

(async () => {
  const { applyKeyfactDetector } = await import("./audit-keyfact-detector");
  const { applyNmrNaicsDormancy } = await import("./audit-decide");
  const emit = (src: string) =>
    applyKeyfactDetector([], src, { enabled: true }).find((f) => f.kind === "eligibility_bar" && f.lens === "keyfact_detector");

  // ── P1 (the 150c3ab3 fabrication): literal ABSENT + honesty ON ⇒ citation asserts NO source-presence of 52.219-33.
  withHonesty(true, () => {
    const f = emit(SRC_NO_LITERAL);
    ok("P1 emitter fired on the 150c3ab3-shaped fixture (saturated supplyCtx — the real firing path)", !!f);
    ok("P1 honest citation does NOT claim '(source clause list)'", !!f && !/source clause list/i.test(f.citation ?? ""));
    ok("P1 honest citation does NOT name 52.219-33 as a document location", !!f && !/52\.219-33/.test(f.citation ?? ""));
    ok("P1 honest citation still carries the regulatory basis 13 CFR 121.406(b)", !!f && /13 CFR 121\.406\(b\)/.test(f.citation ?? ""));
    ok("P1 excerpt is a verbatim substring of the source (Rule 64 unchanged)", !!f && !!f.excerpt && SRC_NO_LITERAL.includes(f.excerpt));
  });

  // ── P2 (control — must hold BOTH before and after the fix): literal PRESENT ⇒ the clause-list citation is
  //     CORRECT and retained verbatim, honesty ON or OFF.
  for (const on of [true, false]) withHonesty(on, () => {
    const f = emit(SRC_WITH_LITERAL);
    ok(`P2 honesty=${on}: literal present ⇒ legacy clause-list citation retained exactly`, !!f && f.citation === LEGACY_CITATION);
  });

  // ── P3 (dormancy template): honesty ON ⇒ demoted requirement makes NO clause-matrix presence claim and grounds
  //     itself on the excerpt it carries. DORMANT + 13 CFR tokens stay (downstream isDemoted checks key on them).
  withHonesty(true, () => {
    const f = emit(SRC_NO_LITERAL);
    ok("P3 precondition: emitter fired", !!f);
    if (!f) return;
    const [d] = applyNmrNaicsDormancy([f], "561720", { enabled: true });
    ok("P3 demotion happened (P2 · other · bidder_controls)", d.severity === "P2" && d.kind === "other" && d.controllability === "bidder_controls");
    ok("P3 honest requirement does NOT assert 'Present in the clause matrix'", !/clause matrix/i.test(d.requirement));
    ok("P3 honest requirement grounds on the carried excerpt ('see excerpt')", /see excerpt/i.test(d.requirement));
    ok("P3 requirement keeps DORMANT + 13 CFR 121.406(b) (downstream shape checks)", /DORMANT/.test(d.requirement) && /13 CFR 121\.406\(b\)/.test(d.requirement));
    ok("P3 the finding's excerpt survived the rewrite (the grounding is intact)", d.excerpt === f.excerpt);
  });

  // ── P4 FLAG-OFF byte-identity: both sites emit the exact legacy strings (fabrications preserved verbatim — the
  //     falsifiability control: these assertions PASS against current prod behavior, proving the probe can see it).
  withHonesty(false, () => {
    const f = emit(SRC_NO_LITERAL);
    ok("P4 OFF: emitter citation is the LEGACY hardcoded clause-list string", !!f && f.citation === LEGACY_CITATION);
    if (!f) return;
    const [d] = applyNmrNaicsDormancy([f], "561720", { enabled: true });
    ok("P4 OFF: dormancy requirement is the LEGACY template (asserts clause-matrix presence)", /Present in the clause matrix/.test(d.requirement));
  });

  // ── P5 end-to-end reproduction of the fixed 150c3ab3 chain (honesty ON): emitter → dormancy on NAICS 561720 ⇒
  //     a P2 advisory whose text contains NO document claim the package cannot support.
  withHonesty(true, () => {
    const f = emit(SRC_NO_LITERAL);
    if (!f) { ok("P5 precondition: emitter fired", false); return; }
    const [d] = applyNmrNaicsDormancy([f], "561720", { enabled: true });
    const blob = `${d.requirement} ${d.citation ?? ""}`;
    ok("P5 final advisory carries NO '(source clause list)' claim", !/source clause list/i.test(blob));
    ok("P5 final advisory carries NO 'clause matrix' presence claim", !/clause matrix/i.test(blob));
    ok("P5 final advisory names the rule by its regulatory identity (13 CFR 121.406)", /13 CFR 121\.406/.test(blob));
  });

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
