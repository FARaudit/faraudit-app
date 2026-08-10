/* CMMC flap probe 5 — is the SOURCE-scan's extra hit REAL, or is it a mention? READ-ONLY, $0.
 * Prints every LEVEL_TRIGGERS match in context for the solicitation where a source scan disagreed
 * with today's findings-derived level, plus the row's agency. A source scan that trades a false
 * negative for a false positive is not an improvement.
 *   npx dotenv -e /Users/josearodriguezjr./faraudit-app/.env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe5.ts
 */
import { createClient } from "@supabase/supabase-js";
import { LEVEL_TRIGGERS } from "../../src/lib/bd-os/cmmc-levels";

const SOL = "36C25626Q1137";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin.from("audits")
    .select("id, solicitation_number, agency, title, raw_pdf_text")
    .eq("solicitation_number", SOL).limit(5);
  const rows = (data ?? []) as Array<Record<string, any>>;
  const row = rows.find((r) => r.raw_pdf_text);
  if (!row) { console.log("no surviving source"); return; }
  console.log(`sol=${row.solicitation_number}  agency=${row.agency}\ntitle=${String(row.title).slice(0, 120)}\n`);
  const text = row.raw_pdf_text as string;

  for (const t of LEVEL_TRIGGERS) {
    const rx = new RegExp(t.rx.source, t.rx.flags.includes("g") ? t.rx.flags : t.rx.flags + "g");
    const matches = [...text.matchAll(rx)].slice(0, 6);
    if (!matches.length) continue;
    for (const m of matches) {
      const i = m.index ?? 0;
      const s = Math.max(0, i - 180), e = Math.min(text.length, i + 220);
      console.log(`--- [L${t.level}] ${t.label} @${i} ---`);
      console.log("    " + text.slice(s, e).replace(/\s+/g, " "));
    }
    console.log(`    (${[...text.matchAll(rx)].length} total match(es) for this trigger)\n`);
  }
})();
