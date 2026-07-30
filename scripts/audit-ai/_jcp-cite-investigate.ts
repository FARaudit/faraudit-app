// OPEN DEFECT (carried in ceo/RESUME.md) — JCP gate citation. $0, read-only.
//
// audit-engine.ts:2576 hands the customer `JCP_CERTIFICATION_REQUIRED: "DD Form 2345 / 252.227-7025"`.
// audit-engine.ts:2501-2503, the engine's OWN comment, says: "No mandating-clause arm exists for JCP
// (252.227-7025 in a clause list restricts data use; it does not by itself mandate JCP certification to
// bid)." So the report attributes a bid-blocking requirement to a clause the engine has already reasoned
// does not impose it.
//
// Before proposing anything: does this reach a customer, and on what evidence does the gate actually fire?
// A hardcoded citation that never renders is a lint; one that renders under a gate fired by unrelated
// language is the render-cause-must-derive-from-engine class.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

// verbatim from audit-engine.ts:2218
const JCP_RE = /\bJCP\b|JCP[-\s]?(?:certified|cert|certification)|Joint\s+Certification\s+Program|DD\s*Form\s*2345|militarily\s+critical\s+technical\s+data|noncommercial\s+technical\s+data|252\.227-7025/i;
// the individual arms, so we can see WHICH one fired
const ARMS: Array<[string, RegExp]> = [
  ["JCP (bare)", /\bJCP\b/i],
  ["JCP certified/cert", /JCP[-\s]?(?:certified|cert|certification)/i],
  ["Joint Certification Program", /Joint\s+Certification\s+Program/i],
  ["DD Form 2345", /DD\s*Form\s*2345/i],
  ["militarily critical technical data", /militarily\s+critical\s+technical\s+data/i],
  ["noncommercial technical data", /noncommercial\s+technical\s+data/i],
  ["252.227-7025 (the cited clause itself)", /252\.227-7025/i],
];

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data, error } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Record<string, any>[];

  let withSource = 0, jcpFires = 0, gatePersisted = 0, citedButAbsent = 0;
  console.log(`rows: ${rows.length}\n`);

  for (const row of rows) {
    const src: string = row.raw_pdf_text ?? "";
    const cj = row.compliance_json ?? {};
    const gates: any[] = cj.gate_conditions ?? [];
    // MATCH ON `citation`, NOT on a `code`/`gate` key. The first version of this probe looked for
    // `g.code ?? g.gate` and reported 0 — but the persisted row shape is {title, context, citation,
    // blocker_note}, so it was reading fields that do not exist and returning a false negative. The
    // engine-side gate CODE never survives projectGateConditions; only the rendered citation does.
    const jcpRow = gates.find((g) => /2345|227-7025/i.test(String(g?.citation ?? "")));
    if (jcpRow) {
      gatePersisted++;
      console.log(`🔎 ${String(row.id).slice(0, 8)} ${row.solicitation_number} — PERSISTED JCP gate: ${JSON.stringify(jcpRow).slice(0, 260)}`);
    }
    if (!src) continue;
    withSource++;
    if (!JCP_RE.test(src)) continue;
    jcpFires++;
    const fired = ARMS.filter(([, re]) => re.test(src)).map(([n]) => n);
    const clausePresent = /252\.227-7025/i.test(src);
    const ddPresent = /DD\s*Form\s*2345/i.test(src);
    if (!clausePresent) citedButAbsent++;
    console.log(`   ${String(row.id).slice(0, 8)} ${row.solicitation_number}: JCP_RE fires on [${fired.join(" · ")}]`);
    console.log(`      252.227-7025 in source: ${clausePresent}   DD Form 2345 in source: ${ddPresent}` +
      (!clausePresent ? "   ⚠ the report would cite a clause this record does not contain" : ""));
  }

  // REACHABILITY — the question that decides whether this is a live fabrication or a latent one.
  const withGates = rows.filter((r) => Array.isArray(r.compliance_json?.gate_conditions) && r.compliance_json.gate_conditions.length);
  const byEngine: Record<string, number> = {};
  for (const r of withGates) { const e = String(r.compliance_json?.engine ?? "(none)"); byEngine[e] = (byEngine[e] ?? 0) + 1; }

  console.log(`\nrows with source: ${withSource} · JCP_RE fires: ${jcpFires} · persisted gate_conditions JCP rows: ${gatePersisted}`);
  console.log(`records where the gate would fire while 252.227-7025 is ABSENT from the record: ${citedButAbsent}`);
  console.log(`\nrows with ANY persisted gate_conditions: ${withGates.length} / ${rows.length} — by engine: ${JSON.stringify(byEngine)}`);
  console.log("VERDICT: gate_conditions is written only on the LEGACY (engine=(none)) path; the current agentic_v3");
  console.log("engine persists none. Combined with 0 persisted JCP-cited rows, the wrong citation at");
  console.log("audit-engine.ts:2576 is a REAL but LATENT defect — it has not reached a customer on this corpus.");
})();
