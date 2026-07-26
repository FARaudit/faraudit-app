// F2-LIVE VERIFICATION — replay the SHIPPED verdictOf() over real rows.
// The function is EXTRACTED FROM public/run-audit.html and evaluated, not reimplemented here: a
// reimplementation would prove only that I can write the same logic twice ([[feedback_placebo_family...]]).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const html = readFileSync("public/run-audit.html", "utf8");

function extract(startMarker: string, endMarker: string): string {
  const a = html.indexOf(startMarker);
  const b = html.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error(`could not extract ${startMarker}`);
  return html.slice(a, b);
}
// POLE_ROW table + verdictOf(), verbatim out of the served file.
const src = extract("var POLE_ROW = {", "function insightOf(");
const verdictOf = new Function(`${src}; return verdictOf;`)() as (a: Record<string, unknown>) => { cls: string; label: string };

// The OLD logic, preserved verbatim from git history for the before/after contrast.
function verdictOfOLD(a: Record<string, unknown>) {
  const ev = String(a.exec_verdict ?? "").toUpperCase().replace(/[\s_]+/g, "-");
  if (ev === "NO-BID" || ev === "NOBID") return { cls: "is-nobid", label: "NO-BID" };
  if (ev === "CAUTION") return { cls: "is-caution", label: "CAUTION" };
  if (ev === "PROCEED" || ev === "GO" || ev === "BID") return { cls: "is-proceed", label: "PROCEED" };
  const rec = String(a.recommendation ?? "").toUpperCase();
  if (rec === "DECLINE") return { cls: "is-nobid", label: "NO-BID" };
  if (rec === "PROCEED") return { cls: "is-proceed", label: "PROCEED" };
  if (rec.indexOf("CAUTION") !== -1) return { cls: "is-caution", label: "CAUTION" };
  const s = typeof a.compliance_score === "number" ? a.compliance_score : null;
  if (s != null) { if (s >= 70) return { cls: "is-proceed", label: "PROCEED" }; if (s < 40) return { cls: "is-nobid", label: "NO-BID" }; }
  return { cls: "is-caution", label: "CAUTION" };
}

const COMMITTAL = new Set(["is-proceed", "is-caution", "is-nobid"]);
const NO_VERDICT_POLES = new Set(["NEEDS_HUMAN_REVIEW", "INCOMPLETE"]);

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data, error } = await admin.from("audits")
    .select("id, solicitation_number, recommendation, compliance_score, v3_verdict:compliance_json->v3->>verdict, exec_verdict:compliance_json->executive_summary->>verdict")
    .order("created_at", { ascending: false }).limit(400);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Record<string, unknown>[];

  const tally = (f: (r: Record<string, unknown>) => { label: string }) => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = f(r).label; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  console.log(`rows: ${rows.length}\n`);
  console.log("── BEFORE (shipped-to-prod logic) ──");
  for (const [k, n] of tally(verdictOfOLD)) console.log(`   ${String(n).padStart(4)}  ${k}`);
  console.log("\n── AFTER (this branch) ──");
  for (const [k, n] of tally(verdictOf)) console.log(`   ${String(n).padStart(4)}  ${k}`);

  // GATE 1 — no audit whose engine reached NO VERDICT may render in a committal register.
  const g1 = rows.filter((r) => NO_VERDICT_POLES.has(String(r.v3_verdict ?? "")) && COMMITTAL.has(verdictOf(r).cls));
  // GATE 2 — every row carrying an authoritative pole must render that pole's own word.
  const WORD: Record<string, string> = { BID: "BID", BID_WITH_CAUTION: "BID · CAUTION", NO_BID: "NO-BID",
    INELIGIBLE: "INELIGIBLE", NEEDS_HUMAN_REVIEW: "NEEDS REVIEW", INCOMPLETE: "INCOMPLETE" };
  const g2 = rows.filter((r) => { const p = String(r.v3_verdict ?? ""); return WORD[p] && verdictOf(r).label !== WORD[p]; });
  // GATE 3 — nothing may still be labelled CAUTION purely because nothing else resolved.
  const g3 = rows.filter((r) => !r.v3_verdict && !r.exec_verdict && !r.recommendation && verdictOf(r).label === "CAUTION");
  // GATE 4 — the misrepresented population from the pre-fix measurement is now zero.
  const before = rows.filter((r) => ["NEEDS_HUMAN_REVIEW", "INCOMPLETE", "INELIGIBLE"].includes(String(r.v3_verdict ?? "")) && verdictOfOLD(r).label === "CAUTION");
  const after = before.filter((r) => verdictOf(r).label === "CAUTION");

  console.log("\n── GATES ──");
  console.log(`  G1 no-verdict poles in a committal register ......... ${g1.length === 0 ? "PASS (0)" : "FAIL (" + g1.length + ")"}`);
  console.log(`  G2 authoritative pole renders its own word .......... ${g2.length === 0 ? "PASS (0 mismatches)" : "FAIL (" + g2.length + ")"}`);
  console.log(`  G3 no residual guess-CAUTION on empty rows .......... ${g3.length === 0 ? "PASS (0)" : "FAIL (" + g3.length + ")"}`);
  console.log(`  G4 previously-misrepresented rows now honest ........ ${after.length === 0 ? `PASS (${before.length} → 0)` : "FAIL (" + after.length + " remain)"}`);
  for (const r of g2.slice(0, 5)) console.log(`     G2 mismatch: ${r.solicitation_number} pole=${r.v3_verdict} rendered=${verdictOf(r).label}`);

  const pass = !g1.length && !g2.length && !g3.length && !after.length;
  console.log(`\nRESULT: ${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
})();
