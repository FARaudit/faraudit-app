/* CMMC flap probe 3 — did the temperature:0 pin (f1aed329, 2026-07-20) end the level flapping?
 * Splits every multi-run solicitation by whether its runs are BEFORE or AFTER the pin. READ-ONLY, $0.
 *   npx dotenv -e /Users/josearodriguezjr./faraudit-app/.env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe3.ts
 */
import { createClient } from "@supabase/supabase-js";
import { inferLevel } from "../../src/lib/bd-os/cmmc-levels";

const PIN = Date.parse("2026-07-20T00:00:00Z");   // temperature:0 pinned on the lens call

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin
    .from("audits").select("id, solicitation_number, notice_id, created_at, compliance_json")
    .order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(JSON.stringify(error));
  const rows = (data ?? []) as Array<Record<string, any>>;

  const bySol = new Map<string, Array<Record<string, any>>>();
  for (const r of rows) {
    const key = String(r.solicitation_number ?? "").trim() || String(r.notice_id ?? "").trim() || `id:${r.id}`;
    if (!bySol.has(key)) bySol.set(key, []);
    bySol.get(key)!.push(r);
  }

  const bucket = { pre: { multi: 0, dis: 0 }, post: { multi: 0, dis: 0 }, straddle: { multi: 0, dis: 0 } };
  console.log(`\n=== multi-run solicitations, split at the temperature:0 pin (2026-07-20) ===`);
  for (const [sol, runs] of bySol) {
    if (runs.length < 2) continue;
    runs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const ts = runs.map((r) => Date.parse(r.created_at));
    const era = ts.every((t) => t < PIN) ? "pre" : ts.every((t) => t >= PIN) ? "post" : "straddle";
    const levels = runs.map((r) => inferLevel(r).level);
    const dis = new Set(levels).size > 1;
    bucket[era].multi++; if (dis) bucket[era].dis++;
    console.log(
      `${era.padEnd(9)} ${sol.padEnd(24)} runs=${String(runs.length).padStart(2)} ` +
      `[${runs[runs.length - 1].created_at.slice(0, 10)} → ${runs[0].created_at.slice(0, 10)}] ` +
      `levels(new→old)=[${levels.join(",")}]${dis ? "  ← DISAGREE" : ""}`
    );
  }
  console.log(`\nPRE-pin      : ${bucket.pre.dis}/${bucket.pre.multi} multi-run solicitations disagree`);
  console.log(`POST-pin     : ${bucket.post.dis}/${bucket.post.multi} multi-run solicitations disagree`);
  console.log(`STRADDLE     : ${bucket.straddle.dis}/${bucket.straddle.multi} multi-run solicitations disagree`);
})();
