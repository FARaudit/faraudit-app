const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  const q = `${url}/rest/v1/audits?id=eq.294a7c11-06f5-4eb2-8258-5f48bd1ea01e&limit=1`;
  const r = await fetch(q, { headers: { apikey: key!, Authorization: `Bearer ${key}` } });
  const [row] = await r.json();
  console.log("TOP-LEVEL KEYS:", Object.keys(row).join(", "));
  const pick = (o: any, ks: string[]) => ks.forEach(k => { if (o && o[k] !== undefined) console.log(`  ${k} =`, typeof o[k] === "object" ? JSON.stringify(o[k]).slice(0, 300) : o[k]); });
  console.log("--- row scalars ---");
  pick(row, ["status", "engine", "audit_source", "cost_usd", "total_cost_usd", "duration_ms", "solicitation_number", "notice_id", "verdict", "decision"]);
  const res = row.result || row.audit_result || row.report || row.output || {};
  console.log("--- result keys ---", Object.keys(res).join(", "));
  pick(res, ["verdict", "decision", "overall", "completeness", "docs_complete", "show_stoppers", "verdict_reason", "headline", "summary"]);
})();
