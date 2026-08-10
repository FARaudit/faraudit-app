/* CMMC false-negative probe — why does a clause_flowdown finding present in run N vanish in run N+1?
 * READ-ONLY. No paid runs. Reproduces every number before it is reported.
 *   npx dotenv -e /Users/josearodriguezjr./faraudit-app/.env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe.ts
 */
import { createClient } from "@supabase/supabase-js";
import { inferLevel, LEVEL_TRIGGERS } from "../../src/lib/bd-os/cmmc-levels";

const SOLS = ["FA303026Q0020", "FA442726Q1068"];

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin
    .from("audits")
    .select("id, solicitation_number, notice_id, created_at, compliance_json")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(JSON.stringify(error));
  const rows = (data ?? []) as Array<Record<string, any>>;

  // ── A. corpus shape: is the persisted findings array capped? ──
  const v3 = rows.filter((r) => r.compliance_json?.engine === "agentic_v3");
  const counts = v3.map((r) => (r.compliance_json?.v3?.findings ?? []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const hist = new Map<number, number>();
  for (const c of counts) hist.set(c, (hist.get(c) ?? 0) + 1);
  console.log(`\n=== A. CORPUS ===`);
  console.log(`rows=${rows.length}  v3 rows=${v3.length}  total v3 findings=${total}  max=${Math.max(...counts)}  min=${Math.min(...counts)}`);
  console.log(`findings-count histogram (count: rows):`);
  console.log([...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join("  "));

  // ── B. the two solicitations, run by run ──
  console.log(`\n=== B. RUNS ===`);
  const clauseRx = /252\.204-70(12|19|20|21)|CMMC|NIST\s*SP\s*800-17[12]|\bCUI\b|controlled unclassified/i;
  for (const sol of SOLS) {
    const runs = rows.filter((r) => String(r.solicitation_number ?? "").trim() === sol)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    console.log(`\n--- ${sol}: ${runs.length} run(s) ---`);
    for (const r of runs) {
      const cj = r.compliance_json ?? {};
      const p = cj.v3 ?? {};
      const findings = (p.findings ?? []) as Array<Record<string, any>>;
      const { level, trigger } = inferLevel(r);
      // which findings carry a CMMC-class token, anywhere in the finding object
      const hits = findings.filter((f) => clauseRx.test(JSON.stringify(f)));
      const kinds = new Map<string, number>();
      for (const f of findings) kinds.set(String(f.kind ?? "-"), (kinds.get(String(f.kind ?? "-")) ?? 0) + 1);
      console.log(
        `${r.created_at}  ${String(r.id).slice(0, 8)}  L${level}${trigger ? ` [${trigger}]` : ""}` +
        `  findings=${findings.length}  cmmc-bearing=${hits.length}` +
        `  verdict=${p.verdict ?? "-"}  honest_fail=${cj.honest_fail}` +
        `  src=${cj.source_chars}  docs=${cj.doc_count}  engine=${cj.engine ?? "(v2)"}` +
        `  drops=${(cj.verifier_drops ?? []).length}`
      );
      console.log(`      kinds: ${[...kinds.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
      for (const h of hits) {
        console.log(`      HIT [${h.kind ?? "-"}] cite="${String(h.citation ?? "").slice(0, 70)}" req="${String(h.requirement ?? "").slice(0, 70)}"`);
      }
      // did any verifier DROP remove a cmmc-bearing finding?
      for (const d of (cj.verifier_drops ?? []) as Array<Record<string, any>>) {
        if (clauseRx.test(JSON.stringify(d))) console.log(`      DROPPED [${d.dropReason ?? "-"}] ${String(d.requirement ?? "").slice(0, 90)}`);
      }
    }
  }

  // ── C. THE DECISIVE TEST: is the clause in the SOURCE the newest run read? ──
  console.log(`\n=== C. SOURCE-SIDE GROUND TRUTH (raw_pdf_text) ===`);
  for (const sol of SOLS) {
    const runs = rows.filter((r) => String(r.solicitation_number ?? "").trim() === sol)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    for (const r of runs) {
      const { data: src } = await admin.from("audits").select("raw_pdf_text").eq("id", r.id).single();
      const text = (src as any)?.raw_pdf_text ?? null;
      if (text == null) { console.log(`${sol} ${String(r.id).slice(0, 8)} ${r.created_at}: raw_pdf_text NULL (not re-groundable)`); continue; }
      const matched = LEVEL_TRIGGERS.filter((t) => t.rx.test(text)).map((t) => t.label);
      console.log(`${sol} ${String(r.id).slice(0, 8)} ${r.created_at}: src_chars=${text.length} triggers_in_source=[${matched.join(", ") || "NONE"}]`);
    }
  }
})();
