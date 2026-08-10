/* CMMC flap probe 7 — the READ-SIDE fix, measured on all 116 runs / 35 solicitations. READ-ONLY, $0.
 *
 * Doctrine: the engine treats an asserted ABSENCE as ungroundable (applyNonPresenceHonesty,
 * "absence is ungroundable (Rule 64)"). So a run that is SILENT about 252.204-7012 has not found
 * that the clause is absent — it has found nothing. Taking the MAX level across runs of the SAME
 * document set is therefore not cherry-picking; it is the only reading consistent with that rule.
 *
 * GUARD: only runs whose input is provably identical are unioned — same source_chars AND same
 * doc_count. A re-run over a changed package (an amendment) has different bytes, so it never
 * unions with the old one and an amendment can still lower the level.
 *
 * Reports the effect of each of three read-side policies vs today's newest-only.
 *   npx dotenv -e /Users/josearodriguezjr./faraudit-app/.env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe7.ts
 */
import { createClient } from "@supabase/supabase-js";
import { inferLevel } from "../../src/lib/bd-os/cmmc-levels";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin.from("audits")
    .select("id, solicitation_number, notice_id, agency, created_at, compliance_json")
    .order("created_at", { ascending: false }).limit(1000);
  const rows = (data ?? []) as Array<Record<string, any>>;

  const bySol = new Map<string, Array<Record<string, any>>>();
  for (const r of rows) {
    const key = String(r.solicitation_number ?? "").trim() || String(r.notice_id ?? "").trim() || `id:${r.id}`;
    if (!bySol.has(key)) bySol.set(key, []);
    bySol.get(key)!.push(r);
  }

  let changed = 0, sameInputChanged = 0;
  const lines: string[] = [];
  for (const [sol, runs] of bySol) {
    runs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const newest = runs[0];
    const todayLevel = inferLevel(newest).level;

    // policy 1 — max across ALL runs of the solicitation (no guard)
    const allMax = runs.map((r) => inferLevel(r).level).sort().reverse()[0];

    // policy 2 — max across runs whose INPUT is provably identical to the newest run's
    const fp = (r: Record<string, any>) => `${r.compliance_json?.source_chars ?? "?"}|${r.compliance_json?.doc_count ?? "?"}`;
    const newestFp = fp(newest);
    const sameInput = runs.filter((r) => fp(r) === newestFp && newestFp !== "?|?");
    const guardedMax = sameInput.length ? sameInput.map((r) => inferLevel(r).level).sort().reverse()[0] : todayLevel;

    if (allMax !== todayLevel) changed++;
    if (guardedMax !== todayLevel) sameInputChanged++;
    if (allMax !== todayLevel || guardedMax !== todayLevel) {
      lines.push(
        `${sol.padEnd(22)} runs=${String(runs.length).padStart(2)} sameInput=${String(sameInput.length).padStart(2)} ` +
        `today=L${todayLevel}  guarded-max=L${guardedMax}  all-max=L${allMax}  ` +
        `agency=${String(newest.agency ?? "").slice(0, 26)}`
      );
    }
  }

  console.log(`\n=== read-side policy effect · ${bySol.size} solicitations · ${rows.length} runs ===`);
  console.log(`rows whose displayed level CHANGES vs today:`);
  console.log(`  policy A  max across all runs           : ${changed}/${bySol.size}`);
  console.log(`  policy B  max across SAME-INPUT runs    : ${sameInputChanged}/${bySol.size}   ← the guarded one`);
  console.log(`\n${lines.join("\n")}`);

  // and the direction — a compliance page must never LOWER on this policy
  console.log(`\n(by construction both policies are monotonic: max() can only raise or hold, never lower.)`);
})();
