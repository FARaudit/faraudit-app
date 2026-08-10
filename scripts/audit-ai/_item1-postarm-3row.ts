// POST-ARM 3-row deadline pin — pulls the LIVE Vercel production config (incl. AUDIT_MASTHEAD_DEADLINE_RECONCILE) and
// renders each superseded-orphan row through the served function. Confirms 31 Jul + provenance + no orphan 18 Jul.
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";
import { classifyEnv, equals, describe, applyReadableProductionEnv, type RawVercelEnv } from "./vercel-env-state";
const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD", TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const IDS = ["496a9a21", "e63bd1e7", "24eeea9b"];
(async () => {
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const envs = ((await res.json()).envs || []) as RawVercelEnv[];
  const { unreadable } = applyReadableProductionEnv(envs);
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";
  // `flagLive` is a term in the RESULT below. A plain-only scan set it false for an ENCRYPTED var, so an unreadable
  // flag printed FAIL — a verdict about a value nobody read.
  const recon = classifyEnv(envs, "AUDIT_MASTHEAD_DEADLINE_RECONCILE");
  const flagLive = equals(recon, "true");
  console.log(`AUDIT_MASTHEAD_DEADLINE_RECONCILE in prod config → ${describe(recon)} · === "true": ${flagLive === null ? "UNKNOWABLE" : flagLive}`);
  if (unreadable.length) console.log(`⚠ not readable here, therefore OFF in these renders though possibly ON in production: ${unreadable.join(", ")}`);
  if (flagLive === null) { console.log(`\nRESULT: UNVERIFIABLE — the flag this pin is about cannot be read. Not claiming PASS, not claiming FAIL.`); process.exit(2); }
  console.log("");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const rows: any[] = [];
  for (let f = 0; ; f += 200) { const { data } = await sb.from("audits").select("id,solicitation_number,raw_pdf_text,response_deadline,compliance_json").eq("status","complete").range(f, f+199); if (!data||!data.length) break; rows.push(...data); if (data.length<200) break; }
  let allPass = true;
  for (const pre of IDS) {
    const row = rows.find(r => String(r.id).startsWith(pre));
    if (!row) { console.log(`${pre}: NOT FOUND`); allPass = false; continue; }
    const t = strip(renderV5ReportFromRow(row));
    const has31 = /31 Jul 2026/.test(t), noOrphan = !/18 Jul/.test(t), hasProv = /executed amendment \(SF-30\)/.test(t);
    const ok = has31 && noOrphan && hasProv;
    allPass = allPass && ok;
    const i = t.search(/Offers due/); console.log(`${pre} (${row.solicitation_number}): 31Jul=${has31} noOrphan18Jul=${noOrphan} provenance=${hasProv} → ${ok ? "PASS" : "FAIL"}`);
    if (i >= 0) console.log(`   "${t.slice(i, i + 110).trim()}"`);
  }
  console.log(`\nRESULT: ${flagLive && allPass ? "PASS — flag live in prod config; all 3 superseded-orphan rows render 31 Jul + provenance, zero orphan 18 Jul" : "FAIL"}`);
  process.exit(flagLive && allPass ? 0 : 1);
})();
