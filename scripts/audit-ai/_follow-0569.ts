// Live-follow the seq-5 fire (36C24126Q0569 · notice c4f08430148f49388b38e47604054703). One-shot; drive from a loop.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_follow-0569.ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  if (!url || !key) { console.log("ENV_MISSING"); process.exit(2); }
  const q = `${url}/rest/v1/audits?or=(solicitation_number.eq.36C24126Q0569,notice_id.eq.c4f08430148f49388b38e47604054703)&order=created_at.desc&limit=1`;
  try {
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) { console.log(`HTTP_${res.status}`); process.exit(0); }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) { console.log("NO_ROW_YET"); process.exit(0); }
    const r = rows[0];
    const v = r.verdict ?? r.result?.verdict ?? r.decision ?? "?";
    const src = r.audit_source ?? r.source ?? "?";
    console.log(`id=${r.id} status=${r.status} verdict=${v} source=${src} engine=${r.engine ?? "?"} cost=${r.cost_usd ?? r.total_cost_usd ?? "?"} created=${r.created_at} completed=${r.completed_at ?? "-"}`);
  } catch (e) { console.log(`ERR ${e instanceof Error ? e.message : e}`); }
  process.exit(0);
})();
