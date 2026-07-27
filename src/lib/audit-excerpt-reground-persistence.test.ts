// ARC #747 · E1 — WHAT THE RE-GROUNDING PASS IS ALLOWED TO REACH.
// Run: npx tsx src/lib/audit-excerpt-reground-persistence.test.ts
//
// Round 3 of /code-review high on PR #292 found that moving the head pass past `deriveVerdict` protected the
// LIVE verdict and nothing else. Two sets of objects escaped the reasoning:
//
//   #1  `inputs` was built as `{ findings, … }` — the SAME array and the SAME objects the pass mutates in
//       place. `audit-run-record.ts` persists `inputs` and REPLAYS `deriveVerdict(rec.result.inputs)`, so a
//       span widened for the reader travelled into the banked record and got re-decided there.
//   #2  `deriveVerdict` decides on COPIES (`dispositions` = `deciding.map(f => ({...f, disposition}))`,
//       `showStoppers` a subset), taken BEFORE the pass runs. The v3 payload persists the show-stopper band
//       from those copies — so the restored head reached every part of the report except the tile the
//       founding clipped excerpt actually renders in.
//
// Both are the same mistake in two places: "post-verdict" describes WHEN the pass runs, not WHICH objects it
// can still be observed through. These assertions are about reach, so they hold whatever the pass decides.
export {};
import { repairHeadClippedExcerpts, applyHeadRepairsTo, analyzedExcerptOf } from "./audit-excerpt-repair";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

// Verbatim from the stored raw_pdf_text of audit d0664ba2 (SPRRA2-26-R-0034) — the C1 line gate 4 graded.
const SOURCE =
  "The offeror shall comply with DFARS 215-2, Instructions to Offerors, in preparing its proposal. " +
  "Proposals that omit the required volumes will not be evaluated.";
const CLIPPED = "15-2, Instructions to Offerors, in preparing its proposal.";

const mkFinding = (over: Partial<TypedFinding> = {}): TypedFinding => ({
  id: "c1", lens: "instructions", kind: "submission_requirement",
  requirement: "Comply with the instructions to offerors", citation: "DFARS 215-2",
  excerpt: CLIPPED, severity: "P1", controllability: "bidder_can_move", grounded: true,
  ...over,
} as TypedFinding);

// ── The pass must be ARMED for any of this to be observable. ─────────────────────────────────────────
process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";

// ── #1 · THE BANKED INPUTS ARE THE ANALYZED INPUTS ───────────────────────────────────────────────────
{
  const findings = [mkFinding()];
  // Exactly what the orchestrator now does at the `inputs` construction: a per-finding snapshot.
  const bankedInputs = { findings: findings.map((f) => ({ ...f })) };
  const res = repairHeadClippedExcerpts(findings, SOURCE);

  check("the pass still repairs the founding clipped head", res.repaired === 1,
    `repaired=${res.repaired} unrepairable=${res.unrepairable}`);
  check("the reader's copy carries the restored head",
    findings[0].excerpt.startsWith("The offeror shall comply with DFARS 215-2"),
    `got: ${findings[0].excerpt.slice(0, 70)}`);
  check("#1 the BANKED inputs still hold the excerpt the verdict was derived from",
    bankedInputs.findings[0].excerpt === CLIPPED,
    `banked excerpt was rewritten to: ${bankedInputs.findings[0].excerpt.slice(0, 70)}`);
  check("#1 replaying deriveVerdict off the bank would see the ORIGINAL span, not the widened one",
    !bankedInputs.findings[0].excerpt.includes("The offeror shall comply"),
    "the widened span reached the record that gets re-decided on replay");
  check("the analyzed span is still recoverable from the reader's copy",
    analyzedExcerptOf(findings[0]) === CLIPPED,
    `analyzedExcerptOf returned: ${analyzedExcerptOf(findings[0]).slice(0, 70)}`);
}

// ── #2 · THE SHOW-STOPPER BAND GETS THE SAME SPAN THE BODY DOES ──────────────────────────────────────
{
  const findings = [mkFinding({ controllability: "bidder_cannot_move", severity: "P0" })];
  // deriveVerdict's copies are taken BEFORE the pass runs — that ordering is the defect, so reproduce it.
  const showStoppers = findings.map((f) => ({ ...f, disposition: "disqualifying" }));
  const res = repairHeadClippedExcerpts(findings, SOURCE);
  const applied = applyHeadRepairsTo(showStoppers, res.changes);

  check("#2 the restored head propagates to the persisted show-stopper copy", applied === 1,
    `applied=${applied}`);
  check("#2 the show-stopper tile renders the same span as the finding body",
    showStoppers[0].excerpt === findings[0].excerpt,
    `stopper: ${showStoppers[0].excerpt.slice(0, 60)}\n     body:    ${findings[0].excerpt.slice(0, 60)}`);
  check("#2 the show-stopper copy can still answer what was ANALYZED",
    analyzedExcerptOf(showStoppers[0]) === CLIPPED,
    `analyzedExcerptOf returned: ${analyzedExcerptOf(showStoppers[0]).slice(0, 70)}`);
}

// ── #2b · PROPAGATION IS NOT A SECOND CHANCE TO WIDEN ────────────────────────────────────────────────
{
  // A finding the pass never touched must not be rewritten by the propagation step, and a refusal upstream
  // must stay a refusal downstream — the copies may only ever receive a span the pass itself accepted.
  const untouched = [{ id: "other", lens: "pricing", excerpt: "wholly unrelated excerpt text" }];
  const applied = applyHeadRepairsTo(untouched, [{ id: "c1", lens: "instructions", before: CLIPPED, after: "WIDENED" }]);
  check("#2b a finding absent from `changes` is left exactly as emitted",
    applied === 0 && untouched[0].excerpt === "wholly unrelated excerpt text",
    `applied=${applied} excerpt=${untouched[0].excerpt}`);

  // Same lens + same pre-repair excerpt but a DIFFERENT id must not cross-apply.
  const wrongId = [{ id: "different", lens: "instructions", excerpt: CLIPPED }];
  const applied2 = applyHeadRepairsTo(wrongId, [{ id: "c1", lens: "instructions", before: CLIPPED, after: "WIDENED" }]);
  check("#2b a different finding quoting the same line does not inherit the repair",
    applied2 === 0 && wrongId[0].excerpt === CLIPPED,
    `applied=${applied2} excerpt=${wrongId[0].excerpt}`);
}

// ── #2c · IDEMPOTENCE — a second propagation must not overwrite the true original ────────────────────
{
  const findings = [mkFinding()];
  const stoppers = findings.map((f) => ({ ...f }));
  const res = repairHeadClippedExcerpts(findings, SOURCE);
  applyHeadRepairsTo(stoppers, res.changes);
  const second = applyHeadRepairsTo(stoppers, res.changes);
  check("#2c re-applying the same change is a no-op and preserves the analyzed span",
    second === 0 && analyzedExcerptOf(stoppers[0]) === CLIPPED,
    `second=${second} analyzed=${analyzedExcerptOf(stoppers[0]).slice(0, 60)}`);
}

// ── #4 · SKIP TELEMETRY COUNTS PREVENTED REPAIRS, NOT NON-EVENTS ─────────────────────────────────────
{
  // The tail pass's verified-skip guard sat BEFORE the truncation test, so every verified finding landed in
  // `skipped` whether or not it had anything to repair — inflating the number an operator reads while arming.
  const { repairClippedExcerpts } = require("./audit-excerpt-repair") as typeof import("./audit-excerpt-repair");
  const verifiedIntact = [{
    id: "v1", lens: "instructions", kind: "submission_requirement", requirement: "r",
    citation: "DFARS 215-2", excerpt: "A complete, untruncated sentence that ends properly.",
    severity: "P1", controllability: "bidder_can_move", grounded: true,
    verifiedBy: { excerptHash: "deadbeef" },
  } as unknown as TypedFinding];
  const res = repairClippedExcerpts(verifiedIntact, SOURCE);
  check("#4 a verified finding with nothing to repair is not reported as a skip",
    res.skipped.length === 0,
    `skipped=${JSON.stringify(res.skipped)}`);
}

// ── CALL-SITE TRIPWIRES ──────────────────────────────────────────────────────────────────────────────
// Everything above proves the PATTERN is sound. It cannot prove the orchestrator uses it — the defect being
// regressed lives in two specific lines of a function too large to invoke without a full audit context. So
// these read the source. That is a weaker instrument and is labelled as one: it catches the exact reversion
// (someone "simplifying" the copy back into a shared reference), not every way the property could be lost.
{
  const src = require("fs").readFileSync(require("path").join(__dirname, "audit-orchestrator.ts"), "utf8") as string;
  const inputsLine = src.split("\n").find((l) => l.includes("const inputs: VerdictInputs = {")) ?? "";
  check("tripwire · orchestrator banks a per-finding SNAPSHOT, not the live array",
    /findings:\s*findings\.map\(/.test(inputsLine),
    `inputs is built as: ${inputsLine.slice(0, 120)}`);
  check("tripwire · the pre-dedup diagnostic snapshot copies its findings too",
    /_preDedupFindings\s*=\s*_bankInstrOn\s*\?\s*findings\.map\(/.test(src),
    "preProcessingFindings is a .slice() — same objects, so the head pass rewrites the snapshot");
  check("tripwire · the head repair is propagated to decision.showStoppers",
    /applyHeadRepairsTo\(\s*\n?\s*\(decision as[^)]*showStoppers/.test(src),
    "showStoppers never receives the restored head — the founding excerpt renders clipped in its own tile");
}

console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
if (failures) process.exit(1);
