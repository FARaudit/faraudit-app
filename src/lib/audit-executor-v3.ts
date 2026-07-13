// AGENTIC V3 PRIMARY — the graduated engine OWNS the entire customer report.
//
// When AUDIT_AGENTIC_V3_PRIMARY=true, executeAudit early-returns into THIS
// function and V1's runAudit never executes ("V1 retired here"). Fully
// self-contained so the legacy path carries zero risk: build one fullSource
// string from the intake docs → run the proven auditPackage engine → map its
// GATE verdict onto the columns the list/email read → persist the engine's
// grounded output under compliance_json.v3 with an `engine:"agentic_v3"` marker
// the report + PDF routes branch on. Honest-fail (INCOMPLETE / NEEDS_HUMAN_REVIEW)
// is surfaced transparently as the verdict — never a false green. Two flags carry
// completeness to the consumers that gate on it: compliance_json.honest_fail and
// compliance_json.documents_complete are read by shouldGateExport (blocks PDF/web
// export of an incomplete report). The watcher email ALSO fails safe to amber on
// these flags (defense-in-depth). (T3 truth fix 2026-07-07: the old note here claimed
// the watcher AUTO-AUDIT ran the "LEGACY V1 engine (watcher-tick.ts → runAudit)" — but
// V1/runAudit are DELETED and watcher-tick.ts now calls executeAudit → this agentic V3
// engine, so the watcher DOES set honest_fail/documents_complete like every other path.)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditExecutionInput, AuditExecutionResult } from "./audit-executor";
import { buildAgenticDocs, assembleFullSourceBudgeted, MAX_FULLSOURCE_CHARS, NOTICE_BODY_DOC_NAME } from "./agentic-executor";
import { assembleFullSourceLossless } from "./agentic-lossless-ingest";
import { resolveDocSupersession, AMENDMENT_SUPERSESSION_ENABLED, isSf30Cover } from "./agentic-ingest";
import { extractDocumentDeadlines, resolveNoticeBodyDeadline } from "./audit-deadline-extract";
import { assembleFullSourceChunked, makeChunkMapCaller, wouldOverflow, type DocReadMode } from "./agentic-chunked-ingest";
import { callStructuredClaude } from "./anthropic-structured";
import { modelFor } from "./model-registry";
import { auditPackage } from "./audit-package";
import { buildV3Payload } from "./audit-v3-report";
import { detectAmendments, findingProvenance } from "./audit-orchestrator";
import { sweepConstructionManifest } from "./audit-construction-manifest";
import { detectConstructionOutOfScope } from "./section-boundary-detector";
import { isHonestFail, billable, decrementAuditQuota, recordAuditCost } from "./audit-billing";
import { aggregate, type UsageCall } from "./audit-cost";
import { bankRunRecord } from "./audit-run-record-bank";
import { isBindingDoc, type IngestionMeta, type IngestionFileMeta } from "./sam-attachments";
import { isNoticedescUrl } from "./sam-description";
import { isEnvOn } from "./env-flags";
import { confirmResidualTokens } from "./ocr-accuracy-gate";
import { makeVisionConfirmer, makeTableVisionConfirmer } from "./ocr-vision-confirm";
import { detectRateTable, gateRateTable } from "./ocr-table-gate";

/** The agentic V3 engine is the SOLE engine. V1/V2 are DELETED (2026-06-28) — there is no
 *  fallback path in the code at all, and no env flag can switch engines. `executeAudit` calls
 *  `executeAgenticPrimary` unconditionally. This constant stays only because the report route +
 *  worker gate the bidder-profile fetch on it; it is permanently `true`. The old
 *  AUDIT_AGENTIC_V3 / AUDIT_AGENTIC_V3_PRIMARY / AUDIT_LEGACY_FALLBACK env vars are inert and
 *  may be removed from the deployment. */
export const AGENTIC_V3_PRIMARY_ENABLED = true;
console.log("[ENGINE] agentic V3 is the SOLE engine (V1/V2 deleted; no fallback).");

/** Map the engine's GATE verdict onto the EXACT recommendation vocabulary V1 writes
 *  to the `audits.recommendation` column — PROCEED / PROCEED_WITH_CAUTION / DECLINE —
 *  so every downstream consumer (home dashboard pill, Past-Audits list, Telegram
 *  pipeline count, bidding kanban, watcher email) renders agentic verdicts correctly.
 *  (Using GO/CAUTION/DECLINE mis-rendered a BID as amber and dropped it from counts.)
 *  Honest-fail poles → PROCEED_WITH_CAUTION (non-committal; the report shows the true
 *  INCOMPLETE/NEEDS_HUMAN_REVIEW banner, and compliance_json.honest_fail is persisted). */
function verdictToRecommendation(v: string): "PROCEED" | "PROCEED_WITH_CAUTION" | "DECLINE" {
  switch (v) {
    case "BID": return "PROCEED";
    case "NO_BID":
    case "INELIGIBLE": return "DECLINE";
    default: return "PROCEED_WITH_CAUTION"; // BID_WITH_CAUTION · NEEDS_HUMAN_REVIEW · INCOMPLETE
  }
}

/** Pre-run manifest-completeness for the VERDICT cap (limit N8 + the null-SAM false-green
 *  BLOCKER the panel caught). MUST agree with the documents-path completeness below, else
 *  the verdict column + watcher email go green while the report banner says "partial":
 *   • truncation (whole docs dropped)        → false (incomplete);
 *   • manifest present                       → complete iff every posted doc ingested + no overflow;
 *   • null ingestion + SAM sol               → false (manifest assembly FAILED → single-doc fallback);
 *   • null ingestion + genuine upload        → true  (user supplied the docs; no manifest expected). */
export function agenticManifestComplete(
  ingestion: IngestionMeta | null | undefined,
  truncated: boolean,
  isSamSol: boolean,
): boolean {
  if (truncated) return false;
  if (ingestion) return ingestion.files_total > 0 && ingestion.files_ingested >= ingestion.files_total && !ingestion.overflow && !hasBindingContentLoss(ingestion);
  return !isSamSol;
}

/** Silent-partial guard (Brain card 224 fork 2). A BINDING doc whose bytes arrived (`ingested`) but whose
 *  machine-readable text did NOT (`has_text===false` — scanned/image, rode as a vision block the text-only
 *  engine never consumes) is a CONTENT LOSS: the read is not complete even though every file "arrived".
 *  Offeror-fill templates (isBindingDoc=false) are exempt (blank-by-design). C-18 (Brain C.b): has_text===undefined
 *  is UNKNOWN, never "present" — an ingested binding doc whose text status we cannot confirm is a content loss
 *  (`!== true`), not silently complete. This can flip a legacy record (written before the field) to INCOMPLETE on
 *  replay — the ruled, SAFE direction (unknown ⇒ cannot certify complete), never a false COMPLETE. */
export function bindingContentLossDocs(ingestion: IngestionMeta): IngestionFileMeta[] {
  // A binding doc is a CONTENT LOSS when its text is absent/unknown (has_text !== true) OR when it was
  // mid-document truncated to fit the per-doc token budget (C-4 — the unread tail may carry a bar).
  return ingestion.files.filter((f) => f.ingested && isBindingDoc(f) && (f.has_text !== true || f.truncated === true));
}

/** OCR-HELD REGISTER split (Brain card #471 ruling A, flag AUDIT_OCR_HELD_REGISTER). Partitions the content-loss set:
 *  a doc whose OCR RECOVERED text but was held on unconfirmed residual tokens (ocr_residual present) is honestly an
 *  OCR-attempted-HELD read-list entry — NOT "no machine-readable text / content not analyzed" (false on both counts).
 *  Everything else stays the genuine no-text `missing`. Pure. Flag-OFF ⇒ every doc routes to `missing` ⇒ byte-identical.
 *  Label/list only — never touches has_text, the hold, or documents_complete. */
export function splitContentLoss(contentLoss: IngestionFileMeta[], ocrHeldRegisterOn: boolean): {
  missing: Array<{ name: string; reason: string }>;
  ocrHeld: Array<{ name: string; residuals: number; reason: string }>;
} {
  const missing: Array<{ name: string; reason: string }> = [];
  const ocrHeld: Array<{ name: string; residuals: number; reason: string }> = [];
  for (const f of contentLoss) {
    const residuals = f.ocr_residual?.length ?? 0;
    // Card #477 ruling 1a — the register-gap fix. A doc is OCR-recovered-but-held on EITHER path: (a) unconfirmed
    // format-valid residual tokens (ocr_residual non-empty), OR (b) a CAUGHT MISREAD (ocr_suspect) — for which
    // ocrDeterministicGate deliberately drops ocr_residual to [] (a caught misread is not vision-recoverable). Keying
    // only on residuals.length mislabels case (b) — the numeric-dense WD (0→@ garble, suspect>0, residual=[]) — as
    // "no machine-readable text / content not analyzed" when its OCR text WAS recovered (rode into fullSource) and
    // held on a misread, not absent. ocr_suspect is set ONLY on an OCR-recovered doc, so it cleanly separates a
    // recovered-but-held doc from a genuine no-text scan (ocr_suspect undefined ⇒ still `missing`). Label/list only —
    // never touches has_text, the hold, or documents_complete. Flag-OFF ⇒ all → missing ⇒ byte-identical.
    const ocrRecoveredHeld = f.ocr_suspect === true || residuals > 0;
    if (ocrHeldRegisterOn && ocrRecoveredHeld) {
      const reason = residuals > 0
        ? `OCR-recovered; held from committal on ${residuals} unconfirmed residual token(s) — human verification recommended`
        : "OCR-recovered; held from committal on a caught misread in a numeric-dense read (e.g. rate table) — human verification recommended";
      ocrHeld.push({ name: f.name, residuals, reason });
    } else {
      missing.push({ name: f.name, reason: "ingested but no machine-readable text (scanned/image) — content not analyzed" });
    }
  }
  return { missing, ocrHeld };
}
function hasBindingContentLoss(ingestion: IngestionMeta): boolean {
  return bindingContentLossDocs(ingestion).length > 0;
}

async function markStage(supabase: SupabaseClient, auditId: string, stage: string): Promise<void> {
  try {
    await supabase.from("audits").update({ current_stage: stage, stage_updated_at: new Date().toISOString() }).eq("id", auditId);
  } catch { /* never block on a stage write */ }
}

export async function executeAgenticPrimary(
  supabase: SupabaseClient,
  auditId: string,
  input: AuditExecutionInput,
  solicitation: AuditExecutionInput["solicitation"],
  agency: string | null,
  signal?: AbortSignal,
): Promise<AuditExecutionResult> {
  await markStage(supabase, auditId, "extraction");

  // A SAM solicitation (32-hex notice id) vs a genuine upload. Decisive both for the
  // completeness cap below AND for L1 notice-body ingest: only a SAM notice HAS a
  // government-published body; an upload's description field is not one.
  const isSamSol = !!solicitation?.noticeId && /^[a-f0-9]{32}$/i.test(solicitation.noticeId);

  // L1 (Brain card 264 Ruling 1) — the SAM notice body. audit-executor.ts (FA-148) resolves
  // the noticedesc URL into solicitation.description; a value that is STILL a noticedesc URL
  // means the fetch failed (skip — honest, never fabricate). Threaded into buildAgenticDocs
  // as a first-class prepended doc so combined-synopsis §L/§M/clauses are actually read into
  // fullSource — closing the notice-body-blind false-COMPLETE root.
  const desc = typeof solicitation?.description === "string" ? solicitation.description : "";
  const noticeBody = isSamSol && desc.trim() && !isNoticedescUrl(desc) ? { text: desc, name: NOTICE_BODY_DOC_NAME } : null;

  // GAP A — assemble the engine's single fullSource string from the intake docs
  // (notice body + primary + every attachment). Reuses the same extraction the shadow path uses.
  const primaryBytes = input.pdfBuffer ?? (input.pdfBase64 ? Buffer.from(input.pdfBase64, "base64") : null);
  let docs = await buildAgenticDocs({
    primaryName: input.primaryDocName ?? "primary solicitation",
    primaryBytes,
    primaryText: input.extractedText ?? null,
    attachments: input.attachmentPdfs?.map((a) => ({ name: a.name, base64: a.base64 })) ?? null,
    noticeBody,
  });
  if (noticeBody) {
    console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: L1 notice body ingested as first-class doc (${noticeBody.text.length} chars)`);
  }
  // ── #1 AMENDMENT SUPERSESSION (Brain #344 — flag AUDIT_AMENDMENT_SUPERSESSION, default OFF) ──
  // The engine ingests original + Amdt01/02 CONCATENATED, so a superseded deadline/POC/CLIN reads as a
  // co-equal grounded fact and manufactures a FALSE internal conflict (the FA1068 wrong-pole NHR root).
  // This pass drops a base doc ONLY when a higher-numbered COMPLETE amendment provably subsumes EVERY
  // binding line of it (positive-subsumption proof); an uncertain pairing is RETAINED + labelled
  // "possibly superseded", never silently dropped (completeness-first). Named exclusions are logged.
  // Flag-OFF ⇒ this block never runs ⇒ byte-identical to today.
  if (AMENDMENT_SUPERSESSION_ENABLED && docs.length > 1) {
    const decisions = resolveDocSupersession(docs.map((d) => ({ name: d.name, text: d.text, isSf30: isSf30Cover(d.name, d.text) })));
    const dropped = decisions.filter((x) => x.status === "superseded");
    const labelled = decisions.filter((x) => x.status === "possibly_superseded");
    if (dropped.length > 0) {
      const supersededNames = new Set(dropped.map((x) => x.name));
      docs = docs.filter((d) => !supersededNames.has(d.name));
      console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: SUPERSESSION — dropped ${dropped.length} proven-subsumed doc(s): ${dropped.map((x) => `${x.name} ⇐ ${x.supersededBy}`).join("; ")}`);
    }
    if (labelled.length > 0) {
      console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: SUPERSESSION — RETAINED + labelled possibly-superseded (uncertain pairing, read in full): ${labelled.map((x) => `${x.name} (later: ${x.supersededBy})`).join("; ")}`);
    }
  }
  // Budgeted assembly (limit N3/N4) — bounds a pathological multi-MB package by
  // dropping WHOLE overflow docs (named, never a silent mid-doc cut). `truncated`
  // feeds documents_complete=false below so an over-budget read is honest-incomplete.
  //
  // AUDIT_CHUNKED_INGEST (Brain card 271, R1/R2/R3) — when ON and the package OVERFLOWS, replace
  // DROP-on-overflow with map-reduce COMPRESS-on-overflow: over-budget docs are compressed to grounded
  // per-doc compliance digests (cheap-model MAP, verbatim-grounded) instead of dropping amendments.
  // NOTHING is dropped ⇒ truncated stays false ⇒ documents_complete is honest (the content WAS read, via
  // map-reduce; ingest-only — deriveVerdict stays sole authority, R2-a). Flag-OFF ⇒ byte-identical to
  // assembleFullSourceBudgeted. Package fits under budget ⇒ whole read + ZERO paid map calls either way.
  // Per-run token tally (concurrency-safe — local to THIS audit). Declared here so the MAP calls that run
  // during assembly are priced into the SAME ledger as the auditPackage calls below.
  const usageCalls: UsageCall[] = [];
  // AUDIT_LOSSLESS_INGEST (2026-07-06, CEO leap) — DETERMINISTIC $0 replacement for the lossy map-reduce
  // compressor: an over-budget package is shrunk by keeping every BINDING line verbatim (+ context) and dropping
  // only noise, NEVER summarizing. Runs BEFORE the chunked branch and short-circuits it (no paid MAP calls).
  // Flag-OFF ⇒ this branch never runs ⇒ byte-identical to today. (W9126: 2.83M→~331K tok, §M/wage/bonding survive.)
  const losslessOn = process.env.AUDIT_LOSSLESS_INGEST === "true";
  const chunkedOn = process.env.AUDIT_CHUNKED_INGEST === "true";
  // The lossless READ budget is sized to the model's 1M-token window (~4M chars), NOT the compression-era 1.4M-char
  // budget (that ceiling forced the summarizer). Default ~3M chars (~750K tok — a safe margin under 1M for the
  // system prompt + schema). A package whose BINDING content (post-filter) still exceeds this reads honest-INCOMPLETE.
  const losslessMaxChars = Number(process.env.AGENTIC_LOSSLESS_MAX_CHARS) || 3_000_000;
  let assembled: { source: string; truncated: boolean; keptDocs: number; droppedDocs: string[]; contentLossDocs: string[] };
  let readModes: Array<{ name: string; mode: DocReadMode; chunks: number; spansKept: number; spansRejected: number; failedWindows: number }> | null = null;
  // When lossless is ON it handles ALL packages (fits-whole → untouched whole read; over-budget → binding-filter;
  // filtered-still-over → honest INCOMPLETE) — so it fully supersedes the compressor, and reads MORE whole (up to the
  // 1M window) than the old 1.4M budgeted/chunked paths did.
  if (losslessOn) {
    const la = assembleFullSourceLossless(docs, losslessMaxChars);
    assembled = { source: la.source, truncated: la.truncated, keptDocs: la.keptDocs, droppedDocs: la.droppedDocs, contentLossDocs: la.contentLossDocs };
    // Every doc is READ (full binding content) — no chunking, no map-reduce, zero paid MAP calls.
    readModes = docs.map((d) => ({ name: d.name, mode: "full" as DocReadMode, chunks: 0, spansKept: 0, spansRejected: 0, failedWindows: 0 }));
    console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: LOSSLESS ingest — ${la.filteredDocs.length}/${docs.length} docs binding-filtered (noise dropped, binding kept VERBATIM, 0 summarized), source ${(assembled.source.length / 1e6).toFixed(2)}M chars${la.contentLossDocs.length ? ` — CONTENT-LOSS on [${la.contentLossDocs.join(", ")}] (binding content alone exceeds the read window) → documents_complete=false (honest INCOMPLETE)` : ""}`);
  } else if (chunkedOn && wouldOverflow(docs, MAX_FULLSOURCE_CHARS)) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("agentic engine: ANTHROPIC_API_KEY not set — cannot run chunked map-reduce ingest");
    const mapCall = makeChunkMapCaller(
      async (a) => (await callStructuredClaude({ apiKey, model: a.model, system: a.system, userPrompt: a.user, schema: a.schema as Record<string, unknown>, maxTokens: a.maxTokens, signal: a.signal, onUsage: (u) => usageCalls.push(u) })).text,
      modelFor("extractor"),
      signal,
    );
    const ch = await assembleFullSourceChunked(docs, mapCall, MAX_FULLSOURCE_CHARS, signal);
    assembled = { source: ch.source, truncated: ch.truncated, keptDocs: ch.keptDocs, droppedDocs: ch.droppedDocs, contentLossDocs: ch.contentLossDocs };
    readModes = ch.perDoc;
    const compressed = ch.perDoc.filter((d) => d.mode === "map-reduce").length;
    console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: chunked map-reduce ingest — ${compressed}/${ch.perDoc.length} docs compressed to grounded digests, 0 dropped (primary kept whole; amendments always mapped)${ch.contentLossDocs.length ? ` — CONTENT-LOSS on [${ch.contentLossDocs.join(", ")}] → documents_complete=false (honest INCOMPLETE)` : ""}`);
  } else {
    assembled = { ...assembleFullSourceBudgeted(docs), contentLossDocs: [] };
    if (chunkedOn) readModes = docs.map((d) => ({ name: d.name, mode: "full" as DocReadMode, chunks: 0, spansKept: 0, spansRejected: 0, failedWindows: 0 }));
  }
  // Abort mid-ingest (budget/wall-clock) is an HONEST hard-fail — never spend the Opus auditPackage verdict on a
  // partial read, and never persist a partial digest as complete (Brain R1: abort = honest-fail, not a degrade).
  if (signal?.aborted) throw new Error("agentic engine aborted during ingest (budget/wall-clock) — honest-fail, not a partial read");
  let fullSource = assembled.source; // arc-B (card #477) may append VISION-CONFIRMED WAGE RATES before the engine reads it
  if (assembled.truncated) {
    console.warn(`[AGENTIC-V3-PRIMARY] ${auditId}: incomplete read — kept ${assembled.keptDocs}/${docs.length} docs, dropped [${assembled.droppedDocs.join(", ")}] content-loss [${assembled.contentLossDocs.join(", ")}] → documents_complete=false`);
  }
  if (fullSource.replace(/\s/g, "").length < 200) {
    // Nothing readable was ingested — honest hard-fail (no false report). Throw
    // so the worker routes it to a terminal 'failed' the report page exits to.
    throw new Error(`agentic engine: no readable source assembled (${fullSource.length} chars, ${docs.length} docs)`);
  }

  await markStage(supabase, auditId, "verdict");

  // ── OCR-ACCURACY LAYER 3 (Brain card #415 — flag AUDIT_WORKER_OCR, default OFF) ──
  // A binding doc recovered by OCR that carries a format-valid RESIDUAL (plausible-but-unproven decision token — the
  // format-valid-misread class 52.212-1→52.212-7, $1,300→$1,800) was held at has_text=false by the deterministic gate
  // (layers 2+4, sam-attachments) — a conservative content-loss. Layer-3 gives that residual ONE chance to clear: a
  // narrow INDEPENDENT vision re-read of the SAME document. Confirmed (vision reads the identical value) → flip
  // has_text=true so the content counts toward a committal verdict. Not confirmed / no base64 / no key → the doc STAYS
  // content-loss (fail-toward-NHR) — so a failed match can only cost an abstain, NEVER a false committal. Vision is the
  // CONFIRMER, never a co-voter; disagreement fails toward NHR (confirmResidualTokens owns that). Flag OFF ⇒ no OCR ⇒
  // no ocr_residual ⇒ this block is inert (byte-identical). Runs BEFORE manifestComplete so the recovery propagates to
  // the verdict cap, the reconciliation banner, and bindingContentLossDocs uniformly.
  if ((isEnvOn(process.env.AUDIT_WORKER_OCR) || isEnvOn(process.env.AUDIT_OCR_TABLE_CONFIRM)) && input.ingestion) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    // Name → base64 map over every doc the executor holds bytes for (primary + attachments). Normalised so a
    // display-name vs source-name skew still matches; a miss just leaves the doc content-loss (safe). SHARED by the
    // residual layer-3 (below) and the arc-B table-confirm (card #477).
    const normName = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, "");
    const b64ByName = new Map<string, string>();
    const poisoned = new Set<string>(); // a normName that two DIFFERENT docs share is ambiguous → never match (else
    // a residual could be confirmed against the WRONG document's image = a false COMPLETE). Fail-toward-NHR instead.
    const addName = (name: string, b64: string) => {
      const k = normName(name);
      if (!k || poisoned.has(k)) return;
      const existing = b64ByName.get(k);
      if (existing !== undefined && existing !== b64) { b64ByName.delete(k); poisoned.add(k); return; }
      b64ByName.set(k, b64);
    };
    const primaryB64 = input.pdfBase64 ?? (input.pdfBuffer ? input.pdfBuffer.toString("base64") : null);
    if (primaryB64) { addName(input.primaryDocName ?? "primary solicitation", primaryB64); addName("primary solicitation", primaryB64); }
    for (const a of input.attachmentPdfs ?? []) addName(a.name, a.base64);

    // ── OCR-ACCURACY LAYER 3 residual confirm (flag AUDIT_WORKER_OCR) ──
    if (isEnvOn(process.env.AUDIT_WORKER_OCR)) {
      const residualDocs = input.ingestion.files.filter((f) => f.ingested && isBindingDoc(f) && f.has_text !== true && (f.ocr_residual?.length ?? 0) > 0);
      for (const f of residualDocs) {
        const b64 = b64ByName.get(normName(f.name)); // poisoned/ambiguous key → undefined → held content-loss (safe)
        if (!apiKey || !b64) {
          console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: OCR-LAYER3 — "${f.name}" held content-loss (no ${apiKey ? "base64 match" : "API key"}) → fail-toward-NHR`);
          continue;
        }
        const confirmer = makeVisionConfirmer({ base64: b64, docName: f.name, apiKey, model: modelFor("crossdoc"), signal, onUsage: (u) => usageCalls.push(u) });
        const r = await confirmResidualTokens(f.ocr_residual ?? [], confirmer, { docName: f.name });
        if (r.confirmed) {
          f.has_text = true;
          delete f.ocr_suspect;
          console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: OCR-LAYER3 — "${f.name}" RECOVERED (${r.detail}) → has_text=true`);
        } else {
          console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: OCR-LAYER3 — "${f.name}" held content-loss (${r.detail})`);
        }
      }
    }

    // ── OCR TABLE-CONFIRM · arc-B (Card #477 ruling 1b, flag AUDIT_OCR_TABLE_CONFIRM, default OFF) ──
    // A numeric-dense rate table (Davis-Bacon WD) is hard-failed WHOLE by the layer-2 caught-misread rule (ocr_suspect
    // with an empty residual — the register-gap docs) even when its wage cells read correctly, stranding the prevailing-
    // wage floor. Give the RATE ROWS a row/column-aware vision confirm: only rows whose wage cell vision confirms EXACTLY
    // are appended (VERBATIM) to the source so a grounded DBA finding is legitimate; a wrong/plausible rate is abstained,
    // never trusted (WRONG_VERDICT=0). Peripheral caught misreads (decision number, dates) do NOT block the rate rows.
    // Does NOT flip has_text (the doc stays honestly ocr_held via the register) — only CONFIRMED rows enter analysis.
    // Flag OFF ⇒ this block never runs (byte-identical).
    if (isEnvOn(process.env.AUDIT_OCR_TABLE_CONFIRM)) {
      const docText = (name: string): string => {
        const marker = `==== DOCUMENT: ${name} ====`;
        const i = fullSource.indexOf(marker);
        if (i < 0) return "";
        const j = fullSource.indexOf("==== DOCUMENT:", i + marker.length);
        return fullSource.slice(i + marker.length, j < 0 ? undefined : j);
      };
      const suspectDocs = input.ingestion.files.filter((f) => f.ingested && isBindingDoc(f) && f.has_text !== true && f.ocr_suspect === true);
      const confirmedBlocks: string[] = [];
      for (const f of suspectDocs) {
        const scan = detectRateTable(docText(f.name));
        if (!scan.isRateTable) continue;
        const b64 = b64ByName.get(normName(f.name));
        if (!apiKey || !b64) { console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: OCR-TABLE-CONFIRM — "${f.name}" rate table held (no ${apiKey ? "base64 match" : "API key"}) → stays content-loss`); continue; }
        const confirmer = makeTableVisionConfirmer({ base64: b64, docName: f.name, apiKey, model: modelFor("crossdoc"), signal, onUsage: (u) => usageCalls.push(u) });
        const res = await gateRateTable(docText(f.name), { docName: f.name, visionConfirm: confirmer });
        if (res.trustedRows.length > 0) {
          confirmedBlocks.push(`\n==== VISION-CONFIRMED WAGE RATES (${f.name}) ====\n${res.trustedText}\n`);
          console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: OCR-TABLE-CONFIRM — "${f.name}" ${res.metrics.trusted}/${res.metrics.total} rate rows vision-confirmed → appended for grounding (wrongTrusted=${res.metrics.wrongTrusted})`);
        } else {
          console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: OCR-TABLE-CONFIRM — "${f.name}" ${res.verdict} (0/${res.metrics.total} rows confirmed) → stays content-loss`);
        }
      }
      if (confirmedBlocks.length) fullSource += confirmedBlocks.join("");
    }
  }

  // GAP B — run the proven engine. bidderProfile is the firm's OPEN-WORLD capability
  // profile (N5; socioeconomic certs only) when the auditing user has a capability
  // statement, else null = unknown firm. Open-world means a listed cert can CLEAR a
  // matching set-aside bar, but silence never proves "fails" → never a false INELIGIBLE.
  const bidderProfile = input.bidderProfile ?? null;
  // (isSamSol computed above — reused here for the completeness cap: a null ingestion means
  // OPPOSITE things for the two — upload = user supplied the docs (complete); SAM = manifest
  // assembly FAILED → single-doc fallback (INCOMPLETE).)
  // N8 — feed the DETERMINISTIC manifest-reconciliation truth into the VERDICT (not just
  // the post-hoc export gate). false → caps a no-bar BID/CAUTION to INCOMPLETE — the
  // engine's own honest output, never a confident verdict on a read it knows was partial.
  // This MUST match the documents-path completeness logic below (else the verdict column
  // and watcher email go green while the report banner says "partial" — the panel BLOCKER):
  //   • manifest present → complete only if every posted doc ingested + no overflow;
  //   • SAM sol, NO manifest → assembly failed → single-doc fallback → INCOMPLETE (!isSamSol=false);
  //   • genuine upload (no manifest expected) → complete (!isSamSol=true);
  //   • any over-budget truncation → INCOMPLETE.
  const manifestComplete = agenticManifestComplete(input.ingestion, assembled.truncated, isSamSol);
  // Step 4a (plumb-only) — carry the SAM-resolved scalar FACTS into the engine so the gate pipeline can
  // read them downstream (Step 4: Nonmanufacturer Rule). naicsCode/typeOfSetAside are already resolved
  // upstream (audit-executor.ts SAM cross-ref). Uploads have no SAM NAICS → null → NMR stays silent.
  // (usageCalls declared above at assembly so MAP tokens are priced into the same ledger.)
  // Brain card 288 — SEALED construction (SF-1442/part36) binding-content manifest over each doc's FULL text (docs =
  // pre-compression). NEVER the compressed digest. Gated: AUDIT_CONSTRUCTION_SWEEP OFF ⇒ undefined ⇒ part36 carrier
  // absent (byte-identical). Step 5 — narrowed OUT_OF_SCOPE (design-heavy CSI/drawing-dominant, NO resolvable offer
  // structure) honest-fail cap, gated by the master flag. W9126 (offer structure present) → null → decided path
  // proceeds. Reuses the INCOMPLETE cap via manifestComplete (no new verdict enum): OOS → honest-fail, no charge.
  const constructionManifest = process.env.AUDIT_CONSTRUCTION_SWEEP === "true"
    ? sweepConstructionManifest(docs.map((d) => ({ name: d.name, text: d.text })), solicitation?.naicsCode ?? null)
    : undefined;
  // OOS reads the PRE-compression full text (docs joined), NOT the lossy digest — else the offer-structure veto could
  // be lost to compression and false-fire OUT_OF_SCOPE on a biddable construction buy (adversarial-review finding).
  const constructionOOS = process.env.AUDIT_CONSTRUCTION_DECIDED === "true"
    && !!detectConstructionOutOfScope({ naicsCode: solicitation?.naicsCode ?? null, fullText: docs.map((d) => d.text).join("\n") });
  if (constructionOOS) console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: construction OUT_OF_SCOPE (design-build, no resolvable offer/submission structure) → honest-fail, no charge`);
  // Brain card 291 — grounding corpus = the pre-compression full text (all docs), so per-doc-decomposition findings
  // ground against source, not the digest. Only consumed when AUDIT_PERDOC_DECOMP is on; otherwise inert.
  const groundingSource = docs.map((d) => d.text).join("\n\n");
  const res = await auditPackage({
    fullSource, bidderProfile, signal, manifestComplete: manifestComplete && !constructionOOS, constructionManifest, groundingSource,
    noticeBodyText: noticeBody?.text,   // B3 (card 421 Fork-3) — delimiter-independent notice-body eligibility floor

    naics: solicitation?.naicsCode ?? null, setAside: solicitation?.typeOfSetAside ?? null,
    // Layer-2 (Brain card 262 — content-aware completeness): the SAM notice type scopes the §L/§M requirement to
    // solicitation-type buys, and form_identified corroborates whether the §L/§M-bearing primary was ingested.
    noticeType: solicitation?.type ?? null,
    formIdentified: input.ingestion?.form_identified,
    onUsage: (u) => usageCalls.push(u),
  });
  // If the overall budget aborted mid-run, never write a "complete" row — that late
  // write would overwrite the terminal-failed status the wrapper already set and strand
  // a half-finished verdict as if it were final. Reject so the worker's terminal path owns it.
  if (signal?.aborted) throw new Error("agentic engine aborted after verdict (overall budget) — not persisting a late-complete row");
  const generatedAt = new Date().toISOString();
  const payload = buildV3Payload(res.decision, res.coverage, res.findings, generatedAt);

  // FAIL-SAFE — reconcile what we READ against SAM's posted manifest (input.ingestion,
  // carried by both the sync route and the worker). The deterministic "all files
  // fetched" guarantee the report surfaces. THREE cases, none silent:
  //   • manifest present  → reconcile; complete only when every posted doc was read,
  //                         else the missing files are named loudly.
  //   • SAM sol, NO manifest → manifest-assembly failed and we fell back to a single
  //                         document; we CANNOT claim completeness → reconciled:false,
  //                         a loud "could not confirm the full set" banner (this was the
  //                         silent-partial hole the panel caught).
  //   • genuine upload    → no SAM manifest expected → no banner (null).
  const ing = input.ingestion;
  payload.documents = ing
    ? {
        // A 0-file manifest can't be reconciled — route it to the "not confirmed"
        // banner rather than the incoherent "read N of 0 documents" partial copy.
        reconciled: ing.files_total > 0,
        posted: ing.files_total,
        read: ing.files_ingested,
        complete: ing.files_total > 0 && ing.files_ingested >= ing.files_total && !ing.overflow,
        missing: (ing.files ?? []).filter((f) => !f.ingested).map((f) => ({ name: f.name, ...(f.reason ? { reason: f.reason } : {}) })),
        // Provenance for honest disclosure copy: an UPLOAD set (isSamSol=false) must NOT
        // claim "retrieved every document the agency posted to SAM.gov" — there is no SAM
        // manifest. Both upload arms (multipart + storage) set ingestion, so this guards
        // the fabricated-SAM-provenance card the report would otherwise render for uploads.
        fromSam: isSamSol,
        // OCR-HELD REGISTER (Brain card #471 ruling A, flag AUDIT_OCR_HELD_REGISTER) — a doc whose OCR RECOVERED text
        // but whose residual tokens the accuracy gate could not confirm (has_text=false via unconfirmed residuals) is
        // NOT "no machine-readable text": it's OCR-recovered-but-held. Surfaced here as a read-list caveat, never in
        // `missing` as content-loss. Label/list only — has_text, the hold, and documents_complete are UNCHANGED.
        ocr_held: [] as Array<{ name: string; residuals: number; reason: string }>,
        ...(ing.overflow ? { note: ing.overflow } : {}),
      }
    : isSamSol
      // Count POSTED FILES only — the L1 notice body is the description field, not a posted document,
      // so it must not inflate the posted/read count shown in the "could-not-confirm" banner.
      ? (() => { const n = docs.filter((d) => d.name !== NOTICE_BODY_DOC_NAME).length; return { reconciled: false, posted: n, read: n, complete: false, missing: [] as Array<{ name: string; reason?: string }> }; })()
      : null;
  // An over-budget source (whole docs dropped) is ALSO an incomplete read — fold it
  // in so documents_complete=false and the dropped docs surface in the report banner.
  if (assembled.truncated && payload.documents) {
    payload.documents.complete = false;
    for (const name of assembled.droppedDocs) payload.documents.missing.push({ name, reason: "dropped: source over size budget" });
    // Chunked-ingest CONTENT LOSS (Brain card 271) — a BINDING doc compressed to an empty digest (the MAP surfaced
    // no verbatim compliance span AND the deterministic clause floor found none). Its material content was NOT
    // captured, so this is an honest INCOMPLETE, never a false-COMPLETE. Named loudly in the banner.
    for (const name of assembled.contentLossDocs) payload.documents.missing.push({ name, reason: "compressed to an empty digest (no extractable compliance content) — content not analyzed" });
  }
  // SILENT-PARTIAL guard (Brain card 224 fork 2) — a BINDING doc that arrived as bytes but contributed ZERO
  // machine-readable text (scanned/image → rode as a vision block the text-only engine never consumed) is a
  // content loss, even though files_ingested counted it. Surface it as missing + documents_complete=false so
  // the report banner, watcher, and the manifestComplete verdict-cap (below) all read honest-incomplete instead
  // of green. Offeror-fill templates are exempt (isBindingDoc=false). Mirrors agenticManifestComplete.
  if (ing && payload.documents) {
    const contentLoss = bindingContentLossDocs(ing);
    if (contentLoss.length) {
      payload.documents.complete = false;
      // OCR-HELD REGISTER (card #471 ruling A) — route an OCR-recovered-but-held doc to the read-list caveat, a genuine
      // no-text doc to `missing`. Flag-OFF ⇒ all → `missing` ⇒ byte-identical. Never touches has_text/the hold.
      const { missing: nlMissing, ocrHeld } = splitContentLoss(contentLoss, isEnvOn(process.env.AUDIT_OCR_HELD_REGISTER));
      for (const m of nlMissing) payload.documents.missing.push(m);
      const heldReg = (payload.documents as { ocr_held?: Array<{ name: string; residuals: number; reason: string }> }).ocr_held;
      if (heldReg) for (const h of ocrHeld) heldReg.push(h);
    }
  }
  // C-1 (Brain C.e) — ONE completeness computation. `manifestComplete` (agenticManifestComplete: truncation +
  // reconciliation + binding-content-loss, line 145) is the SINGLE truth: it was threaded into deriveVerdict
  // (VerdictInputs.documentsComplete → the committal INCOMPLETE cap) AND is persisted here as documents_complete
  // (export gate + banner read it). The prior independent `docsIncomplete` recompute is RETIRED — the verdict, the
  // export gate, and the persisted flag can no longer drift (the payload.documents banner above stays as the
  // human-readable missing-files breakdown of this same signal).
  const recommendation = verdictToRecommendation(res.decision.verdict);
  // SINGLE source of truth for honest-fail (Step 9). ORs all four signals → one persisted field read by
  // billing, the report banner, and the watcher email. In the LIVE engine path only `verdict` is produced
  // (INCOMPLETE / NEEDS_HUMAN_REVIEW); outOfScope + panelHonestFailure live in the not-yet-wired
  // agentic-panel-runner and default false here — the predicate is ready for them once that path is wired.
  const honestFail = isHonestFail({ verdict: res.decision.verdict });

  await markStage(supabase, auditId, "assembly");

  // GAP C+D — persist into the columns the report + list read. compliance_score
  // stays NULL (the engine emits no 0-100 score — the report page already has an
  // unscored path). The report + PDF routes branch on compliance_json.engine.
  const stopperCount = (payload.showStoppers.length ? payload.showStoppers : payload.findings.filter((f) => f.disposition === "disqualifying")).length;
  // ENGINE-5-ROOT #2 (engine half) — persist the document-stated offer-due date so the render layer can flag a
  // SAM/document deadline conflict (build-data.ts deadlineConflictNote). SAM stays authoritative; this only powers
  // a "verify" caveat. Conservative extractor — labeled numeric/ISO dates only; empty when none confidently found.
  const documentDeadlines = extractDocumentDeadlines(fullSource);
  // Card #477 ruling 2 — resolve the notice-body UPDATE stack (newest-first, dateline≠due-date). Captured for the render
  // so a reset ("a new due date will be provided") surfaces the TRUE state instead of a stale metadata date or an
  // UPDATE-header/RFI-filename leak. Flag AUDIT_DEADLINE_UPDATE_STACK OFF ⇒ status "none" ⇒ field omitted (byte-identical).
  const noticeBodyDeadline = resolveNoticeBodyDeadline(noticeBody?.text ?? "");
  const completeUpdate = {
    overview_summary: `Agentic verdict: ${res.decision.verdict.replace(/_/g, " ")}.`,
    overview_json: { engine: "agentic_v3" },
    compliance_summary: res.decision.reason.slice(0, 600),
    risks_summary: stopperCount ? `${stopperCount} show-stopper bar(s) drive this verdict.` : "No non-curable bars found.",
    risks_json: { engine: "agentic_v3", show_stoppers: stopperCount },
    compliance_score: null,
    recommendation,
    bid_recommendation: res.decision.reason.slice(0, 600),
    status: "complete",
    current_stage: "assembly",
    completed_at: generatedAt,
    compliance_json: {
      engine: "agentic_v3",
      analysis_phase: "done",
      honest_fail: honestFail,
      // Deterministic manifest-reconciliation flag — false when a posted SAM
      // document could not be ingested (the report flags it loudly). CEO 2026-06-28:
      // a partial package ALSO gates export (shouldGateExport reads this) — a report
      // we couldn't fully ground never leaves as a clean PDF.
      documents_complete: manifestComplete,
      generated_at: generatedAt,
      source_chars: fullSource.length,
      doc_count: docs.length,
      source_truncated: assembled.truncated,
      // ENGINE-5-ROOT #2 — document-stated offer-due date(s) for the render conflict caveat (SAM stays authoritative).
      ...(documentDeadlines.length ? { deadlines: documentDeadlines } : {}),
      // Card #477 ruling 2 — the notice-body UPDATE-stack controlling state (reset_tbd / stated), for the render caveat.
      ...(noticeBodyDeadline.status !== "none" ? { notice_body_deadline: noticeBodyDeadline } : {}),
      ...(assembled.droppedDocs.length ? { dropped_docs: assembled.droppedDocs } : {}),
      // R3 (Brain card 271) — READ-MODE disclosure. When AUDIT_CHUNKED_INGEST is on, each doc is read either
      // "full" (verbatim whole doc) or "map-reduce" (compliance-relevant verbatim spans; NOT a full-text read).
      // The report discloses this so a reviewer knows a compressed doc was read for compliance, not cover-to-cover.
      // SECURITY: read_modes[].name is an attacker-influenceable document NAME (upload / SAM attachment) — inert
      // today (no renderer reads it); ANY future UI surfacing it MUST route the name through escapeHtml (stored-XSS).
      ...(readModes ? { read_modes: readModes.map((r) => ({ name: r.name, mode: r.mode, ...(r.mode === "map-reduce" ? { chunks: r.chunks, spans_kept: r.spansKept, spans_rejected: r.spansRejected, failed_windows: r.failedWindows } : {}) })) } : {}),
      // C-19 interim guard (Brain C.f) — DETECT + DISCLOSE only, NEVER a verdict cap (supersession resolution is
      // its own tranche). Surface that amendments are present (so a reviewer knows superseded terms are unresolved)
      // + per-finding document provenance (which doc grounded each finding).
      // SECURITY: finding_provenance[].doc is an attacker-influenceable document NAME (upload filename / SAM
      // attachment name). It is inert today (no renderer reads it). ANY future UI that surfaces it MUST route the
      // name through escapeHtml (the current audit-v3-report renderer already escapes the doc-name it shows) —
      // a raw binding would be stored XSS.
      ...(detectAmendments(fullSource)
        ? { amendments_present: true, amendment_disclosure: "This package contains one or more amendments (SF-30 / amendment of solicitation). Superseded terms are NOT yet automatically resolved — verify the latest amendment governs before relying on any cited term." }
        : {}),
      finding_provenance: findingProvenance(fullSource, res.findings),
      // Card 274 RULING 1 (Brain) — persist every skeptic DROP to the durable audit trail (finding id/requirement/
      // citation, the refutation reason, and dropReason). The `empty_corrected` rows are the closed false-resurrection
      // hole (a refuted finding that used to survive unchanged → false INELIGIBLE/NO_BID); `overturned` rows are plain
      // adversarial drops. Telemetry-visible per the ruling; omitted when no drops occurred (byte-stable).
      // SECURITY: requirement/citation/refutation are model-/source-derived text — inert today (no renderer reads
      // verifier_drops). ANY future UI that surfaces them MUST route through escapeHtml (stored-XSS), like the fields above.
      ...(res.verifierDrops?.length ? { verifier_drops: res.verifierDrops } : {}),
      v3: payload,
    },
  };

  // Retry the persist in-process: the agentic run already SUCCEEDED (paid Opus/Sonnet
  // work). A transient DB blip must not discard a finished audit — retry the write
  // rather than fail the run (which would re-spend the engine on the worker's re-run).
  // Re-check the budget IMMEDIATELY before the persist write: the abort can fire during
  // the awaited markStage("assembly")/payload work above. Without this a run aborted at
  // ~270s could still write a "complete" row over the terminal-failed status (code-review #2).
  if (signal?.aborted) throw new Error("agentic engine aborted before persist (overall budget) — not writing a late-complete row");
  let persistErr: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.from("audits").update(completeUpdate).eq("id", auditId);
    if (!error) { persistErr = null; break; }
    persistErr = error.message;
    console.warn(`[AGENTIC-V3-PRIMARY] persist attempt ${attempt}/3 failed for ${auditId}: ${error.message}`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
  }
  if (persistErr) throw new Error(`agentic persist failed after 3 attempts: ${persistErr}`);

  // RUN-RECORD BANK (AUDIT_BANK_RUN_RECORD, default-OFF) — the engine-rebuild cheap-proof multiplier. Banks a
  // COMPLETE replayable RunRecord (real findings + inputs + coverage + fullSource) to durable storage so a fix
  // can be graded on real data for $0 (scripts/audit-ai/pull-run-records.ts → replay → gold-corpus-score.ts).
  // FLAG-GATED + best-effort. Gate-2 hardening: the ENTIRE call (incl. arg construction — property reads, billable())
  // is wrapped in a caller-side try/catch so NOTHING here — even a throw building the args, even with the flag OFF —
  // can fail a finished, persisted, paid audit (the internal try/catch could not protect arg evaluation). Flag OFF ⇒
  // pure no-op (byte-identical). manifestComplete is banked as the EFFECTIVE value the run USED (…&& !constructionOOS),
  // matching what auditPackage received, so the $0 replay reproduces the real verdict. See audit-run-record-bank.ts.
  try {
    await bankRunRecord(supabase, {
      auditId,
      sol: solicitation?.solicitationNumber || solicitation?.noticeId || auditId,
      startedAt: generatedAt,
      flags: {
        AUDIT_SECTION_M_DEPTH: process.env.AUDIT_SECTION_M_DEPTH,
        AUDIT_PROCUREMENT_TYPE_SECTIONS: process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS,
        AUDIT_CHUNKED_INGEST: process.env.AUDIT_CHUNKED_INGEST,
      },
      result: res,
      input: {
        fullSource,
        bidderProfile,
        naics: solicitation?.naicsCode ?? null,
        setAside: solicitation?.typeOfSetAside ?? null,
        manifestComplete: manifestComplete && !constructionOOS,
      },
      billing: { honestFail, billable: billable(honestFail) },
      commercialHonestFail: process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS === "true",
    });
  } catch (bankErr) {
    console.warn(`[RUN-RECORD-BANK] call-site guard (audit unaffected): ${bankErr instanceof Error ? bankErr.message : String(bankErr)}`);
  }

  // STEP 9 (AUDIT_HONESTFAIL_NO_CHARGE, default-OFF) — USAGE LEDGER (Brain schema B). Append ONE usage_events
  // row per COMPLETED audit, with `billable` stamped at decision time: a customer is charged ONLY for a delivered
  // COMMITTAL verdict; with the flag ON an honest-fail (the single honest_fail field above) stamps billable=false
  // (no charge). Flag OFF ⇒ billable always true ⇒ every row billable=true (byte-identical: the table is absent
  // pre-migration ⇒ the insert is a logged no-op). Shared by the customer POST and the watcher (both route here).
  // Idempotent + FAILS SAFE (never throws) ⇒ runs AFTER a successful persist and can never block an audit.
  const isBillable = billable(honestFail);
  await decrementAuditQuota(supabase, auditId, { billable: isBillable, honestFail, verdict: res.decision.verdict });

  // COST cockpit (fa195) — DECOUPLED + fail-safe: record what this audit's tokens cost, from the per-run tally.
  // No-ops safely if the fa195 cost columns aren't applied yet. Never throws (recordAuditCost swallows all).
  // source="customer": prod front-door path (the CEO's own dogfood runs also route here; a ceo-vs-customer
  // split by user_id is a later refinement — cogs=true either way). The Cost/Audit ledger reads these via a pull.
  const { perModel, totals } = aggregate(usageCalls);
  await recordAuditCost(supabase, auditId, { perModel, totals, source: "customer" });

  console.log(`[AGENTIC-V3-PRIMARY] ${auditId}: verdict=${res.decision.verdict} → recommendation=${recommendation} honest_fail=${honestFail} docs_complete=${manifestComplete} (${payload.documents?`${payload.documents.read}/${payload.documents.posted}`:"n/a"}) findings=${res.findings.length} src=${(fullSource.length / 1024).toFixed(0)}KB`);

  return { recommendation, compliance_score: null, bid_recommendation: completeUpdate.bid_recommendation };
}
