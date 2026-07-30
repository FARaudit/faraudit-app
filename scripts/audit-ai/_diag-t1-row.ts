// $0 T1 FORENSIC — read the PERSISTED row a7727dfc + its SERVED render (prod config). No re-fire, no code change.
// Resolves: (1) fetch-vs-ground, (2) narrative-vs-coverage, (3) April-30 provenance — all from stored data.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { renderV5ReportFromRow } from "../../src/lib/v5-report/report";

const TOKEN = process.env.VERCEL_TOKEN!;
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
const ID = "a7727dfc-b3e4-4501-a187-69caa8f735a2";
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

(async () => {
  // prod config (served surface)
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await res.json();
  for (const e of (j.envs || j.env || [])) {
    if (typeof e.key === "string" && e.key.startsWith("AUDIT_") && e.type === "plain" && Array.isArray(e.target) && e.target.includes("production") && typeof e.value === "string") process.env[e.key] = e.value;
  }
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await admin.from("audits").select("*").eq("id", ID).single();
  const cj = row.compliance_json || {};
  const v3 = cj.v3 || {};

  console.log("========== CONTRADICTION 1 · FETCH vs GROUND (stored row) ==========");
  console.log("doc_count=", cj.doc_count, "| documents_complete=", cj.documents_complete, "| source_truncated=", cj.source_truncated, "| honest_fail=", cj.honest_fail);
  console.log("read_modes (what the engine says it READ):");
  for (const r of (cj.read_modes || [])) console.log(`   [${r.mode}] ${r.name}`);
  console.log("\nv3.verdict=", v3.verdict);
  console.log("v3.reason=", JSON.stringify(v3.reason));
  console.log("v3.coverage=", JSON.stringify(v3.coverage));
  console.log("v3.eligible=", JSON.stringify(v3.eligible));

  console.log("\n========== CONTRADICTION 2 · NARRATIVE vs COVERAGE (served render) ==========");
  const html = renderV5ReportFromRow(row);
  const txt = strip(html);
  const grab = (re: RegExp) => (txt.match(re) || []).map((m) => m.trim());
  console.log("render 'unfetched' hits:", grab(/[^.]*unfetched[^.]*\./gi));
  console.log("render 'could be read|were read' hits:", grab(/[^.]*(documents were read|could be read|all \d+ documents)[^.]*\./gi).slice(0,3));
  console.log("render 'ground' hits:", grab(/[^.]*ground(ed|ing)?[^.]*\./gi).slice(0,3));
  // headline region
  const head = txt.slice(0, 600);
  console.log("\nHEADLINE region (first 600c of stripped render):\n  ", head);

  console.log("\n========== CONTRADICTION 3 · APRIL-30 (findings + source provenance) ==========");
  console.log("render 'April 30' hits:", grab(/[^.]*April 30[^.]*\.?/gi).slice(0,4));
  // findings column
  const f = row.findings;
  const fArr = Array.isArray(f) ? f : (f && typeof f === "object" ? Object.values(f).flat() : []);
  console.log("findings count:", Array.isArray(fArr) ? fArr.length : typeof f);
  for (const x of (Array.isArray(fArr) ? fArr : [])) {
    const blob = JSON.stringify(x);
    if (/April 30|4:00 PM|due date/i.test(blob)) console.log("  ★ DATE-finding:", blob.slice(0, 400));
  }
  // raw source: where does April 30 appear + provenance
  const raw = row.raw_pdf_text || "";
  console.log("\nraw_pdf_text length:", raw.length);
  const idxs: number[] = []; let k = -1; const low = raw.toLowerCase();
  while ((k = low.indexOf("april 30", k + 1)) !== -1) idxs.push(k);
  console.log(`'April 30' occurrences in raw source: ${idxs.length}`);
  for (const i of idxs.slice(0, 3)) console.log("   …", raw.slice(Math.max(0, i - 90), i + 60).replace(/\s+/g, " "));
  // July 31 for contrast
  const jul = low.indexOf("july 31"); const jul2 = low.indexOf("31 jul");
  console.log(`'July 31'@${jul} '31 Jul'@${jul2}`);
  // amendment context
  console.log("amendment_disclosure:", JSON.stringify(cj.amendment_disclosure).slice(0,200));
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
