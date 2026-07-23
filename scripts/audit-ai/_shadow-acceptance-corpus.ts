// Phase-1 SHADOW · ACCEPTANCE CORPUS v1 (Brain #599-2) — the standing eval gold-set (#594 gap), v1.
// Purpose-built ~20-run set from BANKED REAL MATERIAL (Rule 64) testing BINDING-c cleanly: each specimen carries an
// EXPECTED verdict + category. One INELIGIBLE specimen is CONSTRUCTED from a real banked bar + an adversarial
// closed-world profile (a test fixture over real findings/source — no fabricated facts). Shadow-vs-expected table.
// ── ⚠ SUBSTRATE (Brain #692 · rule L40-D4) — THIS CORPUS RUNS ON THE REBUILT INSTRUMENT ────────────────────
// Every specimen's coverage ledger is RECOMPUTED from `result.coverage.attestations` under the stamped live
// configuration. The frozen `result.inputs.coverageV2` literal is NEVER read. Rationale, the four defects it
// fixes, the measurability rule and the self-validation are all in `_instrument.ts` — read that file before
// changing anything here. The A5 hand-written four-flag LIVE_PARITY block this replaces measured a
// configuration nobody runs; the instrument applies a banked live snapshot of all 89 worker `AUDIT_*` vars.
import { applyStampedConfig, configStamp, selfValidate, rebuildLedger, isFalseBid, isCommittal } from "./_instrument";

// VERDICT ARC v2 — the temporal specimens can only exercise the gate with its flag on. Safe for every other
// specimen BY CONSTRUCTION: the branch is inert unless `temporalSnapshot` AND `today` are threaded, and only
// the four temporal specimens carry them. Pinned BEFORE applyStampedConfig, which never overwrites an
// explicitly-set variable — and before any src/lib import, because several gates are module-load consts.
process.env.AUDIT_TEMPORAL_VERDICT = "true";
applyStampedConfig("live");

import { readFileSync } from "fs";
(async () => {
  // ── REBUILT SUBSTRATE ─────────────────────────────────────────────────────────────────────────────────────
  // The instrument self-validates (HARD-EXITS on failure) before a single specimen is built, then hands back
  // per-record inputs whose `coverageV2` is recomputed, plus a measurability stamp. `byId` refuses to build a
  // specimen on a NOT MEASURABLE record rather than quietly returning an empty ledger that reads as a pass.
  selfValidate();
  const ledger = await rebuildLedger();
  const byRecordId = new Map(ledger.map((r) => [r.id, r]));
  const { deriveShadowVerdict, deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  // card #609-(2)/(8): mirror production — the clause-keyed typing floor runs pre-deriveShadowVerdict when armed. The
  // corpus previously never exercised the floor (the #609-(8) corpus gap). Applied to every specimen's findings under
  // the same flag production reads, so the adversarial 8(a)/HUBZone/size specimens below actually pass through it.
  const flooredInp = (inp: any) => ({ ...inp, findings: applyClauseKeyedTypingFloor(inp.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) });
  const byId = (frag: string) => {
    const hits = [...byRecordId.values()].filter((r) => r.id.includes(frag));
    if (hits.length === 0) throw new Error(`no record for ${frag}`);
    if (hits.length > 1) throw new Error(`ambiguous fragment ${frag} → ${hits.map((h) => h.id).join(", ")}`);
    const r = hits[0];
    // D-2: never build a specimen on unmeasurable substrate. An empty recomputed ledger is indistinguishable
    // from a clean one, so a specimen resting on it would "pass" while measuring nothing (the placebo shape).
    if (r.measurable === "NOT MEASURABLE") throw new Error(`specimen ${frag} rests on NOT MEASURABLE substrate: ${r.why}`);
    return r.inputs;
  };
  const naicsOf = (inp: any) => { const m = (inp.source || "").match(/NAICS\s*(?:code)?[:\s#]*([0-9]{5,6})/i); return m ? m[1] : null; };

  // `requireNamedGate` (Brain ruling 2026-07-23, item 1): when a specimen COMMITS over a bidder-knowable
  // eligibility gate, the verdict is only acceptable if its reason NAMES the specific requirement. A committal
  // carrying a generic "confirm eligibility" is a DIFFERENT product behaviour from one that tells the reader
  // exactly which certification to check — and the corpus must be able to tell them apart, or the ruling is
  // unenforced. Each entry is a regex that MUST match the reason; a miss fails the specimen even if the
  // verdict is right.
  type Spec = { name: string; category: string; expected: string | string[]; inp: any; naics?: string | null; authoritative?: boolean; requireNamedGate?: RegExp[] };
  const specs: Spec[] = [
    // ── BIDDABLE → COMMIT (committal on genuinely self-clearable packages) ──
    // SUBSTRATE-IDENTITY DEFECT FOUND BY THE REBUILD (2026-07-23): the fragment "40fd02ce" matches TWO banked
    // records (`_dl-40fd02ce` and `_refire-40fd02ce`). The previous `byId` resolved fragments with `.find()`,
    // so this flagship specimen silently bound to whichever file `readdirSync` happened to return first —
    // an unstated, filesystem-order-dependent substrate choice inside the gold-set. The rebuilt `byId` REFUSES
    // an ambiguous fragment; the binding is now pinned explicitly to the download run, preserving the prior
    // (alphabetically-first) behaviour so this is a disambiguation, not a silent re-baselining.
    { name: "LBJ _dl-40fd02ce", category: "biddable/self-clearable", expected: "BID_WITH_CAUTION", inp: byId("_dl-40fd02ce"), naics: "561320" },
    { name: "FA303 df202699", category: "biddable/self-clearable", expected: ["BID_WITH_CAUTION", "BID"], inp: byId("df202699") },
    { name: "FA442 11d3815e", category: "biddable/self-clearable", expected: ["BID_WITH_CAUTION", "BID"], inp: byId("11d3815e") },
    { name: "FA442 5250f4c2", category: "biddable/self-clearable", expected: ["BID_WITH_CAUTION", "BID"], inp: byId("5250f4c2") },
    { name: "FA442 8b03b538", category: "biddable/self-clearable", expected: ["BID_WITH_CAUTION", "BID"], inp: byId("8b03b538") },
    // ── GENUINE-INCOMPLETE → honest-fail INCOMPLETE ──
    { name: "697DCK 9ce4e3fb", category: "genuine-incomplete", expected: "INCOMPLETE", inp: byId("9ce4e3fb") },
    { name: "FA8137 bf8832de", category: "genuine-incomplete (manifest)", expected: "INCOMPLETE", inp: byId("bf8832de") },
    // ── REAL UNCOVERED BAR (#557-class shape) → NHR ──
    // A5 (Brain step-4 ruling): the VETO-CLASS specimens run the REAL pole (`deriveVerdict`), never the shadow
    // pole. These are the specimens the coverage veto decides, so measuring them on the shadow pole measured a
    // verdict no customer receives — and on the real pole the veto is gated by `GATE_V2_ENABLED`, which is why
    // this only became exercisable once --config=live armed AUDIT_GATE_V2 to match the worker.
    { name: "LBJ 45f9bacd", category: "uncovered-disqualifier", expected: "NEEDS_HUMAN_REVIEW", inp: byId("45f9bacd"), naics: "561320", authoritative: true },
    { name: "FA8137 6439ac27", category: "uncovered-disqualifier", expected: "NEEDS_HUMAN_REVIEW", inp: byId("6439ac27"), authoritative: true },
    { name: "FA8137 be69ce16", category: "uncovered-disqualifier", expected: "NEEDS_HUMAN_REVIEW", inp: byId("be69ce16"), authoritative: true },
    // ── RULED RE-LABEL (Brain, 2026-07-23 · seam record 01 · NOT a quiet edit) ────────────────────────────────
    // WAS: expected NEEDS_HUMAN_REVIEW. The rebuilt instrument exposed that expectation as a FROZEN-ERA ARTIFACT.
    // The old NHR came from the veto firing on 12 frozen `disqualifierUncovered` rows that are NOT eligibility
    // bars at all (GAO protest procedure · FASCSA · covered-telecom reps); today they correctly demote to
    // `ungroundedNonBarSignal`. The engine was reaching the right verdict FOR THE WRONG REASON, and the veto's
    // "catch" here is INCIDENTAL — it does not count as a genuine unique catch for the retirement criterion.
    //
    // RULING BASIS — the discriminator is **BIDDER-KNOWABILITY**, not certification mechanics. NHR is justified
    // only where human review can ADD INFORMATION. A firm's own 8(a) status is known to it with certainty, so
    // abstaining adds nothing and manufactures the NHR-on-common-set-asides product failure. Fail-toward-
    // disqualifier governs ambiguity about whether a bar EXISTS; here the bar is CERTAIN and bidder-resolvable —
    // the ratified clears-as-declared shape (set-aside backstop `requiredAttribute` + #575). The WOSB BWC
    // specimens elsewhere in this corpus were correct all along; this NHR expectation was the inconsistency.
    //
    // The caveat must NAME the gate (SBA-certified 8(a) participant per FAR 52.219-18, fetched 2026-07-23:
    // "Offers are solicited only from — (1) Small business concerns expressly certified by the [SBA]").
    // A generic "confirm eligibility" does NOT satisfy this specimen — see the assertion after the run loop.
    { name: "70B01C 999e909b (8(a) set-aside — bidder-knowable)", category: "bidder-knowable-setaside/BWC", expected: "BID_WITH_CAUTION", inp: byId("999e909b"), authoritative: true,
      requireNamedGate: [/8\s?\(a\)/i, /\bSBA\b/, /52\.219-18/] },
    // ── BINDING-a UNKNOWN (untyped deciding bar) → NHR ──
    { name: "FA8137 316acfa5", category: "BINDING-a untyped→NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("316acfa5") },
    { name: "FA303 e83887af", category: "BINDING-a untyped→NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("e83887af") },
    { name: "FA303 7bf73cbd", category: "BINDING-a untyped→NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("7bf73cbd") },
    { name: "SPMYM226 (real credential bar)", category: "non-self-clearable/NHR", expected: "NEEDS_HUMAN_REVIEW", inp: byId("SPMYM226") },
  ];

  // ── CERT EXHIBIT (Brain #642-(4)) — the CLOSED-WORLD HALF of the no-false-INELIGIBLE guarantee, cited + permanent.
  // seq-4's open-world half proves "real set-aside → NEEDS_HUMAN_REVIEW (never false-INELIGIBLE)"; this exhibit proves
  // the OTHER half: when the firm's status IS knowable (closed-world profile lacking the required program cert), the
  // engine COMMITS to a literal INELIGIBLE — the two halves are one guarantee. Rule 64: real bar + real source (a
  // FA303 run finding), adversarial CLOSED-WORLD test profile. Expected is STRICT INELIGIBLE (not the loose either-or):
  // this is a behavior LOCK — if this ever returns NHR the closed-world half regressed and the gate MUST break.
  const base = JSON.parse(JSON.stringify(byId("5d0477e7"))); // FA303 run the shadow commits to BWC on 9 self-cert socioeconomic bars
  const barWithAttr = (base.findings as any[]).find((f) => f.kind === "eligibility_bar" && f.requiredAttribute);
  if (barWithAttr) {
    base.bidderProfile = { closedWorld: true, satisfiedAttributes: [], held: [], name: "TEST: small biz lacking the required program cert" };
    specs.push({ name: `CERT EXHIBIT #642-4 — closed-world set-aside COMMITS to INELIGIBLE (real bar '${String(barWithAttr.requiredAttribute).slice(0,24)}' + closed-world firm lacking it)`, category: "real-INELIGIBLE preserved", expected: "INELIGIBLE", inp: base });
  }

  // ── ADVERSARIAL FALSE-BID CORPUS (card #609-(8)) — the typing floor MUST NOT demote a real eligibility bar to a
  // curable gate. Each specimen injects an eligibility bar into a biddable base + a closed-world profile lacking it;
  // with the floor ON the verdict must NEVER commit (BID/BWC). Attribute-bearing bars test part-1 (exempt); the
  // attribute-LESS 8a-in-SAM / size-standard bars test part-2 (shape regex must not match a bare topic mention).
  const advBar = (over: any) => ({ id: `adv_${over.tag}`, kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, ...over });
  const advSpecs: Array<{ name: string; bar: any }> = [
    { name: "ADV 8(a) (attr) → never BID", bar: advBar({ tag: "8a", requiredAttribute: "8a_certification", requirement: "Offeror must be a certified 8(a) participant", excerpt: "This is an 8(a) sole-source set-aside; only certified 8(a) firms may be awarded." }) },
    { name: "ADV HUBZone (attr) → never BID", bar: advBar({ tag: "hz", requiredAttribute: "hubzone", requirement: "Offeror must be a certified HUBZone small business", excerpt: "HUBZone set-aside; non-HUBZone firms are ineligible for award." }) },
    { name: "ADV size-standard (attr) → never BID", bar: advBar({ tag: "sz", requiredAttribute: "small_business", requirement: "Offeror must be small under the size standard", excerpt: "Firms exceeding the small business size standard are ineligible." }) },
    { name: "ADV licensure-must-hold → never BID", bar: advBar({ tag: "lic", requiredAttribute: "state_license", requirement: "Offeror must hold current state professional licensure at time of award", excerpt: "The firm must currently hold state professional licensure as a condition of award." }) },
    { name: "ADV 8a-in-SAM (attr-less topic) → never BID", bar: advBar({ tag: "8asam", requirement: "Offeror must be a certified 8(a) firm listed in the System for Award Management", excerpt: "Only 8(a) certified firms, listed in the System for Award Management, are eligible." }) },
  ];
  for (const a of advSpecs) {
    const adv = JSON.parse(JSON.stringify(byId("5d0477e7")));
    adv.findings = [...(adv.findings as any[]), a.bar];
    adv.bidderProfile = { closedWorld: true, satisfiedAttributes: [], held: [], name: "TEST: firm lacking the injected eligibility credential" };
    specs.push({ name: a.name, category: "adversarial-falseBID", expected: ["INELIGIBLE", "NEEDS_HUMAN_REVIEW"], inp: adv });
  }

  // ── ROOT-2 (Brain #648) — EXISTS-denominator completeness, tested on the AUTHORITATIVE deriveVerdict pole
  // (the field ROOT-2 sets, `documentsComplete`, is retired on the shadow pole — see the ⚠ Phase-2 dependency at
  // audit-decide.ts:3150). A degraded package (v3 dropped docs → agenticManifestComplete false → documentsComplete
  // false) MUST cap to INCOMPLETE, never a committal over a stub; a lean package that reads fully MUST NOT be
  // false-INCOMPLETE. Base = a real biddable record's inputs; only the completeness flag is overridden (Rule 64). ──
  {
    // Coverage-clean base (real biddable findings/source, self-clearable → BWC) so `documentsComplete` is the SOLE
    // deciding completeness axis — isolates exactly what ROOT-2 sets (the other completeness gates are cleared).
    const b = JSON.parse(JSON.stringify(byId("df202699")));
    const cleanBase: any = { ...b, coverageComplete: true };
    delete cleanBase.coverageV2;
    const stub = { ...cleanBase, documentsComplete: false };
    specs.push({ name: "ROOT-2 stub-degraded (docs_complete=false) → INCOMPLETE", category: "root2-exists/incomplete", expected: "INCOMPLETE", inp: stub, authoritative: true });
    const lean = { ...cleanBase, documentsComplete: true };
    specs.push({ name: "ROOT-2 lean-complete (docs_complete=true) → not false-INCOMPLETE", category: "root2-exists/biddable", expected: ["BID", "BID_WITH_CAUTION"], inp: lean, authoritative: true });
  }

  // ── VERDICT ARC v2 (Brain #668) — TEMPORAL specimens, on the AUTHORITATIVE pole (deriveVerdict owns the temporal
  // branch). The panel NON-NEGOTIABLE under test: a SNAPSHOT date may never drive NO_BID — only a verdict-time
  // LIVE-SAM confirmation may, and only over a complete ingested amendment set. A false CLOSED is SILENTLY FATAL
  // (the customer never bids a live solicitation and never learns why), so the guard specimens matter more than the
  // true positive. Base = a real biddable record (Rule 64); only the temporal bundle is injected. ──
  {
    const tBase = () => { const b = JSON.parse(JSON.stringify(byId("df202699"))); b.coverageComplete = true; delete b.coverageV2; b.documentsComplete = true; return b; };
    const TODAY = "2026-07-22";
    // FIXTURE DOCTRINE (Brain RULING 4): SAM-format datetimes + a verdict-time INSTANT. The prior date-only
    // deadlines were a format SAM never emits — which is precisely why this gold-set was blind to ULTRA B2 F1.
    const NOW_ISO = "2026-07-22T12:00:00Z";
    // snapshot says the deadline is 30d PAST (the shape that used to be read as "closed")
    const snapPast: any = { today: TODAY, responseDeadline: "2026-06-22T13:00:00-04:00", responseDeadlinePast: true, mandatoryEventDates: [], mandatoryEventPast: null, latestFutureDeadline: null, daysToResponse: -30 };

    // (a) FALSE-CLOSED GUARD — snapshot past, but the LIVE record is active with a future (amended) deadline. The
    // missing doc WAS the extending amendment. Must pass through to a committal; NO_BID here is the fatal defect.
    specs.push({ name: "TEMPORAL snapshot-CLOSED + live-OPEN → never NO_BID", category: "temporal/false-closed-guard (biddable)", expected: ["BID", "BID_WITH_CAUTION"], authoritative: true,
      inp: { ...tBase(), temporalSnapshot: snapPast, liveSam: { fetched: true, active: true, responseDeadline: "2026-08-15T10:00:00-04:00", amendmentCount: 2 }, ingestedAmendmentComplete: true, today: TODAY, nowIso: NOW_ISO } });

    // (b) LIVE-FETCH FAILED → currency unconfirmable → INDETERMINATE → INCOMPLETE. Never NO_BID (no live proof),
    // never a clean committal (we cannot certify the sol is still open).
    specs.push({ name: "TEMPORAL snapshot-CLOSED + live UNFETCHED → INCOMPLETE", category: "temporal/indeterminate", expected: "INCOMPLETE", authoritative: true,
      inp: { ...tBase(), temporalSnapshot: snapPast, liveSam: null, ingestedAmendmentComplete: true, today: TODAY, nowIso: NOW_ISO } });

    // (c) LIVE-ACTIVE but the ingested amendment set is INCOMPLETE → an unread amendment can extend the deadline or
    // remove a bar → INCOMPLETE, never a committal over an unread amendment.
    specs.push({ name: "TEMPORAL live-open + amendments UNREAD → INCOMPLETE", category: "temporal/indeterminate", expected: "INCOMPLETE", authoritative: true,
      inp: { ...tBase(), temporalSnapshot: snapPast, liveSam: { fetched: true, active: true, responseDeadline: "2026-08-15T10:00:00-04:00", amendmentCount: 3 }, ingestedAmendmentComplete: false, today: TODAY, nowIso: NOW_ISO } });

    // (d) TRUE POSITIVE — live-confirmed ARCHIVED over a complete amendment set → NO_BID(CLOSED). Guards the other
    // direction: the gate must actually fire, or the whole temporal move is inert.
    specs.push({ name: "TEMPORAL live-ARCHIVED + amendments complete → NO_BID", category: "temporal/true-closed", expected: "NO_BID", authoritative: true,
      inp: { ...tBase(), temporalSnapshot: snapPast, liveSam: { fetched: true, active: false, responseDeadline: "2026-06-22T13:00:00-04:00", amendmentCount: 1 }, ingestedAmendmentComplete: true, today: TODAY, nowIso: NOW_ISO } });
  }

  // ── BAR-WEARING BOILERPLATE — universal clause text that WEARS the clothing of a pre-award possession bar
  // (52.204-7 SAM registration: "An Offeror is required to be registered in SAM when submitting an offer") but is
  // NOT a bar. It appears in ~every solicitation (measured: 10/17 distinct banked sources), so any gate that fires
  // on it fires on EVERYTHING — the universal-fire trap the #668 panel named by construction. Direction: this is an
  // OVER-fire guard; it must COMMIT. Standing regression line for the move-4 hard-bar floor before it may arm. ──
  {
    const b = JSON.parse(JSON.stringify(byId("df202699")));
    const boiler: any = { ...b, coverageComplete: true, documentsComplete: true };
    delete boiler.coverageV2;
    boiler.source = `${b.source || ""}\n\n52.204-7 SYSTEM FOR AWARD MANAGEMENT. An Offeror is required to be registered in SAM when submitting an offer or quotation, and shall continue to be registered until time of award.\n252.204-7019 The Offeror shall have a current assessment on record in SPRS prior to award.\n52.219-6 Notice of Total Small Business Set-Aside (NOV 2020) Yes`;
    specs.push({ name: "BAR-WEARING BOILERPLATE (52.204-7/SPRS) → still commits", category: "over-fire-guard/biddable", expected: ["BID", "BID_WITH_CAUTION"], inp: boiler, authoritative: true });
  }

  // ── CONFIGURATION STAMP + RULER — SINGLE-SOURCED TO THE INSTRUMENT ────────────────────────────────────────
  // Both the full-enumeration config stamp (D-3) and the false-BID ruler (A5) used to live here as local copies.
  // They now come from `_instrument.ts`, which self-validates them against known-answer specimens before this
  // corpus is allowed to measure anything (`selfValidate()` above, HARD-EXITS). A local copy is exactly how a
  // second, silently-divergent definition of "false-BID" gets born — the arc has already paid that bill once.

  // ── A1+ · REGISTER PROBE (Brain step-4 ruling item 4 / AMENDMENT A1) ───────────────────────────────────────
  // Labelled specimens for all four card-#680 registers, in BOTH the modal-verb and verb-less variants (the
  // "lexical accident" axis: whether the drafter happened to use one of `obligationsOf`'s eight duty verbs).
  //
  // WHY THIS RUNS AT THE BUILD LAYER, not as ordinary corpus specimens: 30/40 banked records carry a FROZEN
  // `coverageV2` and none carry raw attestations, so injecting register prose into a record's `source` would
  // never reach the ledger — the specimen would "pass" while measuring nothing. This probe therefore exercises
  // the real build path (`obligationsOf` → `importanceOf`/`hasBarSignal` → bucket → `gateV2Outcome`).
  //
  // STAMPS (A1): a register whose bucket is EMPTY IN BOTH FLAG STATES is **NOT PROTECTED — UNOWNED**. It is never
  // a pass. Zero deltas over an empty bucket is absence of measurement, never evidence of safety.
  const registerProbe = async () => {
    const { importanceOf, hasBarSignal, gateV2Outcome } = await import("../../src/lib/audit-gate-v2");
    // obligationsOf replicated VERBATIM from audit-orchestrator.ts (not exported).
    const obligationsOf = (t: string) => t.split(/(?<=[.;\n])/).map((s) => s.trim())
      .filter((s) => s.length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s));
    const SPECIMENS: Array<{ reg: string; variant: "modal-verb" | "verb-less"; text: string }> = [
      { reg: "R1 enumerated (1)/(2)/(3)", variant: "modal-verb",
        text: "To be eligible for award, an offeror must: (1) be registered in SAM; (2) possess an active TOP SECRET facility clearance at the time of proposal submission; (3) hold a current FAA Part 145 certificate." },
      { reg: "R1 enumerated (1)/(2)/(3)", variant: "verb-less",
        text: "Eligibility for award: (1) active SAM registration; (2) an active TOP SECRET facility clearance as of the proposal due date; (3) a current FAA Part 145 certificate." },
      { reg: "R2 submit-proof §L", variant: "modal-verb",
        text: "Offerors shall submit a copy of their current FAA Part 145 Repair Station Certificate with their quotation." },
      { reg: "R2 submit-proof §L", variant: "verb-less",
        text: "A copy of the offeror's current FAA Part 145 Repair Station Certificate is due with the quotation." },
      { reg: "R3 acceptability-gate §M", variant: "modal-verb",
        text: "An active CMMC Level 2 certification is required for award; proposals from offerors without one will be rated technically unacceptable." },
      { reg: "R3 acceptability-gate §M", variant: "verb-less",
        text: "Proposals from offerors lacking an active CMMC Level 2 certification will not be evaluated." },
      { reg: "R4a SF1449 block 10 (set-aside)", variant: "modal-verb",
        text: "The offeror must be a small business concern under NAICS 541519; this acquisition is set aside for small business." },
      { reg: "R4a SF1449 block 10 (set-aside)", variant: "verb-less",
        text: "Set-aside: 100% small business. NAICS 541519." },
      { reg: "R4b DD-254 block 1", variant: "modal-verb",
        text: "The contractor shall comply with the attached DD Form 254; a SECRET facility clearance is required." },
      { reg: "R4b DD-254 block 1", variant: "verb-less",
        text: "DD Form 254, block 1 — Facility Clearance Required: SECRET." },
    ];
    const withEnv = <T>(k: string, v: string, fn: () => T): T => {
      const prev = process.env[k]; process.env[k] = v;
      try { return fn(); } finally { if (prev === undefined) delete process.env[k]; else process.env[k] = prev; }
    };
    console.log(`\n── A1+ REGISTER PROBE — ${SPECIMENS.length} labelled specimens (4 registers × modal-verb / verb-less) ──`);
    console.log(`${"REGISTER".padEnd(34)} ${"VARIANT".padEnd(11)} ${"ENUM".padEnd(5)} ${"BUCKET".padEnd(7)} ${"VETO-INTACT".padEnd(12)} ${"RETIRED".padEnd(8)} STAMP`);
    const results: Array<{ reg: string; variant: string; stamp: string }> = [];
    for (const s of SPECIMENS) {
      const obs = obligationsOf(s.text);
      const bucketed = obs.filter((o) => importanceOf(o) === "disqualifier" || (importanceOf(o) === "ambiguous" && hasBarSignal(o)));
      const cov: any = { unreadable: [], ungroundedRead: [], disqualifierUncovered: bucketed.map((o) => ({ section: "L", obligation: o })), coverageGrade: 1 };
      const capIntact = withEnv("AUDIT_RETIRE_VERBATIM_VETO", "false", () => gateV2Outcome(cov).cap);
      const capRetired = withEnv("AUDIT_RETIRE_VERBATIM_VETO", "true", () => gateV2Outcome(cov).cap);
      // A1 stamp: empty bucket in both flag states ⇒ the register cannot be measured at all ⇒ NOT PROTECTED.
      const stamp = bucketed.length === 0 ? "⛔ NOT PROTECTED — UNOWNED"
        : capIntact === "NEEDS_HUMAN_REVIEW" && capRetired === null ? "✅ PROTECTED BY THE VETO (lost on retirement)"
        : capIntact === "NEEDS_HUMAN_REVIEW" ? "✅ PROTECTED"
        : "⛔ NOT PROTECTED";
      results.push({ reg: s.reg, variant: s.variant, stamp });
      console.log(`${s.reg.padEnd(34)} ${s.variant.padEnd(11)} ${String(obs.length).padEnd(5)} ${String(bucketed.length).padEnd(7)} ${String(capIntact).padEnd(12)} ${String(capRetired).padEnd(8)} ${stamp}`);
    }
    const unowned = results.filter((r) => r.stamp.includes("UNOWNED") || r.stamp.startsWith("⛔"));
    console.log(`\nREGISTER COVERAGE: ${results.length - unowned.length}/${results.length} specimens PROTECTED · ${unowned.length} stamped NOT PROTECTED`);
    if (unowned.length) console.log(`  NOT PROTECTED → ${unowned.map((r) => `${r.reg}[${r.variant}]`).join(" · ")}`);
    console.log("  (A1: an UNOWNED register can never contribute to satisfying the gate — absence of measurement is not safety.)");
  };

  // ── run ──
  let pass = 0; const rows: any[] = [];
  for (const s of specs) {
    let sv: any;
    try {
      sv = s.authoritative
        ? deriveVerdict(flooredInp(s.inp))
        : deriveShadowVerdict(flooredInp(s.inp), { naics: s.naics ?? naicsOf(s.inp) });
    } catch (e) { sv = { verdict: "THREW", reason: String(e) }; }
    const exp = Array.isArray(s.expected) ? s.expected : [s.expected];
    // NAMED-GATE CHECK — a right verdict with a generic reason FAILS. See `requireNamedGate` on the Spec type.
    const missingGate = (s.requireNamedGate ?? []).filter((re) => !re.test(sv.reason || ""));
    if (missingGate.length) sv = { ...sv, verdict: `${sv.verdict}/UNNAMED-GATE`, reason: `caveat does not name ${missingGate.map((r) => r.source).join(" + ")} — ${sv.reason || ""}` };
    const ok = exp.includes(sv.verdict);
    if (ok) pass++;
    rows.push({ ok, name: s.name, cat: s.category, expected: exp.join("|"), got: sv.verdict, reason: (sv.reason || "").slice(0, 54) });
  }
  console.log(`\n${"".padEnd(2)} ${"SPECIMEN".padEnd(40)} ${"CATEGORY".padEnd(28)} ${"EXPECTED".padEnd(24)} GOT`);
  console.log("─".repeat(150));
  for (const r of rows) console.log(`${r.ok ? "✅" : "❌"} ${r.name.padEnd(40)} ${r.cat.padEnd(28)} ${r.expected.padEnd(24)} ${r.got.padEnd(18)} ${r.reason}`);
  console.log("\n" + "═".repeat(50));
  console.log(`ACCEPTANCE CORPUS v1: ${pass}/${rows.length} specimens match expected`);
  console.log(`CONFIGURATION:\n${configStamp()}`);

  // ── A5 — THE FIXED RULER (Brain step-4 ruling, 2026-07-22) ──────────────────────────────────────────────────
  // DEFECT (card #682, red-team): the false-BID counter keyed on CATEGORY SUBSTRINGS
  //   r.cat.includes("INELIGIBLE"|"uncovered"|"BINDING-a"|"non-self"|"adversarial")
  // so every category outside that list counted ZERO by construction — `real-bar/NHR`, `genuine-incomplete`,
  // `genuine-incomplete (manifest)`, `temporal/indeterminate`, `temporal/true-closed`, `root2-exists/incomplete`.
  // A specimen expected to escalate could commit and the ruler would report FALSE-BIDs = 0. A gate cannot be
  // measured by an instrument that is blind to most of the corpus.
  // FIX: false-BID is now VERDICT-LEVEL TRUTH and category-independent — a specimen is a false-BID iff it
  // COMMITTED while its EXPECTED set contains no committal verdict. Categories are display metadata only; adding
  // a specimen in a new category can never again silently escape the counter.
  const falseBid = rows.filter((r) => isFalseBid(r.expected.split("|"), r.got));
  console.log(`FALSE-BIDs (committed a specimen whose expected set has NO committal verdict): ${falseBid.length} ${falseBid.length ? "❌ " + falseBid.map((r) => r.name).join("; ") : "✅"}`);
  console.log(`biddable specimens committed: ${rows.filter((r) => r.cat.includes("biddable") && isCommittal(r.got)).length}/${rows.filter((r) => r.cat.includes("biddable")).length}`);
  // Coverage of the counter itself — how much of the corpus it can actually see (the old one saw ~half).
  const escalationSpecs = rows.filter((r) => !r.expected.split("|").some((e) => isCommittal(e)));
  console.log(`counter coverage: ${escalationSpecs.length}/${rows.length} specimens are escalation-expected and therefore FALSE-BID-measurable`);
  await registerProbe();
  process.exit(pass === rows.length ? 0 : 1);
})();
