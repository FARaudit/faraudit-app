// $0 FALSIFICATION PROBE — written BEFORE the widening it validates, and it must be RED at the pre-fix commit.
//
// The claim under test: DOC_ABSENCE in audit-absence-reconcile.ts is a SHAPE rule. It is not — it permits exactly one
// hardcoded interjection ("referenced but"), so run 61aaaa95's "is listed but not reproduced" walked through it.
// This probe measures the RESIDUAL that a vocabulary rule leaves behind, three ways:
//
//   LEG 1  Live specimen — finding #54 of 61aaaa95 must go MISS -> MATCH. RED before the fix by construction.
//   LEG 2  Synthetic connective sweep — connectives a competent writer would reach for. The pre-fix regex must FAIL
//          most of these; that failure IS the evidence the rule was vocabulary. Post-fix all must pass.
//   LEG 3  Over-refute guard on real banked data — the dangerous direction. New regex may not refute anything the old
//          one refuted differently in KIND, and the corpus-wide rate must stay bounded.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const RUN = "61aaaa95-b205-43b0-bf41-0a25fdd9265e";

// The rule as it shipped in ecde086. Frozen here so the probe keeps measuring the delta after the source moves.
const PRE_FIX = /\b(?:is|are|was|were)\s+(?:referenced\s+but\s+)?not\s+(?:provided|reproduced|attached|included|furnished|supplied|present|available|located)\b/i;

/** Connectives a competent writer reaches for. NONE of these is named in the fix — that is the point: the fix must
 *  quantify over the slot, so this list is a test input, never an implementation input. */
const CONNECTIVES = [
  "", "referenced but", "listed but", "cited but", "named but", "mentioned but", "identified but",
  "listed, but", "referenced yet", "listed though", "identified however", "called out but",
  "incorporated by reference but", "identified in the notice but",
];
const PREDICATES = ["not provided", "not reproduced", "not attached", "not included", "not furnished", "not supplied"];

(async () => {
  const { DOC_ABSENCE_FOR_TEST, reconcileAbsenceClaims } = (await import("../../src/lib/audit-absence-reconcile")) as any;
  const NOW: RegExp = DOC_ABSENCE_FOR_TEST ?? PRE_FIX; // pre-fix the export does not exist -> probe runs against the old rule
  const exported = Boolean(DOC_ABSENCE_FOR_TEST);
  console.log(`rule under test: ${exported ? "DOC_ABSENCE_FOR_TEST (post-fix)" : "PRE_FIX literal (export absent — pre-fix commit)"}`);

  let red = 0;

  // ---- LEG 2 — synthetic connective sweep -----------------------------------------------------------
  console.log("\n=== LEG 2 · connective sweep ===");
  let miss2 = 0, tot2 = 0;
  for (const c of CONNECTIVES) {
    for (const p of PREDICATES) {
      const claim = `PWS (Attachment 0001) is ${c ? c + " " : ""}${p} in the assigned source — obligations are unknown.`;
      tot2++;
      if (!NOW.test(claim)) { miss2++; if (miss2 <= 8) console.log(`  MISS: "is ${c} ${p}"`); }
    }
  }
  console.log(`  matched ${tot2 - miss2}/${tot2} · missed ${miss2}`);
  if (miss2 > 0) { red++; console.log("  LEG 2 RED — the rule is enumerating connectives, not matching a shape."); }
  else console.log("  LEG 2 GREEN");

  // ---- data-backed legs ------------------------------------------------------------------------------
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // LEG 1 — the live specimen
  const { data: run } = await a.from("audits").select("compliance_json,raw_pdf_text").eq("id", RUN).single();
  const f54 = ((run as any)?.compliance_json?.v3?.findings || [])[54];
  console.log("\n=== LEG 1 · live specimen 61aaaa95 #54 ===");
  if (!f54) { console.log("  finding #54 absent — cannot evaluate"); red++; }
  else {
    const hit = NOW.test(String(f54.requirement || ""));
    console.log(`  "is listed but not reproduced" -> ${hit ? "MATCH" : "MISS"}`);
    if (!hit) { red++; console.log("  LEG 1 RED — the shipped false PWS claim still escapes."); } else console.log("  LEG 1 GREEN");
  }

  // ---- LEG 4 — SECOND-SUBJECT LEAK (planted negatives, through the PRODUCTION path) -----------------
  // Each sentence names document A ("PWS") in subject position, then asserts absence of document B in a coordinate
  // clause. Refuting any of them would delete a possibly-true warning about B on the strength of A's presence — the
  // dangerous direction. Driven through reconcileAbsenceClaims() against the REAL 61aaaa95 source, which genuinely
  // contains a PWS region, so this exercises the shipped composition and not a re-implementation of it.
  // FALSIFIABILITY: `_rt8-leg4-falsify.ts` runs these same sentences against the naive length-only widening and
  // against proximity-only subject matching; both leak 4/5. This leg can fail, and did.
  console.log("\n=== LEG 4 · second-subject leak, production path (must refute NOTHING) ===");
  const LEAKS = [
    "The PWS is complete and the drawings are not provided in the source.",
    // NB: the second document must be one this solicitation genuinely lacks. An earlier draft used "wage
    // determination" here and the leg went red on a CORRECT refutation — that document IS a region of this source,
    // so matching it was the module working, not leaking. A planted negative has to be genuinely negative.
    "PWS (Attachment 0001) is present, but the past performance questionnaire is not attached.",
    "The PWS is thorough although the site visit details are not furnished.",
    "PWS is analyzed; the pricing schedule is not included.",
    "The PWS is in the source. The drawings are not provided.",
  ];
  const realSrc = String((run as any)?.raw_pdf_text || "");
  const provAll = new Set<string>((((run as any)?.compliance_json?.finding_provenance) || []).map((p: any) => p.doc).filter((d: string) => d && d !== "(ungrounded)"));
  const leakOut = reconcileAbsenceClaims(LEAKS.map((s, i) => ({ id: `leak#${i}`, requirement: s })), realSrc, provAll, null);
  for (const x of leakOut.refuted) console.log(`  LEAK ${x.id} -> matched doc "${x.doc}"\n        ${x.before}`);
  console.log(`  refuted ${leakOut.refuted.length}/${LEAKS.length}`);
  if (leakOut.refuted.length > 0) { red++; console.log("  LEG 4 RED — a claim about a second document was refuted."); } else console.log("  LEG 4 GREEN");

  // LEG 3 — over-refute guard across banked audits
  console.log("\n=== LEG 3 · over-refute guard (14 banked audits) ===");
  const { data } = await a.from("audits").select("id,solicitation_number,raw_pdf_text,compliance_json,set_aside")
    .eq("status", "complete").not("raw_pdf_text", "is", null).order("created_at", { ascending: false }).limit(14);
  let rows = 0, totalF = 0, totalR = 0, crashes = 0;
  for (const r of ((data || []) as any[])) {
    const f = r.compliance_json?.v3?.findings;
    if (!Array.isArray(f) || !f.length) continue;
    const prov = new Set<string>((r.compliance_json?.finding_provenance || []).map((p: any) => p.doc).filter((d: string) => d && d !== "(ungrounded)"));
    try {
      const out = reconcileAbsenceClaims(f.map((x: any, i: number) => ({ ...x, id: `f#${i}` })), r.raw_pdf_text, prov, r.set_aside);
      rows++; totalF += f.length; totalR += out.refuted.length;
      for (const x of out.refuted) if (!/^(CORRECTED|NOT ANALYZED) — /.test(x.after)) { console.log(`  !! malformed rewrite ${r.id.slice(0, 8)} ${x.id}`); red++; }
    } catch (e) { crashes++; console.log(`  CRASH ${String(r.id).slice(0, 8)}: ${(e as Error).message.slice(0, 70)}`); }
  }
  const rate = totalF ? (totalR / totalF * 100) : 0;
  console.log(`  audits ${rows} · findings ${totalF} · refuted ${totalR} (${rate.toFixed(1)}%) · crashes ${crashes}`);
  if (crashes > 0 || rate > 8) { red++; console.log("  LEG 3 RED — rate or crash out of bounds."); } else console.log("  LEG 3 GREEN");

  console.log(`\n${red === 0 ? "ALL GREEN" : `${red} RED LEG(S)`}`);
  process.exit(red === 0 ? 0 : 1);
})();
