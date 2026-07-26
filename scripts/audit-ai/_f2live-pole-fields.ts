// F2-LIVE recon — what do the list surface's verdict fields ACTUALLY contain across real rows?
// The row JS reads a.exec_verdict; the authoritative pole is v3_verdict (compliance_json->v3->>verdict),
// which fetchRecentAudits already selects. Before mapping anything, measure both.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data, error } = await admin
    .from("audits")
    .select("id, solicitation_number, recommendation, compliance_score, v3_verdict:compliance_json->v3->>verdict, exec_verdict:compliance_json->executive_summary->>verdict")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Record<string, unknown>[];

  const tally = (k: string) => {
    const m = new Map<string, number>();
    for (const r of rows) { const v = String(r[k] ?? "∅"); m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  console.log(`rows: ${rows.length}\n`);
  for (const k of ["v3_verdict", "exec_verdict", "recommendation"]) {
    console.log(`── ${k} ──`);
    for (const [v, n] of tally(k)) console.log(`   ${String(n).padStart(4)}  ${v}`);
    console.log();
  }

  // The live question: for rows whose AUTHORITATIVE pole is one of the three unmapped ones,
  // what does the list's current logic actually paint?
  const UNMAPPED = new Set(["NEEDS_HUMAN_REVIEW", "INCOMPLETE", "INELIGIBLE"]);
  const victims = rows.filter((r) => UNMAPPED.has(String(r.v3_verdict ?? "")));
  console.log(`── rows whose true pole is unmapped by the list: ${victims.length} of ${rows.length} ──`);
  for (const r of victims.slice(0, 12)) {
    const ev = String(r.exec_verdict ?? "∅").toUpperCase().replace(/[\s_]+/g, "-");
    // replicate verdictOf() exactly
    let painted: string;
    if (ev === "NO-BID" || ev === "NOBID") painted = "NO-BID";
    else if (ev === "CAUTION") painted = "CAUTION";
    else if (ev === "PROCEED" || ev === "GO" || ev === "BID") painted = "PROCEED";
    else {
      const rec = String(r.recommendation ?? "").toUpperCase();
      if (rec === "DECLINE") painted = "NO-BID";
      else if (rec === "PROCEED") painted = "PROCEED";
      else if (rec.includes("CAUTION")) painted = "CAUTION";
      else {
        const s = typeof r.compliance_score === "number" ? r.compliance_score : null;
        painted = s != null ? (s >= 70 ? "PROCEED" : s < 40 ? "NO-BID" : "CAUTION") : "CAUTION";
      }
    }
    const wrong = painted !== "NO-BID" || r.v3_verdict !== "INELIGIBLE";
    console.log(`   ${String(r.solicitation_number ?? r.id).padEnd(22)} true=${String(r.v3_verdict).padEnd(20)} painted=${painted.padEnd(8)} ${wrong ? "◀ MISREPRESENTED" : ""}`);
  }
})();
