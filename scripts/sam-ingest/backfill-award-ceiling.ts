// FA-89g · One-shot backfill — fills pending_audits.award_ceiling by
// re-fetching each row from SAM v2 search and extracting awardCeiling ??
// baseAndAllOptionsValue.
//
// Run locally:
//   set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SAM_API_KEY)=" .env.local) && set +a
//   npx tsx scripts/sam-ingest/backfill-award-ceiling.ts
//
// Env: SAM_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//
// IMPORTANT: SAM v2 search ignores the `noticeid` query param (verified
// 2026-05-20). Lookup must go through `solnum` (solicitation_number) instead,
// because SAM also rotates notice_ids — the noticeId stored in our DB rarely
// matches SAM's current noticeId for the same solicitation. Also note SAM
// only populates award_ceiling for IDIQ / awarded contracts; most synopsis
// & combined-synopsis rows return null. Expect a low fill rate (~5-20%).
//
// Endpoint: sam.gov/api/prod/opportunities/v2/search (NOT api.sam.gov — see
// agents/sam-ingest/sam-client.ts:4-6 for the host history).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SAM_API_KEY  = process.env.SAM_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !SAM_API_KEY) {
  console.error("[backfill-award-ceiling] missing env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · SAM_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH = 10;
const SAM_BASE = "https://sam.gov/api/prod/opportunities/v2/search";

// SAM v2 hard-caps date range. 365 days works; longer doesn't. Use a year back
// from today to maximize coverage of older rows.
function dateWindow(): { from: string; to: string } {
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  const to = new Date();
  const from = new Date(to.getTime() - 364 * 86400_000);
  return { from: fmt(from), to: fmt(to) };
}

const { from: POSTED_FROM, to: POSTED_TO } = dateWindow();

interface SamRow {
  awardCeiling?: string | number | null;
  baseAndAllOptionsValue?: string | number | null;
}

async function fetchAwardCeiling(solNum: string): Promise<{ value: number | null; status: "ok" | "empty" | "error" }> {
  try {
    const url = `${SAM_BASE}?solnum=${encodeURIComponent(solNum)}&postedFrom=${POSTED_FROM}&postedTo=${POSTED_TO}&limit=1&api_key=${encodeURIComponent(SAM_API_KEY as string)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { value: null, status: "error" };
    }
    const data = await res.json() as { opportunitiesData?: SamRow[] };
    const first = data.opportunitiesData?.[0];
    if (!first) return { value: null, status: "empty" };
    const raw = first.awardCeiling ?? first.baseAndAllOptionsValue ?? null;
    if (raw == null || raw === "") return { value: null, status: "empty" };
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num)) return { value: null, status: "empty" };
    return { value: num, status: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[backfill-award-ceiling] fetch failed for ${solNum}: ${msg}`);
    return { value: null, status: "error" };
  }
}

async function main() {
  const { data, error } = await supabase
    .from("pending_audits")
    .select("notice_id, solicitation_number")
    .is("award_ceiling", null)
    .not("solicitation_number", "is", null)
    .limit(625);
  if (error) { console.error("[backfill-award-ceiling] fetch failed:", error.message); process.exit(2); }
  if (!data || data.length === 0) { console.log("[backfill-award-ceiling] no rows to fill"); return; }

  console.log(`[backfill-award-ceiling] processing ${data.length} row${data.length === 1 ? "" : "s"} in batches of ${BATCH}...`);
  console.log(`[backfill-award-ceiling] window: ${POSTED_FROM} to ${POSTED_TO}`);

  let filled = 0, empty = 0, failed = 0;
  const startedAt = Date.now();
  for (let i = 0; i < data.length; i += BATCH) {
    const slice = data.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((r) => fetchAwardCeiling(r.solicitation_number as string)));
    for (let j = 0; j < slice.length; j++) {
      const row = slice[j];
      const r = results[j];
      if (r.status === "error") { failed++; continue; }
      if (r.value == null) { empty++; continue; }
      const { error: upErr } = await supabase
        .from("pending_audits")
        .update({ award_ceiling: r.value })
        .eq("notice_id", row.notice_id);
      if (upErr) { console.warn(`[backfill-award-ceiling] write failed for ${row.notice_id}: ${upErr.message}`); failed++; continue; }
      filled++;
    }
    const done = Math.min(i + BATCH, data.length);
    const pct = Math.round((done / data.length) * 100);
    process.stdout.write(`\r  progress: ${done}/${data.length} (${pct}%) · filled=${filled} empty=${empty} failed=${failed}`);
  }
  process.stdout.write("\n");

  const durationS = (Date.now() - startedAt) / 1000;

  console.log("");
  console.log("[backfill-award-ceiling] DONE");
  console.log(`  rows filled:    ${filled}`);
  console.log(`  rows null/empty: ${empty}  (SAM had no awardCeiling / baseAndAllOptionsValue for these)`);
  console.log(`  rows failed:    ${failed}`);
  console.log(`  total seen:     ${data.length}`);
  console.log(`  duration:       ${durationS.toFixed(1)}s`);
}

main().catch((e) => { console.error("[backfill-award-ceiling] fatal", e); process.exit(1); });
