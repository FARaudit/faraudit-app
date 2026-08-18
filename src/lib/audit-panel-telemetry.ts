// ── PANEL TELEMETRY — capture-only, verdict-inert (plan step 1) ───────────────────────────────────────
//
// WHY. The panel is the single most expensive thing the engine does: measured on run 3b5bba30 it made
// 67 paid calls costing $5.67 — 47% of an $11.96 run — and ZERO of the 40 findings that reached the
// customer carried a panel seat name. But the record could not say WHY, because `PanelResult.fired`
// was persisted nowhere. "The gate suppressed it" and "it ran and produced nothing" are
// indistinguishable in every banked record, and they need OPPOSITE fixes: one is a gate bug, the other
// is a panel that is not earning its cost. Until this exists, any keep-or-cut decision on 47% of the
// budget rests on one run plus inference — and an inference on exactly this point was already measured
// WRONG once (the manifest gate had PASSED; the replay is what caught it).
//
// CAPTURE-ONLY. Nothing here is read by deriveVerdict, by the report, or by any gate. It is written to
// the run record and read by humans and $0 replays. It cannot change a verdict because nothing consults
// it — the same posture as the existing `diagnostics` slot (audit-orchestrator.ts:205).
//
// EVERY FIELD ANSWERS A QUESTION THAT COST MONEY TO ASK BADLY. No field is here because it was easy to
// collect; each one closes an ambiguity that has already burned a real investigation.

/** One panel run, reduced to the facts a post-mortem actually needs. */
export interface PanelTelemetry {
  /** THE headline. false ⇒ the manifest gate suppressed the panel entirely (no calls, no cost). */
  fired: boolean;
  /** Why it was suppressed, when it was. `missing` is the gate's own list, not a reconstruction. */
  manifestOk: boolean;
  manifestMissing: string[];
  /** Seats attempted, and any that failed. A seat that errors is invisible in the cost ledger. */
  seats: number;
  seatErrors: Array<{ key: string; error: string }>;
  /** What the panel PRODUCED, before anything downstream could discard it. */
  producedFindings: number;
  /** What SURVIVED to the customer carrying a panel seat name. producedFindings > 0 with
   *  survivingFindings === 0 is the exact 3b5bba30 signature, and it now reads off the record instead
   *  of needing a replay to discover. */
  survivingFindings: number;
  /** The adversarial verifier — ran, or nulled with a captured reason. */
  verifierRan: boolean;
  verifierError: string | null;
  /** The chief judge's verdict word, and whether it cleared the committal set. A NON-committal judge
   *  makes the executor SKIP the rationale fold, which is the leading hypothesis for why panel work
   *  never reaches the customer. Recording the word and the boolean separately means the next reader
   *  does not have to re-derive the set membership from memory. */
  judgeVerdict: string | null;
  judgeCommittal: boolean;
  /** Did the fold actually run. The three preconditions are ANDed in one `if`, so a false here plus the
   *  fields above says WHICH precondition failed without opening the executor. */
  foldApplied: boolean;
  /** Sections a lens could not see because they exceeded its budget — the routing failure, recorded at
   *  the moment it happens rather than inferred later from a 2,098,225-char replay. */
  droppedSectionsForBudget: string[];
}

/** Shape of the panel result this reads. Declared structurally rather than imported so this module
 *  stays free of the runner (and of any import cycle through the executor). */
interface PanelResultLike {
  fired: boolean;
  manifest?: { ok?: boolean; missing?: string[] } | null;
  panelists?: Array<{ key: string; name: string; error?: string }>;
  verifier?: unknown;
  verifierError?: string;
  judgment?: { verdict?: string } | null;
  typedFindings?: unknown[];
  droppedSectionsForBudget?: string[];
}

/** Build the telemetry. PURE and TOTAL: every input is optional and a null panel yields a `fired:false`
 *  record rather than an absent one, because "the panel did not run" is itself the answer on a suppressed
 *  run and an ABSENT field would be indistinguishable from a record banked before this existed. */
export function buildPanelTelemetry(
  panel: PanelResultLike | null | undefined,
  opts: {
    /** the FINAL findings that reached the customer — used to count panel-attributed survivors */
    finalFindings?: Array<{ lens?: string | null }>;
    /** display names of the panel seats; a final finding whose `lens` matches one is panel-attributed
     *  (panel-findings-bridge stamps `lens: p.name`, the DISPLAY name — distinguishable from the lenses'
     *  snake_case keys by construction) */
    seatDisplayNames?: string[];
    judgeCommittal?: boolean;
    foldApplied?: boolean;
  } = {},
): PanelTelemetry {
  const seatNames = new Set((opts.seatDisplayNames ?? []).filter(Boolean));
  const surviving = (opts.finalFindings ?? []).filter((f) => f?.lens && seatNames.has(f.lens)).length;
  return {
    fired: !!panel?.fired,
    manifestOk: !!panel?.manifest?.ok,
    manifestMissing: panel?.manifest?.missing ?? [],
    seats: panel?.panelists?.length ?? 0,
    seatErrors: (panel?.panelists ?? []).filter((p) => p?.error).map((p) => ({ key: p.key, error: String(p.error).slice(0, 200) })),
    producedFindings: panel?.typedFindings?.length ?? 0,
    survivingFindings: surviving,
    verifierRan: panel?.verifier != null,
    verifierError: panel?.verifierError ?? null,
    judgeVerdict: panel?.judgment?.verdict ?? null,
    judgeCommittal: !!opts.judgeCommittal,
    foldApplied: !!opts.foldApplied,
    droppedSectionsForBudget: panel?.droppedSectionsForBudget ?? [],
  };
}

/** One-line summary for the run log, so a live tail shows the answer without opening the record. */
export function panelTelemetryLine(t: PanelTelemetry): string {
  if (!t.fired) return `[panel] SUPPRESSED — manifest ok=${t.manifestOk} missing=[${t.manifestMissing.join(", ")}] · no calls, no cost`;
  return `[panel] FIRED — ${t.seats} seat(s), ${t.seatErrors.length} error(s) · produced ${t.producedFindings} finding(s), ${t.survivingFindings} survived to the customer · verifier=${t.verifierRan ? "ran" : `null${t.verifierError ? ` (${t.verifierError.slice(0, 60)})` : ""}`} · judge=${t.judgeVerdict ?? "none"} committal=${t.judgeCommittal} fold=${t.foldApplied}${t.droppedSectionsForBudget.length ? ` · DROPPED-FOR-BUDGET [${t.droppedSectionsForBudget.join(", ")}]` : ""}`;
}
