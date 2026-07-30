// Live-follow the seq-4 fire (36C24626Q0724). Polls the audits table for the newest row for this solicitation and
// prints status/verdict. One-shot (prints current state + exits) — drive it from a Monitor loop.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_follow-36C24626Q0724.ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  if (!url || !key) { console.log("ENV_MISSING"); process.exit(2); }
  const q = `${url}/rest/v1/audits?or=(solicitation_number.eq.36C24626Q0724,notice_id.eq.d6d5f76b635a46ad937a2b0895b9c95f)&order=created_at.desc&limit=1`;
  try {
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) { console.log(`HTTP_${res.status}`); process.exit(0); }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) { console.log("NO_ROW_YET"); process.exit(0); }
    const r = rows[0];
    const v = r.verdict ?? r.result?.verdict ?? r.decision ?? "?";
    console.log(`id=${r.id} status=${r.status} verdict=${v} engine=${r.engine ?? "?"} created=${r.created_at} completed=${r.completed_at ?? "-"}`);
  } catch (e) { console.log(`ERR ${e instanceof Error ? e.message : e}`); }
  process.exit(0);
})();
