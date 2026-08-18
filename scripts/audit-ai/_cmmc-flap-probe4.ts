/* CMMC flap probe 4 — MEASURE THE PROPOSED FIX before recommending it. READ-ONLY, $0.
 * For every audit whose assembled source survived (raw_pdf_text non-null, persisted from 2026-07-23),
 * compare:
 *    A) inferLevel(compliance_json)  — today's behaviour: reads the MODEL-GENERATED findings array
 *    B) a deterministic LEVEL_TRIGGERS scan over the SOURCE TEXT the run actually read
 * Both error directions are counted: source-says-higher (today's false negative) AND
 * source-says-lower (the new-false-positive risk a source scan would introduce).
 *   npx dotenv -e /Users/josearodriguezjr./faraudit-app/.env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe4.ts
 */
import { createClient } from "@supabase/supabase-js";
import { inferLevel, LEVEL_TRIGGERS } from "../../src/lib/bd-os/cmmc-levels";

function levelFromSource(text: string): { level: "0" | "1" | "2" | "3"; trigger: string | null } {
  for (const t of LEVEL_TRIGGERS) if (t.rx.test(text)) return { level: t.level, trigger: t.label };
  return { level: "0", trigger: null };
}

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin
    .from("audits").select("id, solicitation_number, created_at, compliance_json")
    .order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(JSON.stringify(error));
  const rows = (data ?? []) as Array<Record<string, any>>;
  const v3 = rows.filter((r) => r.compliance_json?.engine === "agentic_v3");

  let haveSource = 0, agree = 0;
  const srcHigher: string[] = [], srcLower: string[] = [];
  for (const r of v3) {
    const { data: s } = await admin.from("audits").select("raw_pdf_text").eq("id", r.id).single();
    const text = (s as any)?.raw_pdf_text as string | null;
    if (!text) continue;
    haveSource++;
    const fromFindings = inferLevel(r);
    const fromSource = levelFromSource(text);
    const line = `${String(r.solicitation_number ?? "-").padEnd(22)} ${String(r.id).slice(0, 8)} ${r.created_at.slice(0, 10)}  ` +
      `findings→L${fromFindings.level}${fromFindings.trigger ? `[${fromFindings.trigger}]` : ""}  ` +
      `SOURCE→L${fromSource.level}${fromSource.trigger ? `[${fromSource.trigger}]` : ""}  src=${text.length}`;
    if (fromFindings.level === fromSource.level) { agree++; continue; }
    if (fromSource.level > fromFindings.level) srcHigher.push(line); else srcLower.push(line);
  }

  console.log(`\n=== v3 rows: ${v3.length} · with surviving source: ${haveSource} (raw_pdf_text persists from 2026-07-23) ===`);
  console.log(`AGREE: ${agree}/${haveSource}`);
  console.log(`\n--- SOURCE HIGHER than findings (today's FALSE NEGATIVE — customer told less than the doc says): ${srcHigher.length} ---`);
  srcHigher.forEach((l) => console.log("  " + l));
  console.log(`\n--- SOURCE LOWER than findings (a source scan would UNDER-report these): ${srcLower.length} ---`);
  srcLower.forEach((l) => console.log("  " + l));
})();
