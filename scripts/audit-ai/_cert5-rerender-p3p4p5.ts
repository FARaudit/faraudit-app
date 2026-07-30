// CERT-5 FREE RE-RENDER BATCH — $0. Re-render P3/P4/P5 persisted rows through renderV5ReportFromRow under the LIVE
// production flag config (post F-2 dedup + deadline reconcile arms). Report-completeness + arm-regression check.
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD", TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const cnt = (h: string, re: RegExp) => (h.match(re) || []).length;
const SPECIMENS = [
  { pre: "653570ea", pathway: "P3 CAUTION", expectPole: "BID_WITH_CAUTION" },
  { pre: "e63bd1e7", pathway: "P4 INCOMPLETE", expectPole: "INCOMPLETE" },
  { pre: "a452201b", pathway: "P5 LARGE (truncated)", expectPole: "INCOMPLETE" },
];
(async () => {
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const envs = (await res.json()).envs || [];
  const live: Record<string, boolean> = {};
  for (const e of envs) if (typeof e.key === "string" && e.key.startsWith("AUDIT_") && e.type === "plain" && (e.target||[]).includes("production") && typeof e.value === "string") {
    process.env[e.key] = e.value; if (e.value === "true") live[e.key] = true;
  }
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";
  console.log("LIVE arms confirmed: SEVERITY_HONEST=%s · MASTHEAD_DEADLINE_RECONCILE=%s · NHR_NARRATIVE_TRUE_CAUSE=%s\n",
    !!live.AUDIT_SEVERITY_HONEST, !!live.AUDIT_MASTHEAD_DEADLINE_RECONCILE, !!live.AUDIT_NHR_NARRATIVE_TRUE_CAUSE);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const rows: any[] = [];
  // select("*") — MUST include raw_pdf_text (the deadline reconcile parses the SF-30 from it); the served route uses select("*").
  for (let f = 0; ; f += 200) { const { data } = await sb.from("audits").select("*").eq("status","complete").range(f, f+199); if (!data||!data.length) break; rows.push(...data); if (data.length<200) break; }

  for (const sp of SPECIMENS) {
    const row = rows.find(r => String(r.id).startsWith(sp.pre));
    if (!row) { console.log(`${sp.pathway} ${sp.pre}: ROW NOT FOUND`); continue; }
    let html = ""; let threw = "";
    try { html = renderV5ReportFromRow(row); } catch (e: any) { threw = e?.message || String(e); }
    const t = strip(html);
    const v3v = row.compliance_json?.v3?.verdict;
    const sections = cnt(html, /data-sec/g);
    // verdict band words vary by pole; check the pole label / band renders
    const bandWords: Record<string,RegExp> = { BID_WITH_CAUTION: /Bid with caution|Caution|Proceed/i, INCOMPLETE: /Incomplete|missing document|complete the read/i };
    const poleRendered = bandWords[sp.expectPole] ? bandWords[sp.expectPole].test(t) : false;
    const findingRows = cnt(html, /class="f5-find|class="fr |find-row|cmd-drv\b/g);
    const failLoud = cnt(t, /the cause was not recorded in this report/gi); // should be 0 (non-NHR)
    const orphan18 = cnt(t, /18 Jul 2026/gi);
    const has31 = cnt(t, /31 Jul 2026/gi);
    const covIncomplete = /Incomplete|not fully|could not be/i.test(t);
    console.log(`── ${sp.pathway} · ${sp.pre} (${row.solicitation_number}) ──`);
    console.log(`   render: ${threw ? "THREW: "+threw : html.length+" bytes"}`);
    console.log(`   verdict(row.v3)=${v3v} (expect ${sp.expectPole}) · pole-band rendered=${poleRendered}`);
    console.log(`   sections(data-sec)=${sections} · finding/driver rows=${findingRows} · coverage-incomplete-copy=${covIncomplete}`);
    console.log(`   fail-loud "cause not recorded"=${failLoud} (expect 0) · orphan 18Jul=${orphan18} · 31Jul present=${has31}`);
    const complete = !threw && html.length > 50000 && sections >= 5 && v3v === sp.expectPole && poleRendered && failLoud === 0;
    console.log(`   → ${complete ? "RENDER-COMPLETE" : "REVIEW"}\n`);
  }
})();
