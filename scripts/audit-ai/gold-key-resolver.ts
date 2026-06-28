// SINGLE source of truth for which gold key is LIVE per sol + how to grade it (Brain card 71).
// Loaders MUST resolve through here instead of hardcoding `${sol}.judgment.frozen.json` (the retired v1
// name) — that path silently grabs a retired/superseded key. The registry (gold-set-registry.json) names
// the active_version + file + key_type; oos_detection keys are graded by the deterministic detector and
// NEVER reach scoreJudgment.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { detectConstructionOutOfScope } from "../../src/lib/section-boundary-detector";

const GOLD_DIR = "scripts/audit-ai/gold-sets";

export type GoldKeyType = "full_verdict" | "oos_detection";
export interface ResolvedGoldKey { solId: string; keyType: GoldKeyType; activeVersion: string; file: string; path: string; }

/** Resolve the LIVE key for a sol from the registry. Throws (named) if the sol is held/unknown. */
export function resolveGoldKey(solId: string): ResolvedGoldKey {
  const reg = JSON.parse(readFileSync(path.join(GOLD_DIR, "gold-set-registry.json"), "utf8")) as {
    keys?: Record<string, { active_version: string; key_type: GoldKeyType; file: string }>;
  };
  const e = reg.keys?.[solId];
  if (!e) throw new Error(`resolveGoldKey: '${solId}' is not an active key in gold-set-registry.json (held or unknown)`);
  return { solId, keyType: e.key_type, activeVersion: e.active_version, file: e.file, path: path.join(GOLD_DIR, e.file) };
}

/** Source-of-record text for a sol — certified-complete if present, else the plain dump. */
export function goldSource(solId: string): string {
  const complete = path.join(GOLD_DIR, `${solId}-FULL-SOURCE.complete.txt`);
  const plain = path.join(GOLD_DIR, `${solId}-FULL-SOURCE.txt`);
  return readFileSync(existsSync(complete) ? complete : plain, "utf8");
}

/** $0 grade of an oos_detection key: run the deterministic detector over the source, expect OUT_OF_SCOPE
 *  construction. NEVER calls scoreJudgment or the paid panel — that is the whole point of the routing. */
export function gradeOosKey(solId: string): { pass: boolean; outcome: string; tier?: string; signals: string[] } {
  const text = goldSource(solId);
  const naics = text.match(/NAICS[^0-9]{0,40}(\d{6})/i)?.[1] ?? null;
  const det = detectConstructionOutOfScope({ naicsCode: naics, fullText: text });
  if (det && det.reason === "out_of_scope:construction") return { pass: true, outcome: "OUT_OF_SCOPE", tier: det.tier, signals: det.matchedSignals };
  return { pass: false, outcome: det ? "OUT_OF_SCOPE(wrong-reason)" : "in-scope(detector did NOT fire)", signals: det?.matchedSignals ?? [] };
}
