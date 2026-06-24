// STAGE 4 scaffold — gold-set scoring for the measured A/B (PURE, deterministic, NO API).
//
// This is the reusable CORE the fresh-session A/B runner is built around: given a
// human-validated gold set (ground-truth inventory) and one engine's extraction, it
// computes per-category recall/precision PLUS the two metrics that actually decide
// graduation: bindingClauseRecall (bid-critical clauses) and plantedHardRecall (the
// known bid-losers we seeded — THE moat metric). No model calls here, so it is proven
// in the deterministic gate on a fixture; the runner (which DOES call both engines and
// captures token cost) wraps this. See ceo/AGENTIC-ENGINE-REBUILD-PLAN.md Stage 4.

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
export function scoreCategory(found: string[], goldTruth: string[]): CategoryScore {
  const goldKeys = new Set(goldTruth.map(normKey));
  const foundKeys = new Set(found.map(normKey));
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
  return {
    packageId: o.packageId,
    auditId: typeof o.auditId === "string" ? o.auditId : undefined,
    adjudicated: o.adjudicated === true,
    groundTruth: {
      clauses,
      requirements: strArr(gt.requirements, "requirements"),
      evalFactors: strArr(gt.evalFactors, "evalFactors"),
      gates: strArr(gt.gates, "gates"),
    },
  };
}

/** Score one engine's extraction against one package's gold set. Pure. */
export function scoreGoldSet(extraction: EngineExtraction, pkg: GoldSetPackage): GoldSetScore {
  const gt = pkg.groundTruth;
  const foundClauseKeys = new Set(extraction.clauses.map(normKey));

  const bindingClauses = gt.clauses.filter((c) => c.binding);
  const plantedClauses = gt.clauses.filter((c) => c.plantedHard);
  const subsetRecall = (subset: GoldClause[]): number => {
    if (subset.length === 0) return 1;
    const hit = subset.filter((c) => foundClauseKeys.has(normKey(c.number))).length;
    return hit / subset.length;
  };

  return {
    packageId: pkg.packageId,
    clauses: scoreCategory(extraction.clauses, gt.clauses.map((c) => c.number)),
    requirements: scoreCategory(extraction.requirements, gt.requirements),
    evalFactors: scoreCategory(extraction.evalFactors, gt.evalFactors),
    gates: scoreCategory(extraction.gates, gt.gates),
    bindingClauseRecall: subsetRecall(bindingClauses),
    plantedHardRecall: subsetRecall(plantedClauses),
    missedBinding: bindingClauses.filter((c) => !foundClauseKeys.has(normKey(c.number))).map((c) => c.number),
  };
}
