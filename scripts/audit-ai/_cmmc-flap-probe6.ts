/* CMMC flap probe 6 — the NARROW proposal, measured. READ-ONLY, $0.
 * Probe 5 showed a whole-source scan is worse: 36C25626Q1137 (VA window washing) matches
 * "controlled unclassified information" only inside the FAR 52.204-25 definition of
 * "information technology" — a mention, not an obligation.
 *
 * So split the trigger table by EVIDENCE CLASS and measure only the clause-number half:
 *   FACT   — a clause/standard NUMBER is a fact about the solicitation (252.204-70xx, 800-171/172, "CMMC Level N")
 *   PROSE  — CUI / FCI / "controlled unclassified information" / "federal contract information" are inferences
 * Then: (a) how does a FACT-only source scan compare to today's findings-derived level on all rows
 * with surviving source, and (b) do v3 rows even carry the dfars_flags/dfars_clauses that inferLevel
 * was built around, or is the model-generated findings array the only signal a v3 row has?
 *   npx dotenv -e /Users/josearodriguezjr./faraudit-app/.env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe6.ts
 */
import { createClient } from "@supabase/supabase-js";
import { inferLevel, LEVEL_TRIGGERS } from "../../src/lib/bd-os/cmmc-levels";

const FACT_LABELS = new Set([
  "CMMC Level 3 named", "NIST SP 800-172", "DFARS 252.204-7021", "DFARS 252.204-7012",
  "DFARS 252.204-7019", "DFARS 252.204-7020", "NIST SP 800-171", "CMMC Level 2 named",
  "FAR 52.204-21", "CMMC Level 1 named",
]);
const FACT_TRIGGERS = LEVEL_TRIGGERS.filter((t) => FACT_LABELS.has(t.label));
const PROSE_TRIGGERS = LEVEL_TRIGGERS.filter((t) => !FACT_LABELS.has(t.label));

function scan(text: string, table: typeof LEVEL_TRIGGERS) {
  for (const t of table) if (t.rx.test(text)) return { level: t.level, trigger: t.label };
  return { level: "0" as const, trigger: null };
}

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin.from("audits")
    .select("id, solicitation_number, agency, created_at, compliance_json")
    .order("created_at", { ascending: false }).limit(1000);
  const rows = (data ?? []) as Array<Record<string, any>>;
  const v3 = rows.filter((r) => r.compliance_json?.engine === "agentic_v3");

  // (b) what structured clause data does a v3 row actually carry?
  const v3WithFlags = v3.filter((r) => Array.isArray(r.compliance_json?.dfars_flags) && r.compliance_json.dfars_flags.length);
  const v3WithClauses = v3.filter((r) => Array.isArray(r.compliance_json?.dfars_clauses) && r.compliance_json.dfars_clauses.length);
  const v2 = rows.filter((r) => r.compliance_json?.engine !== "agentic_v3");
  const v2WithFlags = v2.filter((r) => Array.isArray(r.compliance_json?.dfars_flags) && r.compliance_json.dfars_flags.length);
  console.log(`\n=== B. what signal does each engine version carry? ===`);
  console.log(`v3 rows ${v3.length}: with dfars_flags=${v3WithFlags.length}  with dfars_clauses=${v3WithClauses.length}`);
  console.log(`v2 rows ${v2.length}: with dfars_flags=${v2WithFlags.length}`);
  console.log(`⇒ on a v3 row the ONLY CMMC signal is the model-generated findings array + verdict prose.`);

  // (a) FACT-only source scan vs today
  let have = 0, agree = 0; const higher: string[] = [], lower: string[] = [];
  const proseOnlyWouldFire: string[] = [];
  for (const r of v3) {
    const { data: s } = await admin.from("audits").select("raw_pdf_text").eq("id", r.id).single();
    const text = (s as any)?.raw_pdf_text as string | null;
    if (!text) continue;
    have++;
    const today = inferLevel(r);
    const fact = scan(text, FACT_TRIGGERS);
    const prose = scan(text, PROSE_TRIGGERS);
    if (fact.level === "0" && prose.level !== "0") {
      proseOnlyWouldFire.push(`${String(r.solicitation_number).padEnd(22)} ${String(r.id).slice(0, 8)} agency=${String(r.agency ?? "").slice(0, 28)} prose→L${prose.level}[${prose.trigger}]`);
    }
    const line = `${String(r.solicitation_number ?? "-").padEnd(22)} ${String(r.id).slice(0, 8)} ${r.created_at.slice(0, 10)}  ` +
      `today→L${today.level}${today.trigger ? `[${today.trigger}]` : ""}  FACT-SOURCE→L${fact.level}${fact.trigger ? `[${fact.trigger}]` : ""}`;
    if (today.level === fact.level) { agree++; continue; }
    if (fact.level > today.level) higher.push(line); else lower.push(line);
  }
  console.log(`\n=== A. FACT-only (clause-number) source scan vs today, on ${have} rows with surviving source ===`);
  console.log(`AGREE: ${agree}/${have}`);
  console.log(`\n-- clause IS in the source but today says lower (recovered false negatives): ${higher.length}`);
  higher.forEach((l) => console.log("   " + l));
  console.log(`\n-- today says higher than any clause number in the source (would REGRESS): ${lower.length}`);
  lower.forEach((l) => console.log("   " + l));
  console.log(`\n-- rows where ONLY a prose trigger fires (the false-positive class probe 5 found): ${proseOnlyWouldFire.length}`);
  proseOnlyWouldFire.forEach((l) => console.log("   " + l));
})();
