// Defense Spending Intel — nightly cron worker.
// For each NAICS code, queries USAspending API v2 for FY2026 + FY2025 metrics
// and UPSERTs one row per (naics_code, fiscal_year) into defense_spending_intel.
//
// Codes to pull are read from capability_statements.naics_codes — the customer
// profile — NOT from an environment variable. NAICS_CODES remains an OPTIONAL
// supplement for prospect/demo codes nobody has declared yet; it can only add.
//
// Env: NAICS_CODES (optional supplement, comma-separated) ·
//      NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//
// Schedule (Railway): suggest 0 4 * * * (04:00 UTC = 23:00 prior-day CT) so
// USAspending's daily refresh has settled before we pull. Set as a separate
// Railway service — does NOT modify sam-ingest.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[defense-spending] missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Dynamic import after env load so module-level env captures resolve.
// @ts-expect-error tsx
const usaNs: any = await import("./usaspending.ts");
const usa = usaNs.default ?? usaNs;

import { createClient } from "@supabase/supabase-js";
import { unionNaicsCodes, customerCodeCount } from "./naics";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Extra codes to pull beyond what customers have declared — prospect research,
 *  a demo, a market we want data on before anyone asks. OPTIONAL, and a
 *  SUPPLEMENT: it can only ever add codes, never restrict the set. */
const EXTRA_NAICS = (process.env.NAICS_CODES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

/* WHICH CODES TO PULL IS A QUESTION ABOUT CUSTOMERS, SO IT IS ASKED OF THE
   CUSTOMER TABLE — not of a hand-maintained environment variable.

   `capability_statements.naics_codes` is what scopes this customer's SAM feed,
   Teaming, KO intel and the engine's bidder profile. It is the platform key. If
   this worker pulls from a list somebody typed into Railway once, then the day a
   customer adds a code, /defense-spending has no row for it — and the page shows
   an empty market rather than a wrong one, so nothing looks broken and nobody
   finds out. The env var could only ever be a snapshot of the answer, and it
   goes stale the moment a customer edits their profile.

   Measured 2026-08-12: the Railway variable listed 11 codes; the one capability
   statement on record declares 3 (332710, 336412, 336611). The list was a
   superset that day, so nothing was being lost — but nothing kept it that way,
   and the failure it protects against is silent.

   ⛔ A FAILED READ THROWS. It must not fall back to the env var: that would pull
   a stale set while reporting success, which is the exact drift this removes. A
   nightly that fails loudly is retried; one that silently refreshes the wrong
   codes is not noticed. An EMPTY read is different — zero customers is a real
   answer, not a failure, and is reported as such. */
async function resolveNaicsCodes(): Promise<string[]> {
  const { data, error } = await supabase
    .from("capability_statements")
    .select("naics_codes");
  if (error) {
    throw new Error(
      `[defense-spending] could not read capability_statements: ${error.message}. ` +
      `Refusing to run — pulling a stale code list would look like success.`
    );
  }

  const declared = customerCodeCount(data);
  const all = unionNaicsCodes(data, EXTRA_NAICS);
  console.log(
    `[defense-spending] codes: ${declared} from ${(data ?? []).length} capability statement(s)` +
    `${EXTRA_NAICS.length ? ` + ${EXTRA_NAICS.length} from NAICS_CODES` : ""} = ${all.length} to pull`
  );
  if (declared === 0) {
    console.warn(
      `[defense-spending] ⚠ NO customer declares a NAICS code. ` +
      `${EXTRA_NAICS.length ? "Pulling only the NAICS_CODES supplement." : "Nothing to pull."}`
    );
  }
  return all;
}

// FY definition: fiscal year N = Oct 1 (N-1) through Sep 30 N
// FY2026 = 2025-10-01 → 2026-09-30 (current, in progress)
// FY2025 = 2024-10-01 → 2025-09-30 (closed)
// FY2024 = 2023-10-01 → 2024-09-30 (closed · FA-96b · 3-year trend reference)
interface FYWindow { fy: number; start: string; end: string }
const FY_WINDOWS: FYWindow[] = [
  { fy: 2024, start: "2023-10-01", end: "2024-09-30" },
  { fy: 2025, start: "2024-10-01", end: "2025-09-30" },
  { fy: 2026, start: "2025-10-01", end: "2026-09-30" }
];

interface IntelRow {
  naics_code: string;
  fiscal_year: number;
  total_obligations: number | null;
  sb_obligations: number | null;
  sb_pct: number | null;
  top_recipients: unknown;
  sb_recipients: unknown;          // FA-96b
  agency_breakdown: unknown;
  state_breakdown: unknown;
  contract_type_breakdown: unknown;
  // Kept, and still written. These are "contracts expiring in N days", which is
  // not a recompete — 85% of what they return is delivery/purchase orders that
  // are never competed. _180d is read live by src/lib/bd-os/defense-spending.ts
  // and Design holds card 826 against the panel it feeds, so it is replaced when
  // the refinement lands, not emptied underneath a surface still in flight.
  recompetes_expiring_90d: unknown;
  recompetes_expiring_180d: unknown;
  // Definitive contracts ending 12-18 months out — the window a recompete is
  // actually solicited in. Migration 034.
  recompetes_upcoming: unknown;
  // Award-level records — the panels that need a single award's value, buying
  // office and duration. A SAMPLE of the largest, with its own count and cap
  // stored beside it so no reader can mistake it for the whole. Also carries
  // `set_aside_mix`, which is NOT per-award: set-aside is not a field this
  // endpoint returns, only a filter it accepts, so it arrives as a faceted
  // distribution with its own total and unaccounted residual.
  award_sample: unknown;
  yoy_delta_pct: number | null;
  // WRITTEN EXPLICITLY, not left to the column default. The default fires on
  // INSERT only, so an upsert that UPDATES an existing row left this reading
  // whenever that row was first created — measured 2026-08-11: 18 of 27 rows
  // carried new FY2026 totals (336412 went 2.56B -> 4.98B) under a timestamp
  // three months old. /defense-spending prints this date on the page as the
  // measurement date, so a stale value there is not untidy, it is false.
  refreshed_at: string;
}

/* Thrown when a row could not be MEASURED, as distinct from a market that is
   empty. The caller skips the write and leaves whatever is stored alone. */
class UnmeasuredRow extends Error {}

async function buildRow(naics: string, win: FYWindow, priorTotal: number | null): Promise<IntelRow> {
  const f = { naics, fyStart: win.start, fyEnd: win.end };
  usa.resetTransportFailures();
  const [total, sb, recipients, sbRecipients, agencies, states, contractTypes, rec90, rec180, recUpcoming, awardSample, setAsideMix] = await Promise.all([
    usa.fetchTotalObligations(f),
    usa.fetchSmallBusinessObligations(f),
    usa.fetchTopRecipients(f),
    usa.fetchSBRecipients(f),       // FA-96b
    usa.fetchAgencyBreakdown(f),
    usa.fetchStateBreakdown(f),
    usa.fetchContractTypeBreakdown(f),
    usa.fetchRecompetes(f, 0, 90),
    usa.fetchRecompetes(f, 90, 180),
    usa.fetchUpcomingRecompetes(f),
    usa.fetchAwardSample(f),
    // Rides inside award_sample rather than taking a column of its own — the
    // column is JSONB, it has no readers yet, and a second migration applied by
    // hand in Studio is a second chance for the schema to lag the worker.
    usa.fetchSetAsideMix(f)
  ]);
  /* ⛔ NEVER WRITE AN UNPROVEN ZERO OVER A MEASURED ROW.
     On 2026-08-12 USAspending's WAF blocked this worker mid-run — 326 requests
     refused — and because a blocked request and an empty market both arrive as
     null, the run wrote nulls over 14 of 33 rows and exited 0. 336412 FY2026
     went from $4.99B to NULL; all three 336611 rows were emptied. The page reads
     those rows as a market with no spending, which is a fabricated fact about
     the customer's market, not a gap.
     A transport failure anywhere in this row makes every zero in it unproven, so
     the row is abandoned rather than written. Yesterday's measured row survives
     with its own refreshed_at, which is honest: it says when it was true. */
  const failures = usa.transportFailureCount();
  if (failures > 0) {
    throw new UnmeasuredRow(
      `${naics}/FY${win.fy}: ${failures} request(s) never answered — refusing to write. ` +
      `Stored values kept; they carry their own refreshed_at.`
    );
  }
  const sbPct = total && total > 0 && sb != null ? (sb / total) * 100 : null;
  const yoy = priorTotal != null && priorTotal > 0 && total != null ? ((total - priorTotal) / priorTotal) * 100 : null;
  return {
    naics_code: naics,
    fiscal_year: win.fy,
    total_obligations: total,
    sb_obligations: sb,
    sb_pct: sbPct,
    top_recipients: recipients,
    sb_recipients: sbRecipients,
    agency_breakdown: agencies,
    state_breakdown: states,
    contract_type_breakdown: contractTypes,
    recompetes_expiring_90d: rec90,
    recompetes_expiring_180d: rec180,
    recompetes_upcoming: recUpcoming,
    award_sample: { ...awardSample, set_aside_mix: setAsideMix },
    yoy_delta_pct: yoy,
    refreshed_at: new Date().toISOString()
  };
}

/** Columns this worker writes that are applied BY HAND in Studio, with the
 *  migration that adds each. Every entry here is a column that can legitimately
 *  be missing at runtime. */
const HAND_APPLIED_COLUMNS: Array<{ column: keyof IntelRow; migration: string }> = [
  { column: "award_sample", migration: "033_defense_spending_award_sample.sql" },
  { column: "recompetes_upcoming", migration: "034_defense_spending_recompetes_upcoming.sql" }
];

/** Deploy order must not matter. This worker and the migrations that add its
 *  newer columns land through different systems — a push to main deploys the
 *  Railway service, while the column is applied by hand in Studio — so for some
 *  window one will exist without the other. PostgREST rejects the WHOLE row when
 *  it carries an unknown column, so an unguarded write would have taken down the
 *  nightly refresh of every field that already worked, in order to add one that
 *  did not.
 *
 *  So: write the full row, and if the schema has not caught up, drop whichever
 *  new fields it does not know and write everything else. The retry stays narrow
 *  — it fires only on an unknown-column error naming a column on the list above,
 *  and it says which one in the log rather than degrading silently.
 *
 *  ⚠ THE LIST IS THE GUARD. When this guard named only `award_sample`, adding a
 *  second hand-applied column meant an unapplied migration no longer matched the
 *  narrow test and threw instead — taking down the whole nightly refresh, which
 *  is precisely the outcome the guard was written to prevent. A new hand-applied
 *  column goes on the list in the same change that starts writing it. */
async function upsert(row: IntelRow): Promise<void> {
  const { error } = await supabase
    .from("defense_spending_intel")
    .upsert(row, { onConflict: "naics_code,fiscal_year" });
  if (!error) return;

  const msg = error.message || "";
  const isSchemaError = /(column|schema cache|PGRST204)/i.test(msg);
  const missing = HAND_APPLIED_COLUMNS.filter((c) => new RegExp(String(c.column)).test(msg));
  if (!isSchemaError || missing.length === 0) {
    throw new Error(`upsert ${row.naics_code}/${row.fiscal_year}: ${msg}`);
  }

  console.warn(
    `[defense-spending] column(s) not present yet: ${missing.map((c) => c.column).join(", ")} — ` +
    `writing ${row.naics_code}/FY${row.fiscal_year} without them. ` +
    `Apply supabase/migrations/${missing.map((c) => c.migration).join(" + ")} to enable the affected panels.`
  );
  const reduced = { ...row };
  for (const c of missing) delete reduced[c.column];
  const { error: retryErr } = await supabase
    .from("defense_spending_intel")
    .upsert(reduced, { onConflict: "naics_code,fiscal_year" });
  if (retryErr) throw new Error(`upsert ${row.naics_code}/${row.fiscal_year}: ${retryErr.message}`);
}

async function main() {
  const startedAt = new Date();
  let skipped = 0;
  const codes = await resolveNaicsCodes();
  console.log(`[defense-spending] started ${startedAt.toISOString()} · NAICS ${codes.join(",")}`);

  for (const naics of codes) {
    console.log(`[defense-spending] processing NAICS ${naics}...`);
    // Process FY2024 → FY2025 → FY2026 sequentially so each year's YoY can
    // reference the prior year's total. FY2024 has no prior reference → yoy=null.
    let priorTotal: number | null = null;
    for (const win of FY_WINDOWS) {
      let row: IntelRow;
      try {
        row = await buildRow(naics, win, priorTotal);
      } catch (err) {
        if (err instanceof UnmeasuredRow) {
          console.warn(`[defense-spending] ⚠ SKIPPED ${err.message}`);
          skipped++;
          // priorTotal is deliberately NOT advanced — a year we could not measure
          // must not become the denominator of the next year's YoY.
          priorTotal = null;
          continue;
        }
        throw err;
      }
      await upsert(row);
      const sbCount = Array.isArray(row.sb_recipients) ? row.sb_recipients.length : 0;
      const sample = row.award_sample as { sampled?: number; truncated?: boolean; set_aside_mix?: { unaccounted?: number | null } };
      const ctCount = Array.isArray(row.contract_type_breakdown) ? row.contract_type_breakdown.length : 0;
      // pricing= and setaside_gap= are here so the next run is OBSERVABLE. The
      // pricing breakdown was empty in every stored row for its whole life and
      // nothing said so, because the only place it would have shown was a panel
      // nobody had built yet.
      const gap = sample?.set_aside_mix?.unaccounted;
      const upcoming = Array.isArray(row.recompetes_upcoming) ? row.recompetes_upcoming.length : 0;
      console.log(`  · FY${win.fy}: total=$${(row.total_obligations || 0).toLocaleString()} · sb_pct=${row.sb_pct?.toFixed(1)}% · yoy=${row.yoy_delta_pct?.toFixed(1)}% · sb_recipients=${sbCount} · awards=${sample?.sampled ?? 0}${sample?.truncated ? ' (capped)' : ''} · pricing=${ctCount}${ctCount === 0 ? ' ⚠ EMPTY' : ''} · setaside_gap=${gap == null ? 'n/a' : '$' + Math.round(gap).toLocaleString()} · recompetes_12_18mo=${upcoming}`);
      priorTotal = row.total_obligations;
    }
  }

  console.log(
    `[defense-spending] done ${new Date().toISOString()} · duration=${Date.now() - startedAt.getTime()}ms` +
    ` · skipped=${skipped}`
  );
  // A run that could not measure anything is a FAILED run, not a quiet one. Exit
  // non-zero so Railway shows it red rather than reporting SUCCESS over a night
  // where nothing was written.
  if (skipped > 0) {
    console.error(`[defense-spending] ${skipped} row(s) unmeasured — see the SKIPPED lines above.`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error("[defense-spending] fatal", e); process.exit(1); });
