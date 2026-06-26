// STAGE 4 scaffold — gold-set scoring for the measured A/B (PURE, deterministic, NO API).
//
// This is the reusable CORE the fresh-session A/B runner is built around: given a
// human-validated gold set (ground-truth inventory) and one engine's extraction, it
// computes per-category recall/precision PLUS the two metrics that actually decide
// graduation: bindingClauseRecall (bid-critical clauses) and plantedHardRecall (the
// known bid-losers we seeded — THE moat metric). No model calls here, so it is proven
// in the deterministic gate on a fixture; the runner (which DOES call both engines and
// captures token cost) wraps this. See ceo/AGENTIC-ENGINE-REBUILD-PLAN.md Stage 4.

import { normClause, clauseNumberRegex } from "../../src/lib/section-extractors";

/** One ground-truth clause. `binding` = a miss loses a bid (FAR/DFARS that gates award
 *  or compliance). `plantedHard` = a known-hard item we deliberately seeded (set-aside
 *  trap, WD floor, buried CMMC gate) — recall on these is weighted above aggregate. */
export interface GoldClause {
  number: string;
  binding: boolean;
  plantedHard?: boolean;
}

/** Human-validated ground truth for ONE package. Built by the SME-validated hybrid:
 *  an independent ensemble proposes, CEO + Code (lead SME) adjudicate the binding items. */
export interface GoldSetPackage {
  packageId: string;
  groundTruth: {
    clauses: GoldClause[];   // FAR/DFARS by number
    requirements: string[];  // normalized requirement keys (perf/submission signatures)
    evalFactors: string[];   // §M factor names
    gates: string[];         // named hard gates (CMMC, set-aside, WD floor, OCI, TINA…)
  };
  /** PRECISION decoy traps (Brain ruling 2026-06-25): clause/gate names that are ABSENT or mere
   *  boilerplate — the panel must NOT raise these as HARD eligibility gates. A misfire = false positive.
   *  Carried as canonical tokens; matched fuzzily (substring on normalized text) against panel gate prose. */
  notGates?: string[];
  /** Per-gold-gate alias keywords, ANY of which matching a panel gate's prose (normalized substring)
   *  counts the gate as detected — panel emits free prose ("8(a) competitive set-aside") where the gold
   *  token is canonical ("SET-ASIDE"). Keyed by gold gate/notGate token. */
  gateAliases?: Record<string, string[]>;
  /** The CORRECT answer for THIS package given NO bidder profile (Brain eligibility doctrine 2026-06-25):
   *  an unmet eligibility line is CAUTION, never auto-INELIGIBLE, absent a known bidder attribute proving
   *  structural impossibility (or a solicitation-internal contradiction). */
  expectedVerdict?: ExpectedVerdict;
}

export interface ExpectedVerdict {
  verdict: string;          // e.g. "BID_WITH_CAUTION"
  eligible: boolean;        // e.g. true
  maxShowStoppers: number;  // e.g. 0
}

/** One gate the panel raised, WITH its disposition. Brain misfire-semantics (2026-06-25): a decoy is a
 *  misfire ONLY when raised as an UNMET / disqualifying gate (met===false). A met===true gate is a
 *  satisfied compliance obligation, NOT a misfire. So scoring must read disposition, not mere mention. */
export interface RaisedGate {
  name: string;   // named_hard_gates[].gate prose
  met: boolean;   // named_hard_gates[].met — true = compliance obligation satisfied; false = disqualifying/unmet
  cite?: string;  // named_hard_gates[].citation — used for the fabrication check (source-presence of cited clauses)
}

/** What the panel actually concluded, for verdict-correctness scoring. */
export interface PanelVerdictLike {
  verdict: string;
  eligible: boolean;
  showStoppers: number;
  raisedGates: RaisedGate[];
  showStopperTexts?: string[]; // the chief judge's show_stopper findings (prose) — for the Tier-1 decoy check (Brain card 42)
}

/** What ONE engine actually extracted for the same package (new agentic OR legacy). */
export interface EngineExtraction {
  clauses: string[];
  requirements: string[];
  evalFactors: string[];
  gates: string[];
}

export interface CategoryScore {
  found: number;          // ground-truth items the engine recovered (true positives)
  total: number;          // ground-truth items
  recall: number;         // found / total (0 when total === 0 → vacuously 1? no — see note)
  falsePositives: number; // engine items NOT in ground truth
  precision: number;      // found / (found + falsePositives)
}

export interface GoldSetScore {
  packageId: string;
  clauses: CategoryScore;
  requirements: CategoryScore;
  evalFactors: CategoryScore;
  gates: CategoryScore;
  bindingClauseRecall: number; // recall over binding clauses ONLY (the bid-critical subset)
  plantedHardRecall: number;   // recall over planted-hard clauses ONLY (the moat metric)
  missedBinding: string[];     // which binding clauses were missed (the bid-losers — name them)
}

// Clause numbers vary in spacing/case across docs ("52.204-7" vs "52.204‑7 " vs lower);
// normalize to a comparable key. Requirements/§M-factors/gates are free text — normalize
// to a whitespace-collapsed lowercase signature. (Fuzzy/semantic matching of requirement
// prose is a fresh-session refinement; exact-on-normalized is the honest floor and never
// over-credits the engine.)
export const normKey = (s: string): string => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** Recall/precision for one category. total === 0 → recall 1 (nothing to find, not a
 *  miss); found + FP === 0 → precision 1 (claimed nothing, no false claim). These edge
 *  conventions keep an empty category from dragging an aggregate unfairly either way. */
export function scoreCategory(found: string[], goldTruth: string[], norm: (s: string) => string = normKey): CategoryScore {
  const goldKeys = new Set(goldTruth.map(norm));
  const foundKeys = new Set(found.map(norm));
  let tp = 0;
  for (const k of goldKeys) if (foundKeys.has(k)) tp++;
  const falsePositives = [...foundKeys].filter((k) => !goldKeys.has(k)).length;
  const total = goldKeys.size;
  return {
    found: tp,
    total,
    recall: total === 0 ? 1 : tp / total,
    falsePositives,
    precision: tp + falsePositives === 0 ? 1 : tp / (tp + falsePositives),
  };
}

/** A gold-set FILE on disk carries the package plus provenance fields the scorer
 *  itself doesn't need (where to source the docs, whether a human adjudicated it). */
export interface GoldSetFile extends GoldSetPackage {
  auditId?: string;       // supabase audits.id to re-source the package docs
  adjudicated?: boolean;  // true ONLY after CEO + Code sign off (the non-circular gate)
}

/** Validate an arbitrary parsed JSON object into a GoldSetFile. Pure (takes an
 *  already-parsed value, does no I/O) → gate-testable. Throws with a precise message
 *  on the first structural problem so a malformed gold set fails LOUD before any paid
 *  engine run, never silently scoring against a half-built ground truth. */
export function parseGoldSet(obj: unknown): GoldSetFile {
  const o = obj as Record<string, unknown>;
  if (!o || typeof o !== "object") throw new Error("gold set: not an object");
  if (typeof o.packageId !== "string" || !o.packageId) throw new Error("gold set: missing packageId");
  const gt = o.groundTruth as Record<string, unknown> | undefined;
  if (!gt || typeof gt !== "object") throw new Error(`gold set ${o.packageId}: missing groundTruth`);
  const strArr = (v: unknown, field: string): string[] => {
    if (!Array.isArray(v)) throw new Error(`gold set ${o.packageId}: groundTruth.${field} must be an array`);
    return v.map((x, i) => {
      if (typeof x !== "string") throw new Error(`gold set ${o.packageId}: groundTruth.${field}[${i}] must be a string`);
      return x;
    });
  };
  if (!Array.isArray(gt.clauses)) throw new Error(`gold set ${o.packageId}: groundTruth.clauses must be an array`);
  const clauses: GoldClause[] = gt.clauses.map((c, i) => {
    const cc = c as Record<string, unknown>;
    if (!cc || typeof cc.number !== "string") throw new Error(`gold set ${o.packageId}: clauses[${i}].number must be a string`);
    if (typeof cc.binding !== "boolean") throw new Error(`gold set ${o.packageId}: clauses[${i}].binding must be a boolean`);
    return { number: cc.number, binding: cc.binding, plantedHard: cc.plantedHard === true };
  });
  // notGates: accept either an array of tokens OR the object form used on disk ({TOKEN: "why", _note: …}).
  let notGates: string[] | undefined;
  if (Array.isArray(o.notGates)) notGates = o.notGates.filter((x): x is string => typeof x === "string");
  else if (o.notGates && typeof o.notGates === "object") notGates = Object.keys(o.notGates as object).filter((k) => k !== "_note" && !k.startsWith("_"));
  // gateAliases: { GATE: [keywords] }
  let gateAliases: Record<string, string[]> | undefined;
  if (o.gateAliases && typeof o.gateAliases === "object") {
    gateAliases = {};
    for (const [k, v] of Object.entries(o.gateAliases as Record<string, unknown>)) {
      if (Array.isArray(v)) gateAliases[k] = v.filter((x): x is string => typeof x === "string");
    }
  }
  // expectedVerdict (Brain doctrine answer key)
  let expectedVerdict: ExpectedVerdict | undefined;
  const ev = o.expectedVerdict as Record<string, unknown> | undefined;
  if (ev && typeof ev === "object") {
    if (typeof ev.verdict !== "string") throw new Error(`gold set ${o.packageId}: expectedVerdict.verdict must be a string`);
    if (typeof ev.eligible !== "boolean") throw new Error(`gold set ${o.packageId}: expectedVerdict.eligible must be a boolean`);
    if (typeof ev.maxShowStoppers !== "number") throw new Error(`gold set ${o.packageId}: expectedVerdict.maxShowStoppers must be a number`);
    expectedVerdict = { verdict: ev.verdict, eligible: ev.eligible, maxShowStoppers: ev.maxShowStoppers };
  }
  return {
    packageId: o.packageId,
    auditId: typeof o.auditId === "string" ? o.auditId : undefined,
    adjudicated: o.adjudicated === true,
    notGates,
    gateAliases,
    expectedVerdict,
    groundTruth: {
      clauses,
      requirements: strArr(gt.requirements, "requirements"),
      evalFactors: strArr(gt.evalFactors, "evalFactors"),
      gates: strArr(gt.gates, "gates"),
    },
  };
}

/** Does any panel gate prose match a gold token (by the token's normalized form OR any alias)? BOUNDED-
 *  TOKEN match, NOT substring (Brain substrate fix 2b, 2026-06-25): the needle must sit on alphanumeric
 *  boundaries, so short aliases like "sca"/"oci"/"cui"/"8a" can't false-match "e**sca**lation" /
 *  "ass**oci**ated" / a clause number embedded in a longer one. Pure. */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function gateMatched(token: string, panelGateTexts: string[], aliases?: Record<string, string[]>): boolean {
  const needles = [token, ...(aliases?.[token] ?? [])].map(normKey).filter(Boolean);
  const hay = panelGateTexts.map(normKey);
  return needles.some((n) => {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(n)}(?![a-z0-9])`, "i");
    return hay.some((h) => re.test(h));
  });
}

/** The DECOY traps the panel wrongly raised as a DISQUALIFYING gate (Brain 2026-06-25: misfire ONLY on
 *  an UNMET gate — met===false; a met===true compliance mention is NOT a misfire). Must be 0. Pure. */
export function decoyMisfires(notGates: string[], raised: RaisedGate[], aliases?: Record<string, string[]>): string[] {
  const unmetNames = raised.filter((r) => !r.met).map((r) => r.name);
  return notGates.filter((t) => gateMatched(t, unmetNames, aliases));
}

/** The named gold gates the panel DETECTED (mentioned as a gate, any disposition — recall numerator). Pure. */
export function gatesDetected(goldGates: string[], raised: RaisedGate[], aliases?: Record<string, string[]>): string[] {
  const names = raised.map((r) => r.name);
  return goldGates.filter((g) => gateMatched(g, names, aliases));
}

/** FABRICATION CHECK (Brain substrate fix 2c, 2026-06-25): any FAR/DFARS clause the panel RAISED (in a
 *  gate's name OR citation, regardless of met) that is ABSENT from the source text = the panel invented a
 *  requirement = HARD fail. Amends the decoy rule: a met===true raised clause is clean ONLY if it is
 *  actually present in source. Returns the fabricated clause numbers (canonical). Pure. */
export function fabricatedClauses(raised: RaisedGate[], sourceText: string): string[] {
  const inSource = new Set((sourceText.match(clauseNumberRegex()) ?? []).map(normClause));
  const fab = new Set<string>();
  for (const g of raised) {
    for (const c of `${g.name} ${g.cite ?? ""}`.match(clauseNumberRegex()) ?? []) {
      const k = normClause(c);
      if (!inSource.has(k)) fab.add(k);
    }
  }
  return [...fab];
}

export interface SubstrateHealth {
  substrateClean: boolean;   // no fabrication + no disqualifying decoy misfire (the SUBSTRATE checks pass)
  graduationEligible: false; // ALWAYS false (Brain 2026-06-25): true graduation requires the blind judgment key, not this gate
  graduationBlockedReason: string;
  failures: string[];        // named SUBSTRATE failures (fabrication / disqualifying decoy)
  fabricatedClauses: string[]; // raised clauses ABSENT from source — HARD fail (2c). Must be empty.
  decoyMisfired: string[];   // decoys raised as UNMET/disqualifying — must be empty (2b/2c)
  // ── observability ONLY — RETRACTED as graduation signals (Brain #1: clause recall is tautological
  //    after the deterministic enumerator; the enumerator is a safety net, earns no quality credit) ──
  plantedHardRecall: number; // REPORTED only — NOT a pass condition
  missedPlantedHard: string[];
  bindingClauseRecall: number; // REPORTED only — NOT a pass condition
  bindingClausePrecision: number;
  missedBinding: string[];
  gateRecall: number;        // REPORTED only (substring-aliasing fixed in 2b, but still non-blind)
  missedGates: string[];
  verdictMatch: boolean | null; // REPORTED only — expectedVerdict was authored non-blind; the real verdict gate is the judgment key
}
/** @deprecated retained as an alias so existing imports compile; use SubstrateHealth. */
export type GraduationResult = SubstrateHealth;

/** Portable TINA-applicability doctrine (Brain 2026-06-25). Certified cost-or-pricing data (TINA, FAR
 *  15.403-1(b)(1)/(c)(1)) is a hard gate ONLY on a NON-COMPETITIVE (sole-source) negotiated buy ABOVE
 *  threshold with no other exception. Competitive / commercial / below-threshold ⇒ EXEMPT — and the
 *  competitive exemption holds INDEPENDENT of commercial-item status. Pure → gate-testable + reusable
 *  across gold sets (drives whether TINA belongs in a package's gold gates). */
export function tinaApplies(a: { competitive: boolean; commercialItem: boolean; aboveThreshold: boolean }): boolean {
  if (a.competitive) return false;     // adequate price competition exemption (independent of commercial status)
  if (a.commercialItem) return false;  // commercial-item exemption
  if (!a.aboveThreshold) return false; // below the cost-or-pricing-data threshold
  return true;                          // non-competitive + non-commercial + above-threshold → TINA gate applies
}

/** SUBSTRATE-HEALTH check (Brain 2026-06-25 — the gold-recall PASS was RETRACTED). This is NOT a
 *  graduation gate: clause recall is tautological after the deterministic enumerator, so it is reported
 *  but NEVER a pass condition, and the enumerator earns no quality credit. The only HARD substrate
 *  failures here are (a) FABRICATION — a raised clause absent from source (2c), and (b) a decoy raised as
 *  an UNMET disqualifying gate (2b/2c). Everything else is observability. TRUE graduation requires the
 *  blind-SME-adjudicated judgment key, which is NOT built — so graduationEligible is ALWAYS false. Pass
 *  `sourceText` to enable the fabrication check. Pure — no AI. */
export function graduationGate(
  score: GoldSetScore,
  pkg: GoldSetPackage,
  panel?: PanelVerdictLike | null,
  sourceText?: string,
): SubstrateHealth {
  const failures: string[] = [];

  // HARD substrate fail #1 — fabrication (a raised clause not present in source).
  const fabricated = panel && sourceText ? fabricatedClauses(panel.raisedGates, sourceText) : [];
  if (fabricated.length) failures.push(`FABRICATION: ${fabricated.length} raised clause(s) ABSENT from source: ${fabricated.join(", ")}`);

  // HARD substrate fail #2 — a decoy raised as an UNMET/disqualifying gate.
  const decoyMisfired = panel && pkg.notGates ? decoyMisfires(pkg.notGates, panel.raisedGates, pkg.gateAliases) : [];
  if (decoyMisfired.length) failures.push(`${decoyMisfired.length} decoy trap(s) mis-fired as DISQUALIFYING gates: ${decoyMisfired.join(", ")}`);

  // ── observability ONLY (retracted as graduation signals) ──
  const missedPlantedHard = score.missedBinding.filter((n) =>
    pkg.groundTruth.clauses.some((c) => c.plantedHard && normClause(c.number) === normClause(n)));
  const detected = panel ? gatesDetected(pkg.groundTruth.gates, panel.raisedGates, pkg.gateAliases) : [];
  const missedGates = panel ? pkg.groundTruth.gates.filter((g) => !detected.includes(g)) : pkg.groundTruth.gates;
  const gateRecall = pkg.groundTruth.gates.length === 0 ? 1 : detected.length / pkg.groundTruth.gates.length;
  let verdictMatch: boolean | null = null;
  if (pkg.expectedVerdict && panel) {
    const e = pkg.expectedVerdict;
    verdictMatch = panel.verdict === e.verdict && panel.eligible === e.eligible && panel.showStoppers <= e.maxShowStoppers;
  }

  return {
    substrateClean: failures.length === 0,
    graduationEligible: false,
    graduationBlockedReason: "graduation requires the blind-SME-adjudicated judgment key (not yet authored — Brain 2026-06-25); clause recall is retracted as a signal",
    failures,
    fabricatedClauses: fabricated,
    decoyMisfired,
    plantedHardRecall: score.plantedHardRecall,
    missedPlantedHard,
    bindingClauseRecall: score.bindingClauseRecall,
    bindingClausePrecision: score.clauses.precision,
    missedBinding: score.missedBinding,
    gateRecall,
    missedGates,
    verdictMatch,
  };
}

/** Score one engine's extraction against one package's gold set. Pure. */
export function scoreGoldSet(extraction: EngineExtraction, pkg: GoldSetPackage): GoldSetScore {
  const gt = pkg.groundTruth;
  // CLAUSE comparisons use the shared `normClause` (2d) — same canonical form the §I enumerator stores,
  // so a stray space / en-dash never scores a found clause as a miss (normKey, used for prose categories,
  // only collapses whitespace and would mismatch "52.219 -6").
  const foundClauseKeys = new Set(extraction.clauses.map(normClause));

  const bindingClauses = gt.clauses.filter((c) => c.binding);
  const plantedClauses = gt.clauses.filter((c) => c.plantedHard);
  const subsetRecall = (subset: GoldClause[]): number => {
    if (subset.length === 0) return 1;
    const hit = subset.filter((c) => foundClauseKeys.has(normClause(c.number))).length;
    return hit / subset.length;
  };

  return {
    packageId: pkg.packageId,
    clauses: scoreCategory(extraction.clauses, gt.clauses.map((c) => c.number), normClause),
    requirements: scoreCategory(extraction.requirements, gt.requirements),
    evalFactors: scoreCategory(extraction.evalFactors, gt.evalFactors),
    gates: scoreCategory(extraction.gates, gt.gates),
    bindingClauseRecall: subsetRecall(bindingClauses),
    plantedHardRecall: subsetRecall(plantedClauses),
    missedBinding: bindingClauses.filter((c) => !foundClauseKeys.has(normClause(c.number))).map((c) => c.number),
  };
}
