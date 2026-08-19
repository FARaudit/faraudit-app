// CMMC AGGREGATION — one row per solicitation, and only a FINISHED run may answer for it.
//
// Extracted from src/app/api/cmmc-readiness/route.ts for the same reason inferLevel was: the
// counts a customer reads are produced here, so they have to be runnable against real audit rows
// without a request context. See test/cmmc-readiness-status.test.ts.
//
// A FAILED RUN IS NOT A CLEAN SOLICITATION. `audits` holds every run, finished or not — 11 of the
// 116 live rows are status 'failed' — and a failed run carries no compliance_json, so inferLevel
// returns level "0" for it. Counted straight, that row lands in the "No CMMC named" bucket, whose
// own caption on the page reads "nothing in the audit triggers a level". That is a positive claim
// about an audit that does not exist. The customer is told a solicitation is clear of CMMC when
// what actually happened is that the run never produced an answer.
//
// Two things follow, and they are separate:
//   1. A solicitation whose only runs failed is COUNTED but not CLASSIFIED. It stays in the
//      solicitation total (the customer paid for those runs and must see them) and is reported
//      through `unanalyzed`, never through `distribution`.
//   2. A solicitation with BOTH a complete run and a newer failed one keeps the complete one.
//      Newest-wins alone would let a failed re-run shadow a known Level 2 obligation and delete
//      it from the page — zero live instances today, and nothing in the data model prevents it
//      tomorrow, since re-running after an amendment is the normal path.

import { inferLevel } from "./cmmc-levels";

export type CmmcRow = Record<string, unknown>;

export interface CmmcFlaggedRow {
  id: string;
  notice_id: string | null;
  solicitation_number: string | null;
  title: string | null;
  agency: string | null;
  created_at: string | null;
  response_deadline: string | null;
  matched_on: string | null;
}

export interface CmmcAggregate {
  distribution: Record<"0" | "1" | "2" | "3", number>;
  byLevel: Record<"1" | "2" | "3", CmmcFlaggedRow[]>;
  /** Every solicitation the customer has run, analyzed or not. */
  totalSolicitations: number;
  /** What `distribution` sums to. The two differ whenever a run produced no analysis. */
  analyzedSolicitations: number;
  /** Audit RUNS read, before the per-solicitation collapse. */
  totalAudited: number;
  duplicatesCollapsed: number;
  /** Solicitations with no finished run — the difference between the two totals above. */
  unanalyzed: number;
  /** …of which: the run ended and produced nothing. Re-running is the only way to an answer. */
  unanalyzedFailed: number;
  /** …of which: a run is still in flight. An answer is coming. */
  unanalyzedRunning: number;
  reason: "no-audits" | "none-analyzed" | "none-flagged" | null;
}

// ANALYZED = the run said it finished AND left a compliance record. Both halves are required,
// because the two failure directions are different bugs and either one alone reads as "clear":
// a 'failed' row that somehow carries partial JSON is a run that stopped mid-analysis, and a
// 'complete' row with no JSON is a write that did not land. Neither can answer a compliance
// question, so neither is allowed to.
export function isAnalyzed(a: CmmcRow): boolean {
  return String(a.status ?? "") === "complete" && a.compliance_json != null;
}

function keyOf(a: CmmcRow): string {
  return String(a.solicitation_number ?? "").trim()
    || String(a.notice_id ?? "").trim()
    || `id:${String(a.id)}`;
}

function ts(a: CmmcRow): number {
  const t = Date.parse(String(a.created_at ?? ""));
  return Number.isNaN(t) ? 0 : t;
}

export function aggregateCmmc(rawRows: CmmcRow[]): CmmcAggregate {
  // Newest first, asserted here rather than assumed from the query's ORDER BY — a later edit to
  // the select would otherwise silently start keeping the oldest run of each solicitation.
  const newestFirst = [...rawRows].sort((x, y) => ts(y) - ts(x));

  // ONE ROW PER SOLICITATION. Re-auditing is normal — an amendment lands, the customer re-runs —
  // and every run was its own row here, so one requirement appeared three and four times and each
  // repeat counted again toward "solicitations that require CMMC".
  //
  // The key is the solicitation number, then the notice id, and finally the audit's own id.
  // Falling back to the id matters: without it every row carrying neither identifier would share
  // one key and collapse into a single arbitrary survivor, hiding real solicitations.
  //
  // NO "THE LEVEL CHANGED BETWEEN RUNS" FLAG. It was designed and then refuted by the corpus. The
  // concern is real — an amendment can change the requirement — but the flag needs a signal
  // separating "the solicitation changed" from "the engine ran again", and the audit row carries
  // no amendment or version identifier. Across the 116 live audits, all 18 adjacent re-run pairs
  // whose inferred level differs are under 24 hours apart (median ~3h) and 16 used the identical
  // model, while the 8 pairs a day or more apart all kept the same level. The flag would have
  // fired 18 times, none of them an amendment.
  const groups = new Map<string, CmmcRow[]>();
  for (const a of newestFirst) {
    const k = keyOf(a);
    const g = groups.get(k);
    if (g) g.push(a); else groups.set(k, [a]);
  }

  // Newest ANALYZED run wins; a solicitation falls back to its newest run only when no run of it
  // ever finished. This is what stops a failed re-run from deleting a known obligation.
  const rows: CmmcRow[] = [];
  for (const g of groups.values()) rows.push(g.find(isAnalyzed) ?? g[0]);

  const distribution: Record<"0" | "1" | "2" | "3", number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  const byLevel: Record<"1" | "2" | "3", CmmcFlaggedRow[]> = { "1": [], "2": [], "3": [] };
  let unanalyzedFailed = 0;
  let unanalyzedRunning = 0;

  for (const a of rows) {
    if (!isAnalyzed(a)) {
      // 'failed' is the worker's own terminal marker; a 'complete' row with no compliance record
      // is the same outcome for the reader — the run is over and there is no answer — so it is
      // reported the same way. Anything else is still in flight.
      const status = String(a.status ?? "");
      if (status === "failed" || status === "complete") unanalyzedFailed++;
      else unanalyzedRunning++;
      continue;
    }
    const { level, trigger } = inferLevel(a);
    distribution[level] += 1;
    if (level !== "0") {
      byLevel[level].push({
        id: String(a.id),
        notice_id: (a.notice_id as string) || null,
        solicitation_number: (a.solicitation_number as string) || null,
        title: (a.title as string) || null,
        agency: (a.agency as string) || null,
        created_at: (a.created_at as string) || null,
        response_deadline: (a.response_deadline as string) || null,
        matched_on: trigger
      });
    }
  }

  const unanalyzed = unanalyzedFailed + unanalyzedRunning;
  const analyzed = rows.length - unanalyzed;
  const flagged = distribution["1"] + distribution["2"] + distribution["3"];

  // 'none-analyzed' is its own state and must never collapse into 'none-flagged'. A customer whose
  // every run failed has a page with nothing on it in both cases, and the two mean opposite
  // things: one is "we looked and found no CMMC requirement", the other is "we never looked".
  const reason: CmmcAggregate["reason"] =
    rows.length === 0 ? "no-audits"
      : analyzed === 0 ? "none-analyzed"
        : flagged === 0 ? "none-flagged"
          : null;

  return {
    distribution,
    byLevel,
    totalSolicitations: rows.length,
    analyzedSolicitations: analyzed,
    totalAudited: rawRows.length,
    duplicatesCollapsed: rawRows.length - rows.length,
    unanalyzed,
    unanalyzedFailed,
    unanalyzedRunning,
    reason
  };
}
