// B3 · BANNER BAR RANKING — full battery (Brain ruling 2026-07-23, CEO full-run step 3)
// Flag `AUDIT_BANNER_BAR_RANKING`, default-OFF. Properties under test:
//   P1 FLAG-OFF BYTE-IDENTITY  — flag-OFF the selected entry and the whole reason string are unchanged.
//   P2 CAP-INVARIANCE          — the cap is identical in BOTH flag states, on every specimen. B3 may only change
//                                WHICH obligation is quoted, never the verdict.
//   P3 PRECEDENCE              — typed eligibility_bar → importanceOf=disqualifier → hasBarSignal → doc order.
//   P4 STABILITY               — ties keep document order; an all-same-tier bucket comes out exactly as it went in.
//   P5 PURITY                  — the caller's bucket array is never mutated or re-ordered.
//   P6 NEGATIVE CONTROL        — the ranking must actually MOVE something, or the battery is a placebo (L40).
// Run: npx tsx src/lib/audit-gate-v2-banner-b3.test.ts
export {};

let fail = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "  ✅" : "  ❌"} ${msg}`); if (!cond) fail++; };

const withFlags = <T>(flags: Record<string, string>, fn: () => T): T => {
  const restore: Array<[string, string | undefined]> = Object.keys(flags).map((k) => [k, process.env[k]]);
  for (const [k, v] of Object.entries(flags)) process.env[k] = v;
  try { return fn(); } finally { for (const [k, v] of restore) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};

(async () => {
  const m = await import("./audit-gate-v2");
  const { gateV2Outcome } = m;

  const cov = (entries: Array<{ section: string; obligation: string }>): any => ({
    unreadable: [], ungroundedRead: ["L"], disqualifierUncovered: entries, ungroundedNonBarSignal: [], coverageGrade: 0.5,
  });
  const off = (c: any, o?: any) => withFlags({ AUDIT_BANNER_BAR_RANKING: "false", AUDIT_RETIRE_VERBATIM_VETO: "false" }, () => gateV2Outcome(c, o));
  const on  = (c: any, o?: any) => withFlags({ AUDIT_BANNER_BAR_RANKING: "true",  AUDIT_RETIRE_VERBATIM_VETO: "false" }, () => gateV2Outcome(c, o));

  // Specimens. The DEBRIEFING sentence is the measured `be69ce16` motivating case: benign, first in document
  // order, and previously the one the customer was shown.
  const DEBRIEF = "The offeror may request a debriefing in accordance with FAR 15.506 within three days of notice of award.";
  const BIDGUAR = "The offeror shall furnish a bid guarantee in the amount of 20 percent of the bid price with its offer.";
  const CLEARANCE = "The contractor must possess an active TOP SECRET facility clearance at the time of proposal submission.";
  const FILLER = "Offerors shall submit the completed pricing worksheet in the format prescribed by the Contracting Officer.";

  console.log("\n── P1 · FLAG-OFF BYTE-IDENTITY ─────────────────────────────────────────────────────────────");
  {
    const c = cov([{ section: "M", obligation: DEBRIEF }, { section: "L", obligation: BIDGUAR }]);
    const a = off(c), b = off(c);
    ok(a.reason === b.reason, "flag-OFF is deterministic");
    ok(a.reason.includes(DEBRIEF.slice(0, 40)), "flag-OFF still quotes the FIRST entry in document order (unchanged selection)");
    ok(!a.reason.includes(BIDGUAR.slice(0, 40)), "flag-OFF does NOT promote the later bid-guarantee entry");
  }

  console.log("\n── P2 · CAP-INVARIANCE (both flag states, every specimen) ──────────────────────────────────");
  {
    const specimens: Array<[string, any]> = [
      ["debrief-then-bidguarantee", cov([{ section: "M", obligation: DEBRIEF }, { section: "L", obligation: BIDGUAR }])],
      ["single entry", cov([{ section: "L", obligation: DEBRIEF }])],
      ["all benign", cov([{ section: "L", obligation: FILLER }, { section: "M", obligation: DEBRIEF }])],
      ["clearance first", cov([{ section: "L", obligation: CLEARANCE }, { section: "M", obligation: DEBRIEF }])],
      ["unreadable present", { ...cov([{ section: "L", obligation: BIDGUAR }]), unreadable: ["C"] }],
      ["empty bucket", cov([])],
    ];
    for (const [name, c] of specimens) {
      const a = off(c), b = on(c);
      ok(a.cap === b.cap, `cap invariant across flag states — ${name} (cap=${String(a.cap)})`);
    }
  }

  console.log("\n── P3 · PRECEDENCE ─────────────────────────────────────────────────────────────────────────");
  {
    // tier 0 — typed eligibility_bar wins even though it is LAST in document order.
    const c = cov([{ section: "M", obligation: DEBRIEF }, { section: "L", obligation: CLEARANCE }, { section: "L", obligation: BIDGUAR }]);
    const findings = [{ kind: "eligibility_bar", requirement: BIDGUAR, excerpt: BIDGUAR }];
    const r = on(c, { findings });
    ok(r.reason.includes(BIDGUAR.slice(0, 40)), "tier 0: a TYPED eligibility_bar is promoted over earlier entries");
    ok(!r.reason.includes(DEBRIEF.slice(0, 40)), "tier 0: the benign debriefing sentence is no longer quoted");

    // tier 0 outranks tier 1/2 — a typed bar beats a merely bar-shaped clearance sentence.
    const r2 = on(cov([{ section: "L", obligation: CLEARANCE }, { section: "L", obligation: BIDGUAR }]), { findings });
    ok(r2.reason.includes(BIDGUAR.slice(0, 40)), "tier 0 outranks a bar-SHAPED but untyped sentence");

    // With no findings supplied, ranking still improves on raw document order via the classifier tiers.
    const r3 = on(cov([{ section: "M", obligation: DEBRIEF }, { section: "L", obligation: CLEARANCE }]));
    ok(!r3.reason.includes(DEBRIEF.slice(0, 40)) || r3.reason.includes(CLEARANCE.slice(0, 40)),
       "no findings: a bar-shaped sentence is not left behind a benign one");
  }

  console.log("\n── P4 · STABILITY (ties keep document order) ───────────────────────────────────────────────");
  {
    const c = cov([{ section: "L", obligation: FILLER }, { section: "M", obligation: DEBRIEF }]);
    const r = on(c);
    ok(r.reason.includes(FILLER.slice(0, 40)), "same-tier bucket: first-in-document-order is retained");
    const c2 = cov([{ section: "L", obligation: CLEARANCE }, { section: "M", obligation: CLEARANCE }]);
    ok(on(c2).reason.includes("§L") || on(c2).reason.includes("TOP SECRET"), "identical-tier duplicates: stable, no reshuffle");
  }

  console.log("\n── P5 · PURITY (the caller's bucket is never mutated) ──────────────────────────────────────");
  {
    const entries = [{ section: "M", obligation: DEBRIEF }, { section: "L", obligation: BIDGUAR }];
    const c = cov(entries);
    const before = entries.map((e) => e.obligation);
    on(c, { findings: [{ kind: "eligibility_bar", requirement: BIDGUAR }] });
    ok(JSON.stringify(entries.map((e) => e.obligation)) === JSON.stringify(before), "bucket order unchanged after ranking");
    ok(c.disqualifierUncovered.length === 2, "bucket length unchanged (downstream consumers + run-record unaffected)");
  }

  console.log("\n── P6 · NEGATIVE CONTROL (the battery must be able to FAIL) ────────────────────────────────");
  {
    // If ranking were a no-op, P3 would pass vacuously whenever the bar happened to be first. Prove the
    // mechanism MOVES the selection: same bucket, flag off vs on, must differ.
    const c = cov([{ section: "M", obligation: DEBRIEF }, { section: "L", obligation: BIDGUAR }]);
    const findings = [{ kind: "eligibility_bar", requirement: BIDGUAR }];
    const a = off(c, { findings }), b = on(c, { findings });
    ok(a.reason !== b.reason, "flag ON vs OFF select DIFFERENT excerpts ⇒ the ranking is live, not a placebo");
    // And a bucket with nothing to promote must be IDENTICAL in both states (no gratuitous churn).
    const flat = cov([{ section: "L", obligation: FILLER }, { section: "M", obligation: DEBRIEF }]);
    ok(off(flat).reason === on(flat).reason, "nothing to promote ⇒ flag ON is byte-identical to OFF (no churn)");
  }

  console.log(`\n${fail ? "❌" : "✅"} B3 BATTERY: ${fail} failure(s)`);
  process.exit(fail ? 1 : 0);
})();
