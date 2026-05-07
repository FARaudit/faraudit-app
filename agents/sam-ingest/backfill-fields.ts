// One-shot: backfill agency + solicitation_number on existing pending_audits
// rows that pre-date migration 019 + the resolveAgency precedence chain.
//
// Strategy: re-run the standard SAM search across all configured
// (NAICS × set-aside) combos for BACKFILL_DAYS. For each opportunity returned,
// look up the corresponding pending_audits row by notice_id and UPDATE only
// the fields that are currently NULL. Idempotent — safe to re-run.
//
// Usage:   BACKFILL_DAYS=60 npx tsx agents/sam-ingest/backfill-fields.ts
//          DRY_RUN=true to preview match count + sample before writing.
//
// Pre-req: migration 019 must be applied (solicitation_number column exists).
// Confirm SAM_API_KEY has daily headroom — this re-pulls the same range as
// the daily cron, ~9 combos × pagination.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.SAM_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[backfill-fields] missing SAM_API_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// @ts-expect-error tsx
const samNs: any = await import("./sam-client.ts");
const sam = samNs.default ?? samNs;
const { searchAll, dateRange } = sam;

// @ts-expect-error tsx
const queueNs: any = await import("./queue.ts");
const { supabase } = queueNs.default ?? queueNs;

// @ts-expect-error tsx
const helpersNs: any = await import("./helpers.ts");
const helpers = helpersNs.default ?? helpersNs;
const { resolveAgency } = helpers;

const NAICS_CODES = (process.env.NAICS_CODES || "336413").split(",").map((s) => s.trim()).filter(Boolean);
const SET_ASIDES = (process.env.SET_ASIDES || "SBA,8A,8AS,WOSB,EDWOSB,SDVOSBC,SDVOSBS,HZC,HZS")
  .split(",").map((s) => s.trim()).filter(Boolean);
const BACKFILL_DAYS = Number(process.env.BACKFILL_DAYS) || 60;
const PAGE_LIMIT = Math.min(Number(process.env.PAGE_LIMIT) || 100, 1000);
const DRY_RUN = process.env.DRY_RUN === "true";

interface PendingRow {
  id: string;
  notice_id: string;
  agency: string | null;
  solicitation_number: string | null;
}

async function main() {
  const startedAt = new Date();
  console.log(`[backfill-fields] start ${startedAt.toISOString()} · DRY_RUN=${DRY_RUN}`);
  console.log(`  NAICS: ${NAICS_CODES.join(", ")}`);
  console.log(`  set-asides: ${SET_ASIDES.join(", ")}`);
  console.log(`  window: last ${BACKFILL_DAYS}d · page limit: ${PAGE_LIMIT}`);

  // Find rows missing either field. agency is null (not "") thanks to the
  // `o.department || null` pattern the old ingest used.
  const { data: needyRaw, error: fetchErr } = await supabase
    .from("pending_audits")
    .select("id, notice_id, agency, solicitation_number")
    .eq("source", "sam_live")
    .or("agency.is.null,solicitation_number.is.null");
  if (fetchErr) throw new Error(`fetch pending_audits: ${fetchErr.message}`);
  const needy = (needyRaw || []) as PendingRow[];
  console.log(`[backfill-fields] ${needy.length} rows missing agency or solicitation_number`);
  if (needy.length === 0) {
    console.log("[backfill-fields] nothing to do");
    return;
  }

  // Pull SAM across all combos for the lookback window.
  const { from, to } = dateRange(BACKFILL_DAYS);
  console.log(`[backfill-fields] SAM range ${from} → ${to}`);
  const samMap = new Map<string, any>();
  for (const naics of NAICS_CODES) {
    for (const setAside of SET_ASIDES) {
      try {
        const items = await searchAll({ naicsCode: naics, setAside, postedFrom: from, postedTo: to, pageLimit: PAGE_LIMIT });
        for (const it of items) if (it.noticeId) samMap.set(it.noticeId, it);
        if (items.length > 0) console.log(`  ✓ ${naics} / ${setAside}: ${items.length}`);
      } catch (err) {
        console.warn(`  ✗ ${naics} / ${setAside}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  console.log(`[backfill-fields] fetched ${samMap.size} SAM opportunities into match map`);

  // Build update plan — only fill NULLs, never overwrite existing values.
  let matched = 0;
  let unmatched = 0;
  const updates: Array<{ id: string; agency: string | null; solicitation_number: string | null }> = [];
  for (const row of needy) {
    const samRow = samMap.get(row.notice_id);
    if (!samRow) { unmatched++; continue; }
    matched++;
    const newAgency = row.agency ?? resolveAgency(samRow);
    const newSolNum = row.solicitation_number ?? (samRow.solicitationNumber || null);
    if (newAgency === row.agency && newSolNum === row.solicitation_number) continue;
    updates.push({ id: row.id, agency: newAgency, solicitation_number: newSolNum });
  }
  console.log(`[backfill-fields] matched ${matched} · unmatched ${unmatched} (likely outside ${BACKFILL_DAYS}d window)`);
  console.log(`[backfill-fields] ${updates.length} rows have new field data to write`);

  if (DRY_RUN) {
    console.log("[DRY_RUN] sample of first 5 updates:");
    updates.slice(0, 5).forEach((u) => console.log(`  · ${u.id} → agency=${u.agency} sol#=${u.solicitation_number}`));
    console.log("[DRY_RUN] no DB write — set DRY_RUN=false to persist");
    return;
  }

  let written = 0;
  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("pending_audits")
      .update({ agency: u.agency, solicitation_number: u.solicitation_number })
      .eq("id", u.id);
    if (upErr) console.warn(`  ✗ update ${u.id}: ${upErr.message}`);
    else written++;
  }
  const finishedAt = new Date();
  console.log(`[backfill-fields] wrote ${written}/${updates.length} · duration=${finishedAt.getTime() - startedAt.getTime()}ms`);
}

main().catch((e) => { console.error("[backfill-fields] fatal", e); process.exit(1); });
