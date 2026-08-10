/* CMMC flap probe 2 — corpus-wide. READ-ONLY, $0.
 * (a) is verifier_drops ever non-empty? (absence is only evidence if the field can be non-empty)
 * (b) across ALL 76 v3 audits: how many solicitations have runs that DISAGREE on inferLevel,
 *     and in which direction, and how far apart are the disagreeing runs?
 * (c) how often does the CMMC signal live in a finding whose kind is NOT clause_flowdown?
 *   npx dotenv -e /Users/josearodriguezjr./faraudit-app/.env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe2.ts
 */
import { createClient } from "@supabase/supabase-js";
import { inferLevel } from "../../src/lib/bd-os/cmmc-levels";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin
    .from("audits")
    .select("id, solicitation_number, notice_id, created_at, compliance_json")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(JSON.stringify(error));
  const rows = (data ?? []) as Array<Record<string, any>>;
  const v3 = rows.filter((r) => r.compliance_json?.engine === "agentic_v3");

  // (a) can verifier_drops ever be non-empty?
  const withDrops = v3.filter((r) => (r.compliance_json?.verifier_drops ?? []).length > 0);
  const totalDrops = withDrops.reduce((a, r) => a + r.compliance_json.verifier_drops.length, 0);
  console.log(`\n=== A. verifier_drops ===`);
  console.log(`v3 rows with >=1 persisted drop: ${withDrops.length}/${v3.length}  (total drops ${totalDrops})`);
  console.log(`earliest v3 row: ${v3[v3.length - 1]?.created_at}   newest: ${v3[0]?.created_at}`);

  // (b) per-solicitation level agreement across runs — ALL rows (a v2 row is still a run of the sol)
  const bySol = new Map<string, Array<Record<string, any>>>();
  for (const r of rows) {
    const key = String(r.solicitation_number ?? "").trim() || String(r.notice_id ?? "").trim() || `id:${r.id}`;
    if (!bySol.has(key)) bySol.set(key, []);
    bySol.get(key)!.push(r);
  }
  console.log(`\n=== B. per-solicitation level agreement (${bySol.size} solicitations, ${rows.length} runs) ===`);
  let multi = 0, disagree = 0;
  const disagreeRows: string[] = [];
  for (const [sol, runs] of bySol) {
    runs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    if (runs.length < 2) continue;
    multi++;
    const levels = runs.map((r) => inferLevel(r).level);
    const uniq = [...new Set(levels)];
    if (uniq.length === 1) continue;
    disagree++;
    const newest = levels[0];
    const maxSeen = levels.slice().sort().reverse()[0];
    const spanH = (Date.parse(runs[0].created_at) - Date.parse(runs[runs.length - 1].created_at)) / 3.6e6;
    const understates = newest < maxSeen ? "NEWEST-UNDERSTATES" : "newest>=max";
    disagreeRows.push(
      `${sol.padEnd(24)} runs=${String(runs.length).padStart(2)} levels(new→old)=[${levels.join(",")}] span=${spanH.toFixed(1)}h  ${understates}`
    );
  }
  console.log(`solicitations with >1 run: ${multi}   of those, runs disagree on level: ${disagree}`);
  disagreeRows.sort().forEach((l) => console.log("  " + l));

  // (c) which finding kind carries the CMMC signal, corpus-wide
  const clauseRx = /252\.204-70(12|19|20|21)|CMMC|NIST\s*SP\s*800-17[12]|controlled unclassified/i;
  const kindTally = new Map<string, number>();
  let bearingRows = 0;
  for (const r of v3) {
    const fs = (r.compliance_json?.v3?.findings ?? []) as Array<Record<string, any>>;
    const hits = fs.filter((f) => clauseRx.test(JSON.stringify(f)));
    if (hits.length) bearingRows++;
    for (const h of hits) kindTally.set(String(h.kind ?? "-"), (kindTally.get(String(h.kind ?? "-")) ?? 0) + 1);
  }
  console.log(`\n=== C. which kind carries the CMMC signal ===`);
  console.log(`v3 rows with >=1 CMMC-bearing finding: ${bearingRows}/${v3.length}`);
  console.log([...kindTally.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "));

  // (d) where does inferLevel actually match today, corpus-wide? (which trigger, and from which field)
  const trigTally = new Map<string, number>();
  for (const r of rows) {
    const { level, trigger } = inferLevel(r);
    trigTally.set(`${level}:${trigger ?? "none"}`, (trigTally.get(`${level}:${trigger ?? "none"}`) ?? 0) + 1);
  }
  console.log(`\n=== D. inferLevel outcomes over all ${rows.length} runs ===`);
  console.log([...trigTally.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} -> ${v}`).join("\n"));
})();
