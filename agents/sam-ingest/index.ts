// SAM Ingest — Railway daily cron worker.
// Last hash-bust: 2026-05-02T16:05:00Z — force fresh Railway image build.
//
// For each (NAICS × set-aside) combo, paginates SAM.gov for solicitations
// posted in the last DAILY_WINDOW_DAYS days, dedupes by notice_id, and inserts
// new rows into pending_audits with source='sam_live'. Audit AI consumes from
// there on its own cron.
//
// Env: SAM_API_KEY · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY ·
//      NAICS_CODES · SET_ASIDES · DAILY_WINDOW_DAYS · PAGE_LIMIT · DRY_RUN

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.SAM_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[sam-ingest] missing SAM_API_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

// Dynamic imports AFTER env is loaded — both modules capture env on import.
// @ts-expect-error tsx
const samNs: any = await import("./sam-client.ts");
const sam = samNs.default ?? samNs;
const { searchAll, dateRange } = sam;

// @ts-expect-error tsx
const queueNs: any = await import("./queue.ts");
const queue = queueNs.default ?? queueNs;
const { insertNew } = queue;

// @ts-expect-error tsx
const helpersNs: any = await import("./helpers.ts");
const helpers = helpersNs.default ?? helpersNs;
const { resolveAgency, classifyDocType, classifyRisk, sanitizeSolicitationNumber } = helpers;

const NAICS_CODES = (process.env.NAICS_CODES || "336413").split(",").map((s) => s.trim()).filter(Boolean);
const SET_ASIDES = (process.env.SET_ASIDES || "SBA,8A,8AS,WOSB,EDWOSB,SDVOSBC,SDVOSBS,HZC,HZS")
  .split(",").map((s) => s.trim()).filter(Boolean);
// BACKFILL_DAYS overrides DAILY_WINDOW_DAYS — used for one-shot historical
// pulls. Set on Railway, deploy, run, then unset so cron returns to daily mode.
const DAILY_WINDOW_DAYS = Number(process.env.BACKFILL_DAYS) || Number(process.env.DAILY_WINDOW_DAYS) || 1;
const PAGE_LIMIT = Math.min(Number(process.env.PAGE_LIMIT) || 100, 1000);
const DRY_RUN = process.env.DRY_RUN === "true";

// TODO(v1): Add archived_at column to pending_audits and have cron mark
// notices as archived when responseDeadLine has passed. Currently the feed
// shows expired notices as live opportunities, which is a demo-killer for
// prospects. Risk classifier already excludes expired deadlines from P0/P1
// (helpers.ts daysOut >= 0 gate) but the rows themselves remain in the feed.

async function main() {
  const startedAt = new Date();
  console.log(`[sam-ingest] start ${startedAt.toISOString()} · DRY_RUN=${DRY_RUN}`);
  console.log(`  NAICS: ${NAICS_CODES.join(", ")}`);
  console.log(`  set-asides: ${SET_ASIDES.join(", ")}`);
  console.log(`  window: last ${DAILY_WINDOW_DAYS}d · page limit: ${PAGE_LIMIT}`);

  const { from, to } = dateRange(DAILY_WINDOW_DAYS);
  console.log(`  date range: ${from} → ${to}`);

  // Collect across all (naics × set-aside) combos. Dedupe by notice_id since
  // a single solicitation only carries one set-aside, but pagination quirks
  // could theoretically yield dupes within the same combo.
  const seen = new Map<string, any>();
  let pagesFetched = 0;
  let combosFetched = 0;

  for (const naics of NAICS_CODES) {
    for (const setAside of SET_ASIDES) {
      try {
        const items = await searchAll({
          naicsCode: naics,
          setAside,
          postedFrom: from,
          postedTo: to,
          pageLimit: PAGE_LIMIT
        });
        combosFetched++;
        pagesFetched += Math.ceil(items.length / PAGE_LIMIT);
        if (items.length > 0) {
          console.log(`  ✓ ${naics} / ${setAside}: ${items.length} opportunit${items.length === 1 ? "y" : "ies"}`);
        }
        for (const it of items) {
          if (!it.noticeId) continue;
          if (!seen.has(it.noticeId)) seen.set(it.noticeId, it);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  ✗ ${naics} / ${setAside}: ${message}`);
      }
    }
  }

  console.log(`\n[sam-ingest] fetched ${seen.size} unique opportunit${seen.size === 1 ? "y" : "ies"} across ${combosFetched} combo(s)`);

  if (seen.size === 0) {
    console.log("[sam-ingest] nothing to upsert · queue unchanged");
    return;
  }

  // Filter (May 4 2026 · audit-ai crash diagnosis): skip opportunities where
  // resourceLinks is empty/null. These are typically NSN-prefixed DLA tiny
  // purchase orders ("61--MOTOR,ALTERNATING C") whose full description lives
  // at a separate noticedesc URL — there's no attachable PDF for the audit
  // engine. Inserting them just creates 100% audit-ai failures (loadPdf throws
  // before any Claude call) and pollutes the pending queue. Filtering here
  // means the consumer (/home Intelligence Feed) shows fewer-but-auditable rows.
  const seenArr = Array.from(seen.values());
  const audited: any[] = [];
  let droppedNoPdf = 0;
  for (const o of seenArr) {
    const pdfUrl = o.resourceLinks?.[0] || null;
    if (!pdfUrl) {
      droppedNoPdf++;
      continue;
    }
    audited.push({
      notice_id: o.noticeId,
      solicitation_number: sanitizeSolicitationNumber(o.solicitationNumber),
      title: o.title || null,
      agency: resolveAgency(o),
      naics_code: o.naicsCode || null,
      set_aside: o.typeOfSetAsideDescription || o.typeOfSetAside || null,
      document_type: classifyDocType(o.type),
      response_deadline: o.responseDeadLine || null,
      risk_level: classifyRisk(o, new Date()),
      pdf_url: pdfUrl,
      source: "sam_live" as const,
      notes: o.uiLink ? `posted ${o.postedDate} · ${o.uiLink}` : `posted ${o.postedDate}`
    });
  }
  console.log(`[sam-ingest] filter · ${droppedNoPdf} opportunit${droppedNoPdf === 1 ? "y" : "ies"} dropped (no PDF · NSN line items / metadata-only) · ${audited.length} auditable`);
  const rows = audited;

  if (DRY_RUN) {
    console.log("[DRY_RUN] sample of first 5 rows that would be inserted:");
    rows.slice(0, 5).forEach((r) => console.log(`  · ${r.notice_id} · ${r.set_aside} · ${(r.title || "").slice(0, 80)}`));
    console.log("[DRY_RUN] no DB write — set DRY_RUN=false to persist");
    return;
  }

  const { inserted, skipped } = await insertNew(rows);
  console.log(`[sam-ingest] queue updated · inserted=${inserted} skipped=${skipped}`);

  const finishedAt = new Date();
  console.log(`[sam-ingest] done ${finishedAt.toISOString()} · duration=${finishedAt.getTime() - startedAt.getTime()}ms`);
}

main().catch((e) => {
  console.error("[sam-ingest] fatal", e);
  process.exit(1);
});
