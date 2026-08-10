// ARC #747 · E2 — VERIFICATION AT THE CUSTOMER SURFACE ($0, read-only, no model call, no flag armed).
//
// Not a unit test. This drives the SAME render the customer's browser gets — `renderV5ReportFromRow` for an
// agentic_v3 row, the production path — against the real stored record d0664ba2 (SPRRA2-26-R-0034), twice:
// once with the row exactly as served today, once with the E2 gate applied to the two persisted arrays the
// executor actually writes (`v3.findings` and `v3.showStoppers`, audit-executor-v3.ts:668).
//
// Fidelity per [[reference_offline_render_verification_fidelity]]: select("*") so raw_pdf_text is real ·
// live Vercel PRODUCTION AUDIT_* pulled fresh · env set BEFORE the render module is imported, so no
// module-level flag can freeze false.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import * as dotenv from "dotenv";
import { applyReadableProductionEnv, type RawVercelEnv } from "./vercel-env-state";
dotenv.config({ path: ".env.local", quiet: true });

const PREFIX = process.argv[2] ?? "d0664ba2";
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

const toText = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<\/(p|div|li|tr|h[1-6]|section)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(+d))
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data, error } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  if (error) { console.error(error.message); process.exit(1); }
  const row = ((data ?? []) as Record<string, any>[]).find((r) => String(r.id).startsWith(PREFIX));
  if (!row) { console.error(`no audit row matching ${PREFIX}`); process.exit(1); }

  const src: string = row.raw_pdf_text ?? "";
  const cj = row.compliance_json ?? {};
  console.log(`=== ROW === ${row.id}  sol=${row.solicitation_number}  engine=${cj.engine}  raw_pdf_text=${src.length}B`);
  console.log(`v3.findings=${cj.v3?.findings?.length ?? 0}  v3.showStoppers=${cj.v3?.showStoppers?.length ?? 0}`);

  // ── production config, pulled live ──
  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.error("VERCEL_TOKEN missing — cannot pull production config; refusing to render against a guessed config"); process.exit(1); }
  const j: any = await (await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const { applied, unreadable } = applyReadableProductionEnv((j.envs || j.env || []) as RawVercelEnv[]);
  process.env.AUDIT_REPORT_V5 = "true"; process.env.AUDIT_V5_SEAL = "true";   // prod serves v5 by execution
  console.log(`=== PROD CONFIG === readable AUDIT_* applied: ${applied.length}`);
  // This script drives "the SAME render the customer's browser gets". Any flag named here is OFF in that render and
  // may be ON for the customer, so it is stated rather than dropped.
  if (unreadable.length) console.log(`⚠ ${unreadable.length} AUDIT_* production var(s) NOT readable → OFF here, possibly ON in production: ${unreadable.join(", ")}`);

  const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
  const { gateFindingCitations } = await import("../../src/lib/audit-citation-fidelity");

  // ── A: exactly as served today ──
  const htmlBefore = renderV5ReportFromRow(row as never);
  const textBefore = toText(htmlBefore);

  // ── B: the row as the executor would persist it with the gate ON ──
  // SOURCE SHAPE — production gates against `ctx.groundingSource ?? ctx.fullSource`, and `raw_pdf_text` is
  // persisted as fullSource, which on a chunked-ingest run is the COMPRESSED digest. Presence only ever
  // exonerates in this gate, so a smaller text can only make it withhold MORE — the proof was running on a
  // strictly more aggressive input than production and its byte-identity/no-op claims were not measured on
  // the production shape. Stated rather than silently accepted: this record is a single-doc, non-chunked
  // ingest, so here fullSource IS the whole binding text and the two coincide. On a chunked record they do
  // not, and this harness cannot see groundingSource because it is not persisted. (Review finding #6 on
  // PR #294.)
  const chunked = !!cj.source_truncated || (cj.read_modes && JSON.stringify(cj.read_modes).includes("chunk"));
  console.log(`source shape: raw_pdf_text=${src.length}B · chunked/truncated=${!!chunked} · ` +
    (chunked ? "⚠ groundingSource would differ in production — this proof is NOT production-shaped for this row"
             : "fullSource == groundingSource for this row, so the gate sees what production sees"));

  const gFind = gateFindingCitations(cj.v3?.findings ?? [], src, { enabled: true });
  const gStop = gateFindingCitations(cj.v3?.showStoppers ?? [], src, { enabled: true });
  const rowAfter = { ...row, compliance_json: { ...cj, v3: { ...cj.v3, findings: gFind.findings, showStoppers: gStop.findings } } };
  const htmlAfter = renderV5ReportFromRow(rowAfter as never);
  const textAfter = toText(htmlAfter);

  console.log(`\n=== GATE === withheld ${gFind.withheld.length + gStop.withheld.length} across ${gFind.touched} finding(s) + ${gStop.touched} show-stopper(s)`);
  for (const w of [...gFind.withheld, ...gStop.withheld]) console.log(`   ${w.raw}  [${w.field}]  ${w.reason}`);

  writeFileSync(`/tmp/e2-${PREFIX}-BEFORE.html`, htmlBefore); writeFileSync(`/tmp/e2-${PREFIX}-AFTER.html`, htmlAfter);
  writeFileSync(`/tmp/e2-${PREFIX}-BEFORE.txt`, textBefore); writeFileSync(`/tmp/e2-${PREFIX}-AFTER.txt`, textAfter);

  // ── OBSERVATIONS ON THE RENDERED SURFACE ──
  const say = (label: string, ok: boolean, detail = "") => console.log(`${ok ? "✅" : "❌"} ${label}${detail ? `  ${detail}` : ""}`);
  console.log("\n=== RENDERED SURFACE ===");
  say("BEFORE: the served report prints the fabricated citation", textBefore.includes("DFARS 215-2"));
  say("AFTER: it does not", !textAfter.includes("DFARS 215-2"));
  say("AFTER: the reader is told a citation was withheld", textAfter.includes("citation withheld"));
  say("AFTER: the obligation itself survives", textAfter.includes("Cost/Price Supporting Documentation"));
  say("AFTER: the parenthetical survives", textAfter.includes("Instructions for Submitting Cost/Price Proposals"));
  const trueCites = ["252.215-7009", "52.215-22", "15.408", "9.5"];
  for (const c of trueCites) {
    if (textBefore.includes(c)) say(`AFTER: true citation ${c} still rendered`, textAfter.includes(c));
  }
  say("AFTER: no OTHER text moved than the withheld spans", (() => {
    // Strip the withheld markers from AFTER and re-insert the original token; the rest must be identical.
    let probe = textAfter;
    for (const w of [...gFind.withheld, ...gStop.withheld]) probe = probe.replace(/\[citation withheld[^\]]*\]/, w.raw);
    return probe === textBefore;
  })(), "(markers reversed → byte-identical to BEFORE)");

  const ctx = (hay: string, needle: string) => { const i = hay.indexOf(needle); return i < 0 ? "(absent)" : hay.slice(Math.max(0, i - 170), i + 210).replace(/\s+/g, " "); };
  console.log(`\n--- BEFORE, as the customer reads it ---\n…${ctx(textBefore, "DFARS 215-2")}…`);
  console.log(`\n--- AFTER, as the customer reads it ---\n…${ctx(textAfter, "citation withheld")}…`);
  console.log(`\nartifacts: /tmp/e2-${PREFIX}-{BEFORE,AFTER}.{html,txt}`);
})();
