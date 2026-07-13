// $0 regression lock for ROOT-5 (Brain card #474 ruling #2) — the deadline finding's citation is FORM-KEYED to the
// section-boundary classifier (procurementPart), never a hardcoded "SF-1449 Block 8" on a non-1449 buy. Run:
//   npx tsx src/lib/audit-keyfact-form-citation.test.ts
//
// FABRICATION FIXED: run 8f56ecc4 (FA813726R0033, an SF-1442 construction buy) emitted a submission finding cited to
// "SF-1449 Block 8" — a form that does not exist in the package → /panel red-team AUTO-F. INVARIANT (zero-tolerance):
// NO form-name may appear in the citation unless it IS the detected form. Flag-OFF ⇒ legacy string (byte-identical).
export {};
process.env.AUDIT_KEYFACT_DETECTOR = "true"; // the emitter itself must be on to produce the finding

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { applyKeyfactDetector, deadlineCitation } = await import("./audit-keyfact-detector");
  // A source with a bare SF-1449-style deadline grid line so the emitter fires; the FORM is decided by procurementPart.
  const SRC = "SECTION L INSTRUCTIONS.\nOFFER DUE DATE: 18 Jul 2026 LOCAL TIME\nSubmit your proposal by the closing date.";
  const cite = (part: string, on: boolean) => {
    process.env.AUDIT_FORM_KEYED_CITATION = on ? "true" : "false";
    const out = applyKeyfactDetector([], SRC, { enabled: true, procurementPart: part as never });
    return out.find((f) => f.lens === "keyfact_detector" && f.kind === "submission")?.citation ?? "";
  };

  // ── PIN 1 (the 8f56ecc4 case): construction (SF-1442) → NO "SF-1449", NO wrong "Block 8"; names SF-1442.
  const c = cite("part36-construction", true);
  ok("PIN1 construction citation is non-empty (emitter fired)", c.length > 0);
  ok("PIN1 construction citation contains NO 'SF-1449' (the fabrication)", !/SF-?1449/i.test(c));
  ok("PIN1 construction citation contains NO wrong-form 'Block 8'", !/Block\s*8/i.test(c));
  ok("PIN1 construction citation names the DETECTED form SF-1442", /SF-?1442/i.test(c));

  // ── PIN 2: commercial (SF-1449) → the SF-1449 Block 8 citation is CORRECT and retained.
  const com = cite("part12-commercial", true);
  ok("PIN2 commercial citation names SF-1449 Block 8 (correct form)", /SF-?1449/i.test(com) && /Block\s*8/i.test(com));

  // ── PIN 3: UCF / unknown → FORM-NEUTRAL, no form-name asserted.
  const ucf = cite("part15-ucf", true);
  const unk = cite("unknown", true);
  ok("PIN3 UCF citation is form-neutral (no SF-14xx)", !/SF-?14\d\d/i.test(ucf));
  ok("PIN3 unknown citation is form-neutral (no SF-14xx)", !/SF-?14\d\d/i.test(unk));
  ok("PIN3 form-neutral still names the closing-date context", /closing date/i.test(ucf));

  // ── PIN 4 FLAG-OFF byte-identical: legacy hardcoded string regardless of form.
  const offConstruction = cite("part36-construction", false);
  ok("PIN4 FLAG-OFF: construction citation is the LEGACY 'SF-1449 Block 8 / Notice to Offerors (closing date)'",
     offConstruction === "SF-1449 Block 8 / Notice to Offerors (closing date)");
  ok("PIN4 FLAG-OFF: helper unit matches legacy for any form",
     (process.env.AUDIT_FORM_KEYED_CITATION = "false", deadlineCitation("part36-construction" as never) === "SF-1449 Block 8 / Notice to Offerors (closing date)"));

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
