// ARC #747 · E2 — ADVERSARIAL PROBES at the served surface ($0, read-only).
// The happy path is proven (_e2-verify-served-render.ts). These are the ways it could be wrong anyway.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  const rows = ((data ?? []) as Record<string, any>[]).filter((r) => (r.raw_pdf_text ?? "").length > 0 &&
    ([...(r.compliance_json?.findings ?? []), ...(r.compliance_json?.v3?.findings ?? [])].length > 0));

  const token = process.env.VERCEL_TOKEN!;
  const j: any = await (await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  for (const e of j.envs || j.env || []) {
    if (typeof e.key === "string" && e.key.startsWith("AUDIT_") && e.type === "plain" && Array.isArray(e.target) && e.target.includes("production") && typeof e.value === "string") process.env[e.key] = e.value;
  }
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";

  const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
  const { gateFindingCitations } = await import("../../src/lib/audit-citation-fidelity");
  const say = (label: string, ok: boolean, detail = "") => console.log(`${ok ? "✅" : "❌"} ${label}${detail ? `  — ${detail}` : ""}`);

  console.log(`=== PROBE 1 — flag ON must be a NO-OP on every record it has no finding against (${rows.length} live audits) ===`);
  console.log("   The false-positive risk is the whole risk: this gate deletes customer-facing text.");
  let allClean = true;
  for (const row of rows) {
    const cj = row.compliance_json ?? {}, src = row.raw_pdf_text ?? "";
    const f = [...(cj.findings ?? []), ...(cj.v3?.findings ?? [])];
    const g = gateFindingCitations(f, src, { enabled: true });
    const s = gateFindingCitations(cj.v3?.showStoppers ?? [], src, { enabled: true });
    const n = g.withheld.length + s.withheld.length;
    if (n === 0) {
      // Prove the render is untouched, not merely that the gate reported nothing.
      const after = { ...row, compliance_json: { ...cj, ...(cj.v3 ? { v3: { ...cj.v3, findings: cj.v3.findings ? g.findings.slice(-cj.v3.findings.length) : cj.v3.findings, showStoppers: s.findings } } : {}) } };
      const same = renderV5ReportFromRow(row as never) === renderV5ReportFromRow(after as never);
      say(`   ${String(row.id).slice(0, 8)} ${row.solicitation_number} — 0 withheld, render byte-identical`, same);
      if (!same) allClean = false;
    } else {
      console.log(`   🔎 ${String(row.id).slice(0, 8)} ${row.solicitation_number} — ${n} withheld: ${[...g.withheld, ...s.withheld].map((w) => w.raw).join(", ")}`);
    }
  }
  say("PROBE 1", allClean, "flag-ON changes nothing on records with no finding against them");

  console.log(`\n=== PROBE 2 — the marker must not break markup ===`);
  console.log('   The withheld marker embeds double quotes: [citation withheld — "215-2" …]. If the renderer');
  console.log("   interpolates it unescaped, a citation string becomes an attribute-injection surface.");
  const d = rows.find((r) => String(r.id).startsWith("d0664ba2"))!;
  const cjd = d.compliance_json, srcd = d.raw_pdf_text ?? "";
  const gd = gateFindingCitations(cjd.v3.findings, srcd, { enabled: true });
  const after = { ...d, compliance_json: { ...cjd, v3: { ...cjd.v3, findings: gd.findings } } };
  const html = renderV5ReportFromRow(after as never);
  say("   raw unescaped `\"215-2\"` never appears in the HTML", !html.includes('"215-2"'));
  say("   it appears HTML-escaped instead", html.includes("&quot;215-2&quot;") || html.includes("&#34;215-2&#34;") || html.includes("&#39;215-2&#39;"));
  const openTags = (html.match(/<[a-zA-Z]/g) ?? []).length, closeTags = (html.match(/<\/[a-zA-Z]/g) ?? []).length;
  console.log(`   tag balance before/after: ${(renderV5ReportFromRow(d as never).match(/<[a-zA-Z]/g) ?? []).length}/${(renderV5ReportFromRow(d as never).match(/<\/[a-zA-Z]/g) ?? []).length} → ${openTags}/${closeTags}`);

  console.log(`\n=== PROBE 3 — idempotence at the RENDER, not just in the unit ===`);
  const twice = gateFindingCitations(gd.findings, srcd, { enabled: true });
  say("   a second gate pass withholds nothing further", twice.withheld.length === 0);
  say("   and renders byte-identically", renderV5ReportFromRow({ ...d, compliance_json: { ...cjd, v3: { ...cjd.v3, findings: twice.findings } } } as never) === html);

  console.log(`\n=== PROBE 4 — an EMPTY source must not turn every citation into a fabrication ===`);
  console.log("   A truncated/failed ingest yields src=''. Fail-closed on grammar is fine; fail-closed on");
  console.log("   presence would blank the report. Grammar-valid cites must survive an empty source.");
  const emptySrc = gateFindingCitations(cjd.v3.findings, "", { enabled: true });
  say("   only the grammar-invalid token is withheld, not the valid ones", emptySrc.withheld.length === 1 && emptySrc.withheld[0].number === "215-2");

  console.log(`\n=== PROBE 5 — a citation that is ONLY the bad token must not render an empty cell ===`);
  const only = gateFindingCitations([{ citation: "DFARS 215-2", requirement: "x" }], srcd, { enabled: true });
  say("   the citation field is non-empty after withholding", (only.findings[0].citation ?? "").trim().length > 0, JSON.stringify(only.findings[0].citation));
})();
