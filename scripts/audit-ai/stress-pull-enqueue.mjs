// Stress test: pull DIVERSE/HARD live solicitations from SAM + enqueue as
// SAM-FETCH audits (sol-# path, not upload). The resident audit-worker claims
// source='user' pending rows and re-fetches docs from SAM by notice_id.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
const KEY = process.env.SAM_API_KEY;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const USER = "135cb5c6-f391-4c8b-a5f2-0088004ac797"; // demo@faraudit.com
const fmt = d => `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
const to = new Date(), from = new Date(to.getTime()-21*86400000);

// Pull broadly across set-asides (NAICS filter is broken/FA-133, so diversify by set-aside + inspect)
async function pull(setAside, n) {
  const p = new URLSearchParams({ api_key:KEY, postedFrom:fmt(from), postedTo:fmt(to), limit:String(n), offset:"0", ptype:"o,k,r" });
  if (setAside) p.set("typeOfSetAside", setAside);
  const r = await fetch(`https://sam.gov/api/prod/opportunities/v2/search?${p}`, { headers:{Accept:"application/json"} });
  if (!r.ok) return [];
  return ((await r.json()).opportunitiesData||[]);
}
const pools = {
  "8A": await pull("8A", 25),
  "SDVOSBC": await pull("SDVOSBC", 25),
  "FullOpen": await pull("", 25),
};
const docCount = o => Array.isArray(o.resourceLinks) ? o.resourceLinks.length : 0;
const all = [...pools["8A"], ...pools["SDVOSBC"], ...pools["FullOpen"]].filter(o => /^[a-f0-9]{32}$/i.test(o.noticeId||"") && docCount(o) >= 2);
// pick HARD/diverse: amendment-heavy, big doc sets, construction, civilian, varied set-aside
const seen = new Set();
const pick = (pred) => all.find(o => !seen.has(o.noticeId) && pred(o) && seen.add(o.noticeId));
const civ = o => !/DEFENSE/i.test(o.fullParentPathName||o.department||"");
const constr = o => /^23[67]/.test(o.naicsCode||"") || /construct|repair|renovat|build/i.test(o.title||"");
const amd = o => /amend|sf.?30|modif/i.test(JSON.stringify(o.resourceLinks||[])+o.title);
const candidates = [
  pick(o => docCount(o) >= 8),            // large doc set (cap stress)
  pick(constr),                            // construction IFB (SF-1442 / diff structure)
  pick(civ),                               // civilian agency
  pick(o => (o.typeOfSetAsideDescription||"").includes("SDVOSB")), // SDVOSB
  pick(o => docCount(o) >= 4 && docCount(o) <= 7), // multi-attachment
  pick(o => true),                         // any remaining
].filter(Boolean);

let est = 0;
console.log("=== HARD STRESS-TEST SET (live SAM, sol-# path) ===");
for (const o of candidates) {
  const { data: audit, error: e1 } = await admin.from("audits").insert({
    notice_id: o.noticeId, solicitation_number: o.solicitationNumber, title: (o.title||"").slice(0,200),
    agency: o.fullParentPathName || o.department || null, naics_code: o.naicsCode || null,
    set_aside: o.typeOfSetAside || null, posted_date: o.postedDate || null,
    response_deadline: o.responseDeadLine || null, user_id: USER, status: "processing",
  }).select("id").single();
  if (e1 || !audit) { console.log("  insert fail:", o.solicitationNumber, e1?.message); continue; }
  const { error: e2 } = await admin.from("pending_audits").insert({
    notice_id: o.noticeId, solicitation_number: o.solicitationNumber, title: (o.title||"").slice(0,200),
    agency: o.fullParentPathName || o.department || null, naics_code: o.naicsCode || null,
    set_aside: o.typeOfSetAside || null, response_deadline: o.responseDeadLine || null,
    pdf_url: null, source: "user", status: "pending", user_id: USER, audit_id: audit.id,
    anthropic_file_id: null, pdf_filename: null, upload_docs: null,
  });
  if (e2) { await admin.from("audits").update({status:"failed",error_message:"enqueue: "+e2.message}).eq("id",audit.id); console.log("  enqueue fail:", o.solicitationNumber, e2.message); continue; }
  est += 2;
  console.log(`  ✓ ${o.solicitationNumber||o.noticeId} | ${(o.title||"").slice(0,40)} | ${(o.fullParentPathName||o.department||"?").split(".")[0]} | ${o.typeOfSetAsideDescription||"Full&Open"} | ${docCount(o)} docs`);
  console.log(`      audit_id=${audit.id} · SAM: ${o.uiLink||("https://sam.gov/opp/"+o.noticeId+"/view")}`);
}
console.log(`\nENQUEUED ${candidates.length} hard sols via SAM-fetch path · est ~$${est}-${est+ (candidates.length*1)} Opus · worker is processing them now.`);
