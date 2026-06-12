#!/usr/bin/env node
// FA-153 backfill — set audits.original_posted_date (+ compliance_json.naics_appeal)
// from SAM version history for existing audits.
//
// Usage (from ~/faraudit-app, after sourcing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// / SAM_API_KEY):
//   node scripts/audit-ai/backfill-fa153-original-posted-date.mjs --dry-run
//   node scripts/audit-ai/backfill-fa153-original-posted-date.mjs
//   node scripts/audit-ai/backfill-fa153-original-posted-date.mjs --audit <uuid>
//
// Column writes require migration 20260612150000_fa153_original_posted_date.sql.
// If the column is missing (PGRST204) the script still merges the JSON copy into
// compliance_json.naics_appeal and reports the column write as BLOCKED — it never
// fabricates a date and never touches posted_date.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SAM_API_KEY = process.env.SAM_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_AUDIT = process.argv.includes("--audit") ? process.argv[process.argv.indexOf("--audit") + 1] : null;
const OPPS_V2 = "https://sam.gov/api/prod/opps/v2/opportunities";
const HAL = { accept: "application/hal+json" };
const SLEEP_MS = 250;

if (!SUPABASE_URL || !SERVICE_KEY || !SAM_API_KEY) {
  console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SAM_API_KEY");
  process.exit(2);
}
const sb = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const datePart = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

async function fetchHal(url) {
  try {
    const r = await fetch(url, { headers: HAL, signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function anchorFor(noticeId) {
  const j = await fetchHal(`${OPPS_V2}/${noticeId}/history?api_key=${SAM_API_KEY}`);
  const history = Array.isArray(j?.history) ? j.history : null;
  if (!history || history.length === 0) return null;
  const ordered = history
    .filter((h) => h && typeof h.opportunityId === "string" && h.deleted !== "1" && h.cancelNotice !== "1")
    .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
  if (ordered.length === 0) return null;
  const versions = ordered.map((h) => ({ id: h.opportunityId, postedDate: datePart(h.postedDate), naics: null }));
  if (!versions[0].postedDate) return null;
  if (versions.length > 1) {
    for (const v of versions) {
      const d = await fetchHal(`${OPPS_V2}/${v.id}?api_key=${SAM_API_KEY}`);
      const naicsArr = (d?.data2 ?? d?.data)?.naics;
      const primary = Array.isArray(naicsArr) ? (naicsArr.find((n) => n?.type === "primary") ?? naicsArr[0]) : null;
      v.naics = typeof primary?.code?.[0] === "string" ? primary.code[0] : null;
      await sleep(SLEEP_MS);
    }
  }
  let anchorDate = versions[0].postedDate, restarted = false;
  for (let i = 1; i < versions.length; i++) {
    const prev = versions[i - 1].naics, cur = versions[i].naics;
    if (prev && cur && prev !== cur && versions[i].postedDate) { anchorDate = versions[i].postedDate; restarted = true; }
  }
  return { original: versions[0].postedDate, anchor: anchorDate, restarted, versions: versions.length };
}

const rows = [];
{
  const filter = ONLY_AUDIT ? `&id=eq.${ONLY_AUDIT}` : "";
  let from = 0;
  for (;;) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/audits?select=id,notice_id,posted_date,compliance_json&notice_id=not.is.null&order=created_at.asc${filter}`,
      { headers: { ...sb, Range: `${from}-${from + 199}`, Prefer: "count=exact" } }
    );
    const page = await r.json();
    if (!Array.isArray(page)) { console.error("select failed:", JSON.stringify(page).slice(0, 200)); process.exit(2); }
    rows.push(...page);
    if (page.length < 200) break;
    from += 200;
  }
}
const eligible = rows.filter((a) => a.notice_id && !/^pdf-/i.test(a.notice_id));
console.log(`audits scanned: ${rows.length} · eligible (real notice_id): ${eligible.length} · dry_run=${DRY_RUN}`);

const cache = new Map();
let set = 0, unresolvable = 0, columnBlocked = false, jsonMerged = 0;
for (const a of eligible) {
  if (!cache.has(a.notice_id)) { cache.set(a.notice_id, await anchorFor(a.notice_id)); await sleep(SLEEP_MS); }
  const got = cache.get(a.notice_id);
  if (!got) { unresolvable++; console.log(`  ${a.id} · ${a.notice_id} → history unavailable (stays NULL)`); continue; }
  const tag = got.original !== datePart(a.posted_date) ? "  ** differs from posted_date **" : "";
  console.log(`  ${a.id} · ${a.notice_id} → original=${got.original} anchor=${got.anchor} restarted=${got.restarted} (posted_date=${datePart(a.posted_date)})${tag}`);
  if (DRY_RUN) { set++; continue; }

  // Column write (needs migration) — detect PGRST204 once, then skip.
  if (!columnBlocked) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/audits?id=eq.${a.id}`, {
      method: "PATCH",
      headers: { ...sb, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ original_posted_date: got.original })
    });
    if (r.ok) set++;
    else {
      const body = await r.text();
      if (/PGRST204|original_posted_date/.test(body)) { columnBlocked = true; console.log("  !! column missing — migration 20260612150000 not applied; JSON-only from here"); }
      else console.log(`  !! column write failed for ${a.id}: ${body.slice(0, 120)}`);
    }
  }
  // JSON copy — works pre-migration. Read-modify-write merge.
  const cj = a.compliance_json && typeof a.compliance_json === "object" ? a.compliance_json : {};
  const merged = { ...cj, naics_appeal: {
    original_posted_date: got.original, anchor_date: got.anchor,
    naics_changed_by_amendment: got.restarted, version_count: got.versions,
    fetched_at: new Date().toISOString(), backfilled: true
  } };
  const r2 = await fetch(`${SUPABASE_URL}/rest/v1/audits?id=eq.${a.id}`, {
    method: "PATCH",
    headers: { ...sb, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ compliance_json: merged })
  });
  if (r2.ok) jsonMerged++;
  else console.log(`  !! json merge failed for ${a.id}: ${(await r2.text()).slice(0, 120)}`);
}
console.log(`\ndone · resolved=${set}${DRY_RUN ? " (dry-run)" : ""} · json_merged=${jsonMerged} · history_unavailable=${unresolvable} · column_blocked=${columnBlocked}`);
