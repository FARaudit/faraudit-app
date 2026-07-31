// $0 PROBE for REPORT-TRUTH #8 (fabricated modal qualifier).
//
// The dangerous direction is STRIPPING FORCE FROM A REAL OBLIGATION — that under-warns the bidder. So the planted
// NEGATIVES (must NOT fire) carry more weight here than the positives, and they are checked first.
//
//   LEG A  live specimen — 61aaaa95 #18 and #30 must both be corrected, and no other finding in that run touched.
//   LEG B  planted negatives — genuine obligations phrased many ways. Any fire here is a customer-harming defect.
//   LEG C  subject scoping — the specimen's own trap: the source says "must attend" of a DIFFERENT event. A
//          document-wide obligation scan stands down wrongly; only subject-scoped sentences decide. Proven by
//          running both policies against the real source.
//   LEG D  corpus over-fire guard — 14 banked audits, real findings. Bounded rate, no crashes, no malformed rewrite.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { groundModalForce, FORCE_CORRECTED_PREFIX, FORCE_GROUNDING_INTERNALS_FOR_TEST as I } from "../../src/lib/audit-force-grounding";

const RUN = "61aaaa95-b205-43b0-bf41-0a25fdd9265e";
let red = 0;

(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: run } = await a.from("audits").select("raw_pdf_text,compliance_json").eq("id", RUN).single();
  const src = String((run as any)?.raw_pdf_text || "");
  const findings: any[] = (run as any)?.compliance_json?.v3?.findings || [];

  // ---- LEG B — planted negatives (checked first: these are the ones that hurt) -----------------------
  console.log("=== LEG B · genuine obligations (must NOT be corrected) ===");
  const NEGATIVES: Array<{ why: string; requirement: string; excerpt: string; source: string }> = [
    { why: "excerpt uses shall", requirement: "Mandatory site visit attendance is a gate.", excerpt: "Offerors shall attend the site visit on 13 August 2026.", source: "Offerors shall attend the site visit on 13 August 2026." },
    { why: "excerpt uses must attend", requirement: "A mandatory site visit is scheduled.", excerpt: "Prospective offerors must attend the site visit.", source: "Prospective offerors must attend the site visit." },
    { why: "excerpt states a prerequisite", requirement: "Mandatory pre-bid conference.", excerpt: "Attendance at the pre-bid conference is a prerequisite to award.", source: "Attendance at the pre-bid conference is a prerequisite to award." },
    { why: "consequence form, no modal", requirement: "Mandatory job walk.", excerpt: "Offers from firms that did not attend the job walk will not be considered.", source: "Offers from firms that did not attend the job walk will not be considered." },
    { why: "source uses the force word elsewhere", requirement: "Mandatory site visit.", excerpt: "Site visit will be held on 13 August.", source: "Site visit will be held on 13 August. A mandatory pre-work meeting follows award." },
    { why: "obligation in another sentence naming the subject", requirement: "Mandatory site visit.", excerpt: "Site visit will be held on 13 August.", source: "Site visit will be held on 13 August. The site visit is required for all offerors." },
    { why: "subject never discussed in source", requirement: "Mandatory bid bond.", excerpt: "No bond language located.", source: "This solicitation is for lawn maintenance services." },
  ];
  for (const n of NEGATIVES) {
    const out = groundModalForce([{ id: "n", requirement: n.requirement, excerpt: n.excerpt }], n.source);
    if (out.corrected.length) { red++; console.log(`  FIRED WRONGLY (${n.why})\n     -> ${out.corrected[0].after.slice(0, 150)}`); }
  }
  console.log(`  fired ${NEGATIVES.filter((n) => groundModalForce([{ id: "n", requirement: n.requirement, excerpt: n.excerpt }], n.source).corrected.length).length}/${NEGATIVES.length} (want 0)`);
  console.log(red === 0 ? "  LEG B GREEN" : "  LEG B RED — a real obligation was softened.");

  // ---- LEG A — live specimen --------------------------------------------------------------------------
  console.log("\n=== LEG A · live specimen 61aaaa95 ===");
  const outRun = groundModalForce(findings.map((f, i) => ({ ...f, id: `f#${i}` })), src);
  const ids = outRun.corrected.map((c) => c.id).sort();
  console.log(`  corrected: ${ids.join(", ") || "(none)"}`);
  for (const c of outRun.corrected) console.log(`   [${c.id}] force="${c.force}" subject="${c.subject}"\n      BEFORE: ${c.before.replace(/\s+/g, " ").slice(0, 160)}\n      AFTER : ${c.after.replace(/\s+/g, " ").slice(0, 300)}`);
  const want = ["f#18", "f#30"];
  const okA = want.every((w) => ids.includes(w)) && ids.length === want.length;
  if (!okA) { red++; console.log(`  LEG A RED — expected exactly ${want.join(", ")}`); } else console.log("  LEG A GREEN");

  // ---- LEG C — subject scoping is load-bearing --------------------------------------------------------
  console.log("\n=== LEG C · document-wide vs subject-scoped obligation scan ===");
  const docWide = I.OBLIGATION_MARKER.test(src);
  const subjSents = I.sentencesNaming(src, "site visit");
  const subjScoped = subjSents.some((s) => I.OBLIGATION_MARKER.test(s));
  console.log(`  document-wide obligation language present : ${docWide}  (would stand down -> fabrication ships)`);
  console.log(`  sentences naming "site visit"             : ${subjSents.length}`);
  for (const s of subjSents) console.log(`      "${s.replace(/\s+/g, " ").trim().slice(0, 150)}"`);
  console.log(`  obligation among those sentences          : ${subjScoped}  (correctly fires)`);
  if (!docWide || subjScoped) { red++; console.log("  LEG C RED — the scoping distinction is not exercised by this specimen."); }
  else console.log("  LEG C GREEN — subject scoping is what makes the specimen decidable.");

  // ---- LEG D — corpus over-fire guard ------------------------------------------------------------------
  console.log("\n=== LEG D · corpus over-fire guard (14 banked audits) ===");
  const { data } = await a.from("audits").select("id,solicitation_number,raw_pdf_text,compliance_json")
    .eq("status", "complete").not("raw_pdf_text", "is", null).order("created_at", { ascending: false }).limit(14);
  let rows = 0, totalF = 0, totalC = 0, crashes = 0;
  for (const r of ((data || []) as any[])) {
    const f = r.compliance_json?.v3?.findings;
    if (!Array.isArray(f) || !f.length) continue;
    try {
      const out = groundModalForce(f.map((x: any, i: number) => ({ ...x, id: `f#${i}` })), r.raw_pdf_text);
      rows++; totalF += f.length; totalC += out.corrected.length;
      if (out.corrected.length) console.log(`  ${String(r.id).slice(0, 8)} ${r.solicitation_number}: ${out.corrected.length} corrected`);
      for (const c of out.corrected) {
        if (!c.after.startsWith(FORCE_CORRECTED_PREFIX)) { console.log(`    !! malformed rewrite ${c.id}`); red++; }
        if (new RegExp(`\\b${c.force}\\b`, "i").test(c.after.replace(/is ${c.force}/i, ""))) { /* the word may appear in the explanatory clause by design */ }
      }
    } catch (e) { crashes++; console.log(`  CRASH ${String(r.id).slice(0, 8)}: ${(e as Error).message.slice(0, 70)}`); }
  }
  const rate = totalF ? (totalC / totalF * 100) : 0;
  console.log(`  audits ${rows} · findings ${totalF} · corrected ${totalC} (${rate.toFixed(2)}%) · crashes ${crashes}`);
  if (crashes > 0 || rate > 3) { red++; console.log("  LEG D RED — rate or crash out of bounds."); } else console.log("  LEG D GREEN");

  console.log(`\n${red === 0 ? "ALL GREEN" : `${red} RED LEG(S)`}`);
  process.exit(red === 0 ? 0 : 1);
})();
