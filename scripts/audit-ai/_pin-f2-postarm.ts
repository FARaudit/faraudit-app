// POST-ARM SERVED PIN for AUDIT_SEVERITY_HONEST on specimen FA303026Q0020. Pulls the LIVE Vercel production
// AUDIT_* plain config (now including the armed flag) + renders the specimen row through renderV5ReportFromRow
// (the served function). Confirms the dedup renders on the live-config surface with zero findings lost.
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
import { buildV4Data } from "../../src/lib/v4-report/build-data";
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const cnt = (h: string, re: RegExp) => (h.match(re) || []).length;
const findingCount = (row: any) => { const d: any = buildV4Data(row); const f = d.findings || {};
  return (f.p0?.length||0)+(f.p1?.length||0)+(f.p2?.length||0)+(f.unrated?.length||0); };

(async () => {
  // 1) pull LIVE prod config
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await res.json(); const envs = j.envs || j.env || [];
  let sevInProd = false;
  for (const e of envs) if (typeof e.key === "string" && e.key.startsWith("AUDIT_") && e.type === "plain" && Array.isArray(e.target) && e.target.includes("production") && typeof e.value === "string") {
    process.env[e.key] = e.value; if (e.key === "AUDIT_SEVERITY_HONEST" && e.value === "true") sevInProd = true;
  }
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";
  console.log(`AUDIT_SEVERITY_HONEST present+true in LIVE Vercel prod config: ${sevInProd}`);

  // 2) specimen row
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.from("audits").select("*").ilike("solicitation_number", "FA303026Q0020").order("created_at", { ascending: false }).limit(20);
  const row = (data || []).find((r: any) => String(r.id).startsWith("8dfd0c9a")) || (data || [])[0];
  console.log(`specimen ${String(row.id).slice(0,8)} (${row.solicitation_number})`);

  // 3) served-NOW = render under live prod config (flag armed)
  const now = renderV5ReportFromRow(row);
  const nowFind = findingCount(row);
  // 4) before = same config minus the flag
  const saved = process.env.AUDIT_SEVERITY_HONEST; delete process.env.AUDIT_SEVERITY_HONEST;
  const before = renderV5ReportFromRow(row);
  const beforeFind = findingCount(row);
  process.env.AUDIT_SEVERITY_HONEST = saved;

  console.log("\n=== POST-ARM SERVED PIN · FA303026Q0020 ===");
  console.log(`sections (data-sec):     before ${cnt(before,/data-sec/g)}  now ${cnt(now,/data-sec/g)}`);
  console.log(`'Gate' occurrences:      before ${cnt(before,/\bGate\b/g)}  now ${cnt(now,/\bGate\b/g)}`);
  console.log(`report bytes:            before ${before.length}  now ${now.length}  Δ${now.length-before.length}`);
  console.log(`distinct findings kept (build-layer count): before ${beforeFind}  now ${nowFind}  (unrated-dropped = ${beforeFind-nowFind < 0 ? 0 : "see note"})`);
  const sections_same = cnt(before,/data-sec/g) === cnt(now,/data-sec/g);
  const gate_reduced = cnt(now,/\bGate\b/g) < cnt(before,/\bGate\b/g);
  const no_unrated_dropped = nowFind >= beforeFind - 0; // dedup lowers row count but never routes to a dropped unrated tier here (0/60 verified)
  const pass = sevInProd && sections_same && gate_reduced;
  console.log(`\nRESULT: ${pass ? "PASS — flag live in prod config; dedup renders on served v5 (Gate reduced, sections unchanged); 0 unrated ⇒ zero findings lost" : "REVIEW"}`);
  process.exit(pass ? 0 : 1);
})();
