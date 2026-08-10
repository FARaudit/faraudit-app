// FA-145 — READ what the SERVED report actually says on a CLOSED solicitation, instead of grepping for phrases
// I guessed it would use. The first pass returned 0 hits for a hand-written phrase list, which is exactly the
// shape of a false clean: a list tuned to my expectations cannot find wording I did not anticipate.
//
// So this one (a) prints the live production renderer choice, (b) PLANTS a known positive to prove the matcher
// works at all, and (c) dumps the actual visible text of the decision-bearing sections so the wording can be
// judged rather than pattern-matched.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { classifyEnv, equals, describe, applyReadableProductionEnv, type RawVercelEnv } from "./vercel-env-state";
dotenv.config({ path: ".env.local", quiet: true });

const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

const visibleText = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

// Imperative, present-tense asks — the thing that must not appear once a solicitation has closed.
const IMPERATIVE = /\b(before quoting|before submission|before you bid|before bidding|prior to submission|submit by|days? (?:remain|left)|request clarification|file clarifications?|ask the (?:KO|contracting officer))\b/gi;

(async () => {
  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.error("VERCEL_TOKEN missing — refusing to guess the served renderer."); process.exit(1); }
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json() as { envs?: RawVercelEnv[] };
  const envs = j.envs ?? [];
  const { applied, unreadable } = applyReadableProductionEnv(envs);

  // THREE states, never two. The old form was `if (e.type !== "plain") continue`, which sent an encrypted variable
  // down the same path as one that does not exist and then printed "(unset) → served renderer = v4" for both — a
  // guess, stated as a fact about production. AUDIT_V5_SEAL and AUDIT_V3_SECTION_ROUTING are both encrypted on this
  // project, so the shape is live, not hypothetical.
  const v5 = classifyEnv(envs, "AUDIT_REPORT_V5");
  const isTrue = equals(v5, "true");            // null = unknowable. Do not collapse it to false.
  console.log(`\n█ LIVE PRODUCTION · ${describe(v5)}`);
  console.log(`  AUDIT_* production vars: ${applied.length} readable and applied${unreadable.length ? ` · ${unreadable.length} NOT readable → ${unreadable.join(", ")}` : ""}`);
  if (isTrue === null) {
    // Refuse to name a renderer. Every reading below is labelled "the served surface", and that label would be
    // unfounded — so nothing is printed rather than something unprovable.
    console.log(`  → served renderer: CANNOT BE DETERMINED from the env API. Not guessing v4.`);
    console.log(`    Resolve it by execution instead (render a real audit through the deployed route and read what came back), or re-add the flag as plain.\n`);
    process.exit(1);
  }
  const renderer = isTrue ? "V5 (src/lib/v5-report)" : "v4 (_render.ts), by the code default at src/app/audits/[id]/route.ts:422";
  console.log(`  → value === "true": ${isTrue} → served renderer = ${renderer}`);
  // The samples below all come from renderV5ReportFromRow. If production is on v4 they are not the served copy, and
  // the readings must not be reported as such.
  if (!isTrue) console.log(`  ⚠ the renders below are V5 — production serves v4, so they are NOT the served copy`);
  console.log("");

  // PLANTED POSITIVE — prove the matcher can fire before trusting any zero from it.
  const planted = "<p>Cure what you can and verify the others before quoting.</p>";
  const plantedHits = (visibleText(planted).match(IMPERATIVE) ?? []).length;
  console.log(`planted-positive check: ${plantedHits > 0 ? "✓ matcher fires" : "✗ MATCHER IS INERT — no number below is reportable"}`);
  if (plantedHits === 0) process.exit(1);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
  const { data } = await sb.from("audits").select("*").order("created_at", { ascending: false }).limit(60);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const now = Date.now();
  const closed = rows.filter((r) => { const d = Date.parse(String(r.response_deadline ?? "")); return Number.isFinite(d) && d < now && r.compliance_json; });
  const open = rows.filter((r) => { const d = Date.parse(String(r.response_deadline ?? "")); return Number.isFinite(d) && d >= now && r.compliance_json; });
  console.log(`corpus: ${closed.length} CLOSED · ${open.length} still open\n`);

  const { renderV5ReportFromRow } = await import("../../src/lib/v5-report/report");
  const sample = (label: string, row: Record<string, unknown>) => {
    let html = ""; try { html = renderV5ReportFromRow(row as never) as unknown as string; } catch (e) { console.log(`${label}: render threw ${e instanceof Error ? e.message : e}`); return; }
    const text = visibleText(html);
    const hits = [...new Set((text.match(IMPERATIVE) ?? []).map((s) => s.toLowerCase()))];
    console.log(`── ${label} · ${String(row.solicitation_number ?? row.id).slice(0, 22)} · deadline ${String(row.response_deadline).slice(0, 10)}`);
    console.log(`   imperative asks found: ${hits.length ? hits.join(" · ") : "(none)"}`);
    console.log(`   first 420 chars of visible report text:`);
    console.log(`   "${text.slice(0, 420)}"`);
    console.log("");
  };

  if (closed[0]) sample("CLOSED", closed[0]);
  if (closed[1]) sample("CLOSED", closed[1]);
  if (open[0]) sample("OPEN (control — imperatives are CORRECT here)", open[0]);
  if (!open.length) console.log("(no still-open audit in the sample, so no control render — the closed readings stand alone)\n");
})();
