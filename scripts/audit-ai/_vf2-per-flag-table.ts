// PER-FLAG INSTRUMENTATION (Vehicle F2 · I6 — overdue). Emits a REAL per-flag behavior table for an audit row,
// replacing NOT-MEASURED stamps at the battery. Two measurement channels:
//   • RENDER-layer flags → toggle the flag OFF against the armed baseline and re-render the PERSISTED row
//     (renderV4ReportFromRow); a byte-diff ⇒ the flag PARTICIPATED on this record, with a char-delta as evidence.
//   • DECIDE-layer flags → participation is baked into compliance_json at engine time, so it cannot be re-measured
//     from a persisted row; reported as "in run-env" (from the flag registry) — the engine run-record's meta.flagEnv
//     + coverageV2 diagnostics carry their live evidence.
// $0. Run: npx tsx scripts/audit-ai/_vf2-per-flag-table.ts <audit_id>
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";

type Layer = "render" | "decide";
const FLAGS: { flag: string; layer: Layer; note: string }[] = [
  // vehicle F2 (this increment) — render-layer
  { flag: "AUDIT_SEVERITY_HONEST", layer: "render", note: "F-2 severity/label/dedup" },
  { flag: "AUDIT_SETASIDE_HEADER_RECONCILE", layer: "render", note: "F-3 set-aside header" },
  { flag: "AUDIT_COVERAGE_DISPLAY_COHERENT", layer: "render", note: "F-5 coverage masthead" },
  { flag: "AUDIT_MASTHEAD_OFFICE_LEAF", layer: "render", note: "F-4 office leaf" },
  // vehicle F (report-layer) — render
  { flag: "AUDIT_NHR_NARRATIVE_TRUE_CAUSE", layer: "render", note: "D2/D3 true-cause narrative" },
  { flag: "AUDIT_ELIG_OPERATIVE_EXCERPT", layer: "decide", note: "D1 operative excerpt" },
  { flag: "AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE", layer: "decide", note: "concluded site-visit bar" },
  // vehicle A–E — decide
  { flag: "AUDIT_VERDICT_POLE_PRECEDENCE", layer: "decide", note: "verdict-pole precedence" },
  { flag: "AUDIT_COVERAGE_COUNTER_SPLIT", layer: "render", note: "read-vs-grounded copy" },
  { flag: "AUDIT_CYBER_RFI_RECONCILE", layer: "decide", note: "cyber RFI reconcile" },
  // package #1 — mixed
  { flag: "AUDIT_SITEVISIT_MANDATORY_GROUNDED", layer: "decide", note: "site-visit grounded bar" },
  { flag: "AUDIT_SCOPE_OPACITY_RECONCILE", layer: "decide", note: "scope-opacity" },
  { flag: "AUDIT_DEADLINE_RESET_RENDER", layer: "render", note: "deadline reset render" },
  { flag: "AUDIT_NHR_HEADLINE_SHOWSTOPPER_FIRST", layer: "render", note: "NHR headline show-stopper-first" },
  { flag: "AUDIT_SETASIDE_BACKSTOP", layer: "decide", note: "set-aside backstop" },
  { flag: "AUDIT_BANNER_NO_UNRANKED_BAR_CLAIM", layer: "render", note: "banner no-unranked-bar" },
  { flag: "AUDIT_BANNER_BAR_RANKING", layer: "render", note: "banner bar ranking" },
  { flag: "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD", layer: "decide", note: "boilerplate bar-signal guard" },
  { flag: "AUDIT_BAR_SIGNAL_REGISTER_TOKENS", layer: "decide", note: "bar-signal register tokens" },
  { flag: "AUDIT_INCOMPLETE_PRECEDENCE", layer: "decide", note: "incomplete precedence" },
];

const ARMED = new Set(FLAGS.map((f) => f.flag)); // the instrumented set are the armed ones

async function main() {
  const id = process.argv[2] || "496a9a21-8391-41b4-9e24-cff212971fd3";
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await admin.from("audits").select("*").eq("id", id).single();
  if (!row) { console.error("row not found"); process.exit(1); }

  // Armed baseline = every instrumented flag ON.
  for (const f of ARMED) process.env[f] = "true";
  const baseline = renderV4ReportFromRow(row);

  console.log(`PER-FLAG BEHAVIOR TABLE · audit ${id}\n${"flag".padEnd(42)} layer    participated  evidence`);
  console.log("-".repeat(92));
  for (const { flag, layer, note } of FLAGS) {
    let participated = "—", evidence = note;
    if (layer === "render") {
      process.env[flag] = "false"; // toggle this one OFF against the armed baseline
      const off = renderV4ReportFromRow(row);
      process.env[flag] = "true";
      const delta = off.length - baseline.length;
      const changed = off !== baseline;
      participated = changed ? "YES" : "no";
      evidence = changed ? `${note} · Δ${delta >= 0 ? "+" : ""}${delta} chars vs armed` : `${note} · no render change on this record`;
    } else {
      participated = "n/a(decide)";
      evidence = `${note} · baked at engine time — read meta.flagEnv + coverageV2 in the run-record`;
    }
    console.log(`${flag.padEnd(42)} ${layer.padEnd(8)} ${participated.padEnd(13)} ${evidence}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
