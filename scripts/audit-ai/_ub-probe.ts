// U-B · FALSIFICATION PROBE — written BEFORE the fix (probe-first doctrine).
//
// Panel-ratified U-B (ceo/VERDICT-INVERSION-PANEL-2026-07-29.md): the gate's silent boilerplate release gets a
// LEDGER; the obligation sweep carries a duty's severed CONSEQUENCE (sentence-pair unit); the conditional-TINA
// demotion must not swallow a co-sentenced NMR/kill-class bar. Measured: 478/2680 (18%) ungrounded READ
// obligations silently released across the 59-record cohort; 82 with a kill tail in the next sentence; TINA/NMR
// = 0 corpus instances (panel traced it in shipped code → synthetic legs here).
//
// Flags (default OFF · byte-identical OFF):
//   AUDIT_RELEASE_LEDGER       — releasedBoilerplate bucket (count + names) in CoverageV2 → run record. Verdict-inert.
//   AUDIT_CONSEQUENCE_CAPTURE  — (a) a released-class duty whose NEXT-sentence window carries a rejection
//                                consequence escalates to disqualifierUncovered instead of vanishing;
//                                (b) isConditionalTinaBoilerplate refuses to demote when the sentence carries
//                                NMR/kill-class vocab hasBarSignal is measured blind to.
//
// PRE (current code): P1/P3 legs are RED — the planted known-positives. POST: all GREEN.
const DUTY = "Offerors shall acknowledge receipt of all amendments to this solicitation in the spaces provided on the quotation form.";
const KILL_TAIL = "Quotations that fail to acknowledge all amendments will not be considered for award.";
const BENIGN_TAIL = "The Government intends to award without discussions.";
const TINA_NMR = "Certified cost or pricing data shall not be required in accordance with FAR 15.403-1; the offeror shall comply with the nonmanufacturer rule at 52.219-33 and provide the product of a small business manufacturer.";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const att = (ungrounded: string[]) => [{ section: "L", status: "obligations_ungrounded" as const, obligations: ungrounded, citedFindingIds: [], ungrounded }];

(async () => {
  const g = await import("../../src/lib/audit-gate-v2");
  // production-shape tail callback: the shared exported lookup when it exists (post-build), else a faithful
  // local stand-in (pre-build) — the POST battery additionally proves the orchestrator wires the real export.
  const tailFn = (src: string) => (ob: string): string | null =>
    (g as { consequenceTailAfter?: (s: string, o: string) => string | null }).consequenceTailAfter?.(src, ob)
    ?? (() => { const i = src.indexOf(ob); return i >= 0 ? src.slice(i + ob.length, i + ob.length + 300) : null; })();

  const run = (ungrounded: string[], src: string, flags: Record<string, string>) => {
    const prev: Array<[string, string | undefined]> = Object.keys(flags).map((k) => [k, process.env[k]]);
    for (const [k, v] of Object.entries(flags)) process.env[k] = v;
    try {
      return g.gradeCoverageV2(att(ungrounded), { verifyRecitalPresence: (ob) => g.verifyRecitalInSource(src, ob), consequenceTail: tailFn(src) } as never);
    } finally { for (const [k, v] of prev) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  };
  const SRC_KILL = `SECTION L INSTRUCTIONS. ${DUTY} ${KILL_TAIL} END.`;
  const SRC_BENIGN = `SECTION L INSTRUCTIONS. ${DUTY} ${BENIGN_TAIL} END.`;

  // sanity: the duty is genuinely the released class today (importanceOf boilerplate) — else the probe is inert
  check("S0 duty classifies 'boilerplate' (the released class — probe substrate is real)",
    g.importanceOf(DUTY) === "boilerplate", `got ${g.importanceOf(DUTY)}`);

  // ── P1 · CONSEQUENCE CAPTURE (flag ON): severed kill tail ⇒ escalate, never vanish ──
  const p1 = run([DUTY], SRC_KILL, { AUDIT_CONSEQUENCE_CAPTURE: "true", AUDIT_RELEASE_LEDGER: "false" });
  check("P1 duty + severed 'will not be considered' tail → disqualifierUncovered (capture ON)",
    p1.disqualifierUncovered.some((d: { obligation: string }) => d.obligation === DUTY),
    `disqualifierUncovered=${p1.disqualifierUncovered.length}`);
  // ── P2 · benign tail must NOT escalate (over-fire guard) — and with the ledger ON it is RECORDED ──
  const p2 = run([DUTY], SRC_BENIGN, { AUDIT_CONSEQUENCE_CAPTURE: "true", AUDIT_RELEASE_LEDGER: "true" });
  const p2led = (p2 as { releasedBoilerplate?: Array<{ obligation: string }> }).releasedBoilerplate ?? [];
  check("P2a benign tail → NOT escalated (no consequence, stays released)",
    !p2.disqualifierUncovered.some((d: { obligation: string }) => d.obligation === DUTY), `escalated`);
  check("P2b …and the release is LEDGERED (releasedBoilerplate names it)",
    p2led.some((d) => d.obligation === DUTY), `ledger=${JSON.stringify(p2led).slice(0, 80)}`);
  // ── P3 · TINA/NMR co-sentence: the demotion predicate must refuse when an NMR bar rides the sentence ──
  const prevCap = process.env.AUDIT_CONSEQUENCE_CAPTURE;
  process.env.AUDIT_CONSEQUENCE_CAPTURE = "true";
  const p3 = g.isConditionalTinaBoilerplate(TINA_NMR);
  process.env.AUDIT_CONSEQUENCE_CAPTURE = prevCap ?? "";
  check("P3 conditional-TINA sentence carrying the 52.219-33 NMR duty → NOT demotable (capture ON)",
    p3 === false, `isConditionalTinaBoilerplate=${p3}`);
  // sanity: it IS demotable today with the guard off (the panel-traced false-BID vector exists)
  process.env.AUDIT_CONSEQUENCE_CAPTURE = "false";
  const p3off = g.isConditionalTinaBoilerplate(TINA_NMR);
  process.env.AUDIT_CONSEQUENCE_CAPTURE = prevCap ?? "";
  check("S1 …and IS demotable with the guard OFF (vector reproduced — the probe can fail)",
    p3off === true, `flag-off isConditionalTinaBoilerplate=${p3off}`);

  // ── P4 · flag-OFF byte-identity: both flags off ⇒ serialized CoverageV2 identical to the silent release ──
  const off = run([DUTY], SRC_KILL, { AUDIT_CONSEQUENCE_CAPTURE: "false", AUDIT_RELEASE_LEDGER: "false" });
  check("P4 both flags OFF → no escalation, no ledger key (byte-identical silent release)",
    !off.disqualifierUncovered.some((d: { obligation: string }) => d.obligation === DUTY)
    && !("releasedBoilerplate" in (off as Record<string, unknown>)), `keys=${Object.keys(off).join(",")}`);

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
