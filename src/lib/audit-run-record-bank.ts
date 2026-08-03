// LIVE RUN-RECORD BANK — the persistence multiplier for the engine-rebuild cheap-proof loop.
//
// WHY: every paid audit produces real LLM findings, then throws them away after writing the verdict. That is
// exactly why the last three engine fixes could not be proven on real data for free (they were verified on
// PROXIES — gold-set text + render — not the real engine → memory feedback_fix_and_verify_on_real_surface).
// This banks a COMPLETE, replayable RunRecord (real findings + inputs + coverage + fullSource) into durable
// Supabase Storage on every completed audit, so scripts/audit-ai/pull-run-records.ts can pull it down and the
// $0 replay + golden-corpus scorer (gold-corpus-score.ts) can grade a fix on real data with NO re-spend.
//
// SAFETY (this touches the customer path — Gauntlet Rule 59):
//   • FLAG-GATED, DEFAULT OFF (AUDIT_BANK_RUN_RECORD !== "true" ⇒ no-op). Ships DARK; changes NOTHING until
//     flipped, and the flip goes through the pre-live gate. With the flag off this file cannot affect a verdict.
//   • BEST-EFFORT: fully try/catch-wrapped by the caller AND internally. A bank failure NEVER fails an audit —
//     the paid Opus/Sonnet work already succeeded; a storage blip must not discard a finished audit.
//   • SIDE-WRITE ONLY: it reads the finished AuditResult; it never mutates it or the verdict path.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRunRecord, captureAuditFlagEnv, type RunRecordMeta, type RunRecordInput } from "./audit-run-record";
import type { UsageCall } from "./audit-cost";
import type { AuditResult } from "./audit-orchestrator";

export const RUN_RECORD_BANK_ENABLED = process.env.AUDIT_BANK_RUN_RECORD === "true";
const BUCKET = "run-records";

export interface BankRunRecordArgs {
  auditId: string;
  sol: string;                               // solicitation id / label (path key)
  startedAt: string;                         // ISO — run start (or generatedAt if start unknown)
  flags: Record<string, string | undefined>; // deterministic-behavior flags (audit trail + replay fidelity)
  result: AuditResult;                       // the finished audit (decision/inputs/findings/coverage)
  input: RunRecordInput;                     // fullSource + bidderProfile/naics/setAside/manifestComplete
  billing: { honestFail: boolean; billable: boolean };
  commercialHonestFail?: boolean;            // the coreMissing flag state the run used
  models?: Record<string, string>;
  wallClockSec?: number;
  /** Per-call cost/latency ledger for this run (see RunRecord.result.usage). Optional — a caller that has
   *  none banks a record without the key rather than an empty array. */
  usage?: UsageCall[];
}

/** Bank a replayable RunRecord to durable storage. FLAG-GATED + best-effort — returns the storage path on
 *  success, or null on no-op / any failure (never throws; a bank error must not touch the audit). */
export async function bankRunRecord(
  supabase: SupabaseClient,
  args: BankRunRecordArgs,
): Promise<string | null> {
  if (!RUN_RECORD_BANK_ENABLED) return null;
  try {
    const meta: RunRecordMeta = {
      runId: args.auditId,
      startedAt: args.startedAt,
      flags: args.flags,
      flagEnv: captureAuditFlagEnv(process.env),   // card #582 — the FULL AUDIT_* env, so the banked run is per-flag minable (supersedes the ~5-key curated `flags` for mining)
      sol: args.sol,
      ...(args.models ? { models: args.models } : {}),
      ...(args.wallClockSec != null ? { wallClockSec: args.wallClockSec } : {}),
    };
    const rec = buildRunRecord({
      meta,
      input: args.input,
      result: args.result,
      billing: args.billing,
      commercialHonestFail: args.commercialHonestFail,
      ...(args.usage && args.usage.length ? { usage: args.usage } : {}),
    });
    // Path: run-records/<sol>/<auditId>.json — sol-grouped so the pull script + scorer can match a blind key
    // by sol id. Sanitize the sol into a safe path segment (attacker-influenceable via SAM/upload metadata).
    const safeSol = (args.sol || "unknown").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
    const path = `${safeSol}/${args.auditId}.json`;
    const body = JSON.stringify(rec);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, body, { upsert: true, contentType: "application/json" });
    if (error) {
      console.warn(`[RUN-RECORD-BANK] upload failed for ${args.auditId} (${args.sol}): ${error.message}`);
      return null;
    }
    console.log(`[RUN-RECORD-BANK] banked ${path} (${body.length} bytes, ${rec.result.findings.length} findings)`);
    return path;
  } catch (e) {
    console.warn(`[RUN-RECORD-BANK] non-fatal bank error for ${args.auditId}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
