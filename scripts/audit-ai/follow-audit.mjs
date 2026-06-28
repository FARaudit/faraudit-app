// Read-only live follow of an audit row by solicitation number. No writes.
//   node scripts/audit-ai/follow-audit.mjs 1240LP26Q0067
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => l.includes("="))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const sol = process.argv[2] || "1240LP26Q0067";
const q = `${URL}/rest/v1/audits?solicitation_number=ilike.*${sol}*&select=*&order=created_at.desc&limit=5`;
const r = await fetch(q, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!r.ok) { console.log(`HTTP ${r.status}: ${await r.text()}`); process.exit(1); }
const rows = await r.json();
if (!rows.length) { console.log(`no audits row yet for ${sol} (CEO run may still be creating it)`); process.exit(0); }
const pick = (x, ks) => ks.filter(k => k in x).map(k => `${k}=${JSON.stringify(x[k])}`).join(" | ");
for (const x of rows) {
  console.log(pick(x, ["created_at","id","status","verdict","bid_score","score","engine_version","engine","files_ingested","files_total"]));
}
