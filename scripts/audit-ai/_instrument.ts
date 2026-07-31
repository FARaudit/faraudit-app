// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE INSTRUMENT (Brain #692 §5 · rule L40-D4 · BLOCKING UNIT of the Verdict Arc)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS. The acceptance corpus replayed a **FROZEN `coverageV2`** carried inside each banked record's
// `result.inputs`. Those literals were computed by whatever engine + flag set existed on the day the run was
// banked — for 15/44 records, under `AUDIT_AMBIGUOUS_SIGNAL_DEMOTION=false` while live is `true`; for the
// oldest, before the `ungroundedNonBarSignal` key even existed. Rule **L40-D4 (substrate parity)**: a fixture
// is evidence only if its substrate is what the CURRENT engine would produce. Under D4 a frozen-substrate
// measurement is void **in both directions** — it voided the flag-ON false-BID headline (card #682, formally
// retracted) AND the flag-OFF `28/28 · FALSE-BIDs=0` baseline that was the arc's merge gate.
//
// WHAT IT FIXES — four defects, each of which alone invalidates a gate:
//
//   D-1  FROZEN SUBSTRATE.  `result.inputs.coverageV2` is never read. The ledger is RECOMPUTED from
//        `result.coverage.attestations` + `input.fullSource` through the **production call path**, so the
//        substrate is what today's engine produces under the declared configuration.
//
//   D-2  SILENT INCLUSION.  A record with no attestations recomputes to `disqualifierUncovered: []` — which
//        reads as a clean pass while measuring NOTHING. That is exactly the **placebo shape** (L40: an INERT
//        output equal to a PASSING output proves nothing). Such records are stamped **NOT MEASURABLE** and
//        are excluded from every denominator, never silently counted as passes.
//
//   D-3  PARTIAL CONFIGURATION.  The stamp enumerates every `AUDIT_*` variable **by construction** (no list to
//        forget) and the applied set is **live parity from a banked snapshot**, not a hand-written array. The
//        A5 fix added four flags by hand; the measured module closure reads 135 and the live worker arms 84.
//        A hand-list cannot close that gap — so there is no hand-list.
//
//   D-4  SINGLE-STATE LEDGER.  Every ledger measurement is reported in **both** `AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD`
//        states, so a number can never be quoted without the guard state that produced it.
//
// SELF-VALIDATION. Nothing downstream may use this module until `selfValidate()` passes: the false-BID ruler's
// known-answer specimens AND a known-answer specimen for every substrate class the measurability classifier
// must distinguish. An instrument that cannot classify a planted specimen cannot certify a gate. HARD-EXITS.
//
// ORDERING CONTRACT (load-bearing). `applyStampedConfig()` MUST run before any `src/lib` import: several gates
// are MODULE-LOAD consts (`GATE_V2_ENABLED`), so a flag set after the import is silently ignored. This module
// therefore has **no top-level `src/lib` import** — every engine import below is dynamic, inside a function.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync } from "fs";

const SNAPSHOT_PATH = "scripts/audit-ai/live-flags.snapshot.json";
const RECORD_DIR = "scripts/audit-ai/run-records";
const RECORD_EXCLUDE = /panel-findings-bank|panel-characterization|smoke|REMOTE_/;

// ── CONFIGURATION ───────────────────────────────────────────────────────────────────────────────────────────

export type ConfigName = "live" | "flag-off-baseline";

/** Arc flags — the ones this build introduces. They do NOT exist on the live worker, so live parity says
 *  nothing about them; each configuration must state them EXPLICITLY or they would be silently absent. */
const ARC_FLAGS = [
  "AUDIT_TEMPORAL_VERDICT",
  "AUDIT_INCOMPLETE_PRECEDENCE",
  "AUDIT_SETASIDE_BACKSTOP",
  "AUDIT_RETIRE_VERBATIM_VETO",
  "AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM",
  "AUDIT_BANNER_BAR_RANKING",
  "AUDIT_VETO_NARROW_UNIVERSAL",
  "AUDIT_BAR_SIGNAL_REGISTER_TOKENS",
  "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD",
] as const;

/** Applies the measured configuration to `process.env`. MUST be called before any `src/lib` import.
 *
 *  `live` — every `AUDIT_*` value the audit-worker carries, from the banked snapshot, PLUS the arc flags in
 *  their default-OFF state. This is the configuration a customer actually runs. It is the DEFAULT because a
 *  measurement taken under any other configuration is a statement about a machine nobody operates.
 *
 *  `flag-off-baseline` — live parity with every arc flag hard-cleared. Used for byte-identity proofs.
 *
 *  Environment ALWAYS wins: an explicitly-set variable is never overwritten, so a caller can pin one flag
 *  without forking the configuration. The resulting set is stamped by `configStamp()`. */
export function applyStampedConfig(name: ConfigName = "live"): { name: ConfigName; applied: number; snapshotDate: string } {
  if (!existsSync(SNAPSHOT_PATH)) {
    console.error(`❌ INSTRUMENT: no live-flag snapshot at ${SNAPSHOT_PATH}. Re-capture it before measuring anything —\n` +
                  `   a corpus that invents its own flag set measures a configuration nobody runs (defect D-3).`);
    process.exit(2);
  }
  const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as {
    _provenance: { capturedAt: string; _rejectedKeys: string[] };
    flags: Record<string, string>;
  };
  let applied = 0;
  for (const [k, v] of Object.entries(snap.flags)) {
    if (process.env[k] === undefined) { process.env[k] = v; applied++; }
  }
  // Arc flags: default-OFF unless the caller pinned them. Stated explicitly — never left to absence.
  for (const k of ARC_FLAGS) {
    if (name === "flag-off-baseline") { process.env[k] = "false"; continue; }
    if (process.env[k] === undefined) { process.env[k] = "false"; applied++; }
  }
  process.env.__INSTRUMENT_CONFIG = name;
  process.env.__INSTRUMENT_SNAPSHOT_DATE = snap._provenance.capturedAt;
  return { name, applied, snapshotDate: snap._provenance.capturedAt };
}

/** D-3 · FULL-ENUMERATION CONFIG STAMP. Enumerates every `AUDIT_*` present at report time. A flag cannot be
 *  omitted from the stamp by forgetting to add it to a list, because there is no list. */
export function configStamp(): string {
  const flags = Object.keys(process.env).filter((k) => k.startsWith("AUDIT_")).sort();
  const on = flags.filter((f) => process.env[f] === "true");
  const off = flags.filter((f) => process.env[f] !== "true");
  return [
    `config=[${process.env.__INSTRUMENT_CONFIG || "?"}] · live-snapshot=${process.env.__INSTRUMENT_SNAPSHOT_DATE || "?"} · ${flags.length} AUDIT_* present`,
    `  ON  (${on.length}): ${on.join(" ") || "(none)"}`,
    `  off (${off.length}): ${off.join(" ") || "(none)"}`,
  ].join("\n");
}

// ── MEASURABILITY (D-2) ─────────────────────────────────────────────────────────────────────────────────────

export type Measurability = "MEASURABLE" | "NOT MEASURABLE";

/** SUBSTRATE CLASSES the classifier must distinguish. Named so the acceptance rule ("a known-answer specimen
 *  per substrate class") is checkable rather than asserted. */
export type SubstrateClass =
  | "S1 att+frozen"        // attestations present AND a frozen coverageV2 exists (recompute supersedes it)
  | "S2 att-only"          // attestations present, no frozen literal (recompute is the only value)
  | "S3 no-attestations"   // no attestations → recompute is vacuous → NOT MEASURABLE
  | "S4 no-source";        // no fullSource → the production opts cannot be reproduced → NOT MEASURABLE

/** Classifies a record's substrate. The ONLY place measurability is decided, so a record can never be
 *  admitted to a denominator by a second, laxer rule elsewhere. */
export function classifySubstrate(rec: any): { cls: SubstrateClass; measurable: Measurability; why: string } {
  const atts = rec?.result?.coverage?.attestations;
  const src = rec?.input?.fullSource;
  if (typeof src !== "string" || src.length === 0) {
    return { cls: "S4 no-source", measurable: "NOT MEASURABLE", why: "no input.fullSource ⇒ production locate/verifyRecitalPresence opts cannot be reproduced" };
  }
  if (!Array.isArray(atts) || atts.length === 0) {
    return { cls: "S3 no-attestations", measurable: "NOT MEASURABLE", why: "no coverage.attestations ⇒ recompute yields an EMPTY ledger indistinguishable from a clean pass (placebo shape)" };
  }
  return rec?.result?.inputs?.coverageV2
    ? { cls: "S1 att+frozen", measurable: "MEASURABLE", why: "attestations + fullSource present; frozen literal superseded by recompute" }
    : { cls: "S2 att-only", measurable: "MEASURABLE", why: "attestations + fullSource present; no frozen literal to supersede" };
}

// ── THE REBUILT LEDGER (D-1) ────────────────────────────────────────────────────────────────────────────────

export interface RebuiltRecord {
  file: string;
  id: string;
  cls: SubstrateClass;
  measurable: Measurability;
  why: string;
  /** VerdictInputs with `coverageV2` REBUILT from attestations under the stamped set. Absent for NOT MEASURABLE
   *  records — deliberately: handing back a half-rebuilt input is how silent inclusion happens. */
  inputs?: any;
  /** Frozen-vs-rebuilt delta, for the staleness census. */
  frozenDisq?: number;
  rebuiltDisq?: number;
}

/** Rebuilds every banked record's coverage ledger from its attestations, under the CURRENT process.env.
 *
 *  SINGLE-SOURCED to `replayCoverageStage` (audit-run-record.ts), which is itself the production call shape
 *  (`gradeCoverageV2(atts, { locate: locateObligationContext(src), verifyRecitalPresence: verifyRecitalInSource(src) })`).
 *  Reproducing that call by hand here would create a second, silently-divergent definition of the ledger —
 *  the exact failure mode the `isLedgerDemotableNonBar` single-sourcing comment in audit-gate-v2 warns about. */
export async function rebuildLedger(): Promise<RebuiltRecord[]> {
  const { replayCoverageStage } = await import("../../src/lib/audit-run-record");
  const files = readdirSync(RECORD_DIR).filter((f) => f.endsWith(".json") && !RECORD_EXCLUDE.test(f)).sort();
  const out: RebuiltRecord[] = [];
  for (const file of files) {
    let rec: any;
    try { rec = JSON.parse(readFileSync(`${RECORD_DIR}/${file}`, "utf8")); }
    catch (e) { out.push({ file, id: file, cls: "S4 no-source", measurable: "NOT MEASURABLE", why: `unparseable: ${e}` }); continue; }
    const { cls, measurable, why } = classifySubstrate(rec);
    const id = file.replace(/\.run-record\.json$|\.json$/, "");
    if (measurable === "NOT MEASURABLE") { out.push({ file, id, cls, measurable, why }); continue; }
    let rebuilt: any;
    try { rebuilt = replayCoverageStage(rec).coverageV2; }
    catch (e) { out.push({ file, id, cls, measurable: "NOT MEASURABLE", why: `recompute threw: ${e}` }); continue; }
    out.push({
      file, id, cls, measurable, why,
      inputs: { ...rec.result.inputs, coverageV2: rebuilt, source: rec.input.fullSource },
      frozenDisq: (rec.result.inputs?.coverageV2?.disqualifierUncovered ?? []).length,
      rebuiltDisq: (rebuilt.disqualifierUncovered ?? []).length,
    });
  }
  return out;
}

// ── THE FALSE-BID RULER (A5, carried over) ──────────────────────────────────────────────────────────────────

const COMMIT = new Set(["BID", "BID_WITH_CAUTION"]);

/** VERDICT-LEVEL TRUTH, category-independent (A5 fix, card #682): a specimen is a false-BID iff it COMMITTED
 *  while its EXPECTED set contains no committal verdict. Categories are display metadata only — adding a
 *  specimen in a new category can never silently escape the counter. */
export const isFalseBid = (expected: string[], got: string) => COMMIT.has(got) && !expected.some((e) => COMMIT.has(e));
export const isCommittal = (v: string) => COMMIT.has(v);

// ── THE MISSING HALF OF THE RULER (2026-07-31) ───────────────────────────────────────────────────────────────
//
// Until now this file measured exactly ONE error direction. `isFalseBid` fires when we committed and should not
// have; there was no counterpart anywhere in the repo — `falseNhr`, `missedBid`, `isFalseNoBid` all returned zero
// search hits. Every gate, flag and guard in the verdict layer was therefore tuned against a ruler on which
// adding a decline scored perfectly and cost nothing, forever.
//
// The consequence is measurable: deriveVerdict carries 17 NEEDS_HUMAN_REVIEW exits and 7 INCOMPLETE exits against
// 2 BID exits — twelve ways to decline, two ways to commit. That is not accumulated cruft; it is the rational
// response to half a ruler. A system optimised against one error direction drifts into the other one.
//
// FAILURE DIRECTION, stated plainly so this is never read as licence to loosen: a false BID can cost a bidder real
// money and remains the cardinal sin. A false DECLINE is not free either — it is the product declining to do the
// one job it exists for. Both are reported side by side, neither is traded off silently, and adding this counter
// does not make it a gate. Gate is not a grade; metric is not a gate.
export const isFalseDecline = (expected: string[], got: string) => !COMMIT.has(got) && expected.some((e) => COMMIT.has(e));

/** Both directions in one pass, so a report can never quote one without the other. */
export function verdictErrors(specimens: Array<{ exp: string[]; got: string }>) {
  const falseBids = specimens.filter((s) => isFalseBid(s.exp, s.got)).length;
  const falseDeclines = specimens.filter((s) => isFalseDecline(s.exp, s.got)).length;
  const committal = specimens.filter((s) => isCommittal(s.got)).length;
  return { n: specimens.length, falseBids, falseDeclines, committal, declineRate: specimens.length ? (specimens.length - committal) / specimens.length : 0 };
}

// ── BOTH-GUARD-STATE MEASUREMENT (D-4) ──────────────────────────────────────────────────────────────────────

/** Runs `fn` under both `AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD` states and returns both results. Every ledger
 *  measurement goes through this, so a number can never be reported without its guard state. */
export function inBothGuardStates<T>(fn: () => T): { guardOn: T; guardOff: T } {
  const K = "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD";
  const prev = process.env[K];
  const run = (v: string) => { process.env[K] = v; return fn(); };
  try { return { guardOff: run("false"), guardOn: run("true") }; }
  finally { if (prev === undefined) delete process.env[K]; else process.env[K] = prev; }
}

// ── SELF-VALIDATION (blocking) ──────────────────────────────────────────────────────────────────────────────

/** ACCEPTANCE RULE (#692): ruler self-validation 10/10 · the two known NOT MEASURABLE records correctly
 *  stamped · at least one known-answer specimen per substrate class. HARD-EXITS on any failure — an
 *  instrument that mis-classifies a planted specimen may not measure anything. */
export function selfValidate(): void {
  let bad = 0;
  const fail = (m: string) => { console.log(`❌ ${m}`); bad++; };

  // (1) RULER — known-answer false-BID specimens.
  const RULER: Array<{ n: string; exp: string[]; got: string; want: boolean }> = [
    { n: "escalation-expected specimen that COMMITTED → IS a false-BID", exp: ["NEEDS_HUMAN_REVIEW"], got: "BID", want: true },
    { n: "escalation-expected specimen that committed to BWC → IS a false-BID", exp: ["NEEDS_HUMAN_REVIEW"], got: "BID_WITH_CAUTION", want: true },
    { n: "INCOMPLETE-expected specimen that COMMITTED → IS a false-BID", exp: ["INCOMPLETE"], got: "BID", want: true },
    { n: "NO_BID-expected specimen that COMMITTED → IS a false-BID", exp: ["NO_BID"], got: "BID_WITH_CAUTION", want: true },
    { n: "INELIGIBLE-expected specimen that COMMITTED → IS a false-BID", exp: ["INELIGIBLE"], got: "BID", want: true },
    { n: "escalation-expected specimen that ESCALATED → not a false-BID", exp: ["NEEDS_HUMAN_REVIEW"], got: "NEEDS_HUMAN_REVIEW", want: false },
    { n: "biddable specimen that committed → not a false-BID", exp: ["BID", "BID_WITH_CAUTION"], got: "BID", want: false },
    { n: "biddable specimen that escalated → not a false-BID (false-ESCALATION, counted elsewhere)", exp: ["BID", "BID_WITH_CAUTION"], got: "NEEDS_HUMAN_REVIEW", want: false },
    { n: "mixed-expectation specimen that committed → not a false-BID", exp: ["BID_WITH_CAUTION", "NEEDS_HUMAN_REVIEW"], got: "BID_WITH_CAUTION", want: false },
    { n: "THREW → not a false-BID (hard failure, caught by pass/total)", exp: ["NEEDS_HUMAN_REVIEW"], got: "THREW", want: false },
  ];
  for (const k of RULER) if (isFalseBid(k.exp, k.got) !== k.want) fail(`RULER: ${k.n} (want ${k.want})`);
  console.log(`${bad ? "❌" : "✅"} RULER SELF-TEST: ${RULER.length - bad}/${RULER.length} known-answer false-BID specimens counted correctly`);

  // (2) SUBSTRATE CLASSIFIER — one known-answer specimen per class (acceptance rule). Synthetic records whose
  //     correct stamp is known in advance, run through the SAME classifier the corpus uses.
  const att = [{ section: "L", status: "obligations_ungrounded", obligations: ["x"], citedFindingIds: [], ungrounded: ["x"] }];
  const CLASSES: Array<{ n: string; rec: any; cls: SubstrateClass; m: Measurability }> = [
    { n: "S1 attestations + frozen coverageV2", m: "MEASURABLE", cls: "S1 att+frozen",
      rec: { input: { fullSource: "SRC" }, result: { coverage: { attestations: att }, inputs: { coverageV2: { disqualifierUncovered: [] } } } } },
    { n: "S2 attestations, no frozen literal", m: "MEASURABLE", cls: "S2 att-only",
      rec: { input: { fullSource: "SRC" }, result: { coverage: { attestations: att }, inputs: {} } } },
    { n: "S3 EMPTY attestations → placebo shape", m: "NOT MEASURABLE", cls: "S3 no-attestations",
      rec: { input: { fullSource: "SRC" }, result: { coverage: { attestations: [] }, inputs: {} } } },
    { n: "S3 attestations key ABSENT", m: "NOT MEASURABLE", cls: "S3 no-attestations",
      rec: { input: { fullSource: "SRC" }, result: { coverage: {}, inputs: {} } } },
    { n: "S4 no fullSource", m: "NOT MEASURABLE", cls: "S4 no-source",
      rec: { input: {}, result: { coverage: { attestations: att }, inputs: {} } } },
  ];
  const seen = new Set<SubstrateClass>();
  for (const c of CLASSES) {
    const got = classifySubstrate(c.rec);
    if (got.cls !== c.cls || got.measurable !== c.m) fail(`SUBSTRATE: ${c.n} → got ${got.cls}/${got.measurable}, want ${c.cls}/${c.m}`);
    else seen.add(c.cls);
  }
  const ALL: SubstrateClass[] = ["S1 att+frozen", "S2 att-only", "S3 no-attestations", "S4 no-source"];
  for (const c of ALL) if (!seen.has(c)) fail(`SUBSTRATE: no passing known-answer specimen for class ${c} (acceptance rule requires one per class)`);
  console.log(`${bad ? "❌" : "✅"} SUBSTRATE CLASSIFIER: ${CLASSES.length} known-answer specimens · all ${ALL.length} classes covered`);

  // (3) GUARD-STATE HARNESS — it must actually toggle, and must restore. A harness that silently measures one
  //     state twice would report "both states agree" for free (the placebo shape again, one layer up).
  const K = "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD";
  const before = process.env[K];
  const obs = inBothGuardStates(() => process.env[K]);
  if (obs.guardOn !== "true" || obs.guardOff !== "false") fail(`GUARD HARNESS: did not toggle (on=${obs.guardOn} off=${obs.guardOff})`);
  if (process.env[K] !== before) fail(`GUARD HARNESS: did not restore (${before} → ${process.env[K]})`);
  console.log(`${bad ? "❌" : "✅"} GUARD-STATE HARNESS: toggles both states and restores`);

  if (bad) { console.log(`\n❌ THE INSTRUMENT IS BROKEN — ${bad} known-answer failure(s). Refusing to measure anything.`); process.exit(2); }
  console.log(`✅ INSTRUMENT SELF-VALIDATION PASSED — measurement may proceed.\n`);
}
