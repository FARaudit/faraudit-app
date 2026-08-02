// $0 PRE-SCREEN for the live-run target W50S6U26QA019 (#467 checklist items 5 + 6).
//
// Item 5 — $0 pre-screen: resolve the notice from LIVE SAM and read what the engine would actually ingest,
// before any paid call. Item 6 — census vs doc listing: the count SAM publishes must match the count we can
// enumerate, so a silently-dropped attachment is caught BEFORE the spend rather than showing up as a coverage
// gap in the report.
//
// Also predicts the two cost-relevant behaviours for THIS package:
//   • stages 0a/0b (paid claude-opus-5 OCR vision) fire only on documents with no machine-readable text
//   • the binding-doc analysis floor (#388, armed) names any BINDING doc no grounded finding analyzed —
//     amendments are the specimens, and this notice carries 5
//
// Reads only. Fires nothing. G2: Code never fires a paid run.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_prescreen-w50s6u26qa019.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { fetchSolicitationByNoticeId, fetchLiveSamStatus, classifyDocType } from "../../src/lib/sam";
import { isBindingDoc } from "../../src/lib/sam-attachments";

const NOTICE = "1e3e02dbe95e4561a522d902824060d5";
const SOL = "W50S6U26QA019";

(async () => {
  console.log(`\nPRE-SCREEN — ${SOL} (notice ${NOTICE.slice(0, 12)}…)\n`);

  const live = await fetchLiveSamStatus(NOTICE, SOL);
  const dl = live.responseDeadline ? new Date(live.responseDeadline) : null;
  const hrs = dl ? Math.round((dl.getTime() - Date.now()) / 3_600_000) : null;
  console.log(`[SAM live]`);
  console.log(`  active=${live.active} · deadline=${live.responseDeadline ?? "(none)"}${hrs !== null ? ` (${hrs}h away)` : ""} · amendments=${live.amendmentCount ?? "?"}`);
  console.log(`  BIDDABLE: ${live.active === true && (hrs ?? 0) > 0 ? "YES" : "NO"}`);

  const sol = await fetchSolicitationByNoticeId(NOTICE);
  if (!sol) { console.log(`\n  notice NOT RESOLVABLE — cannot pre-screen; do not fire\n`); process.exit(1); }

  const s = sol as unknown as Record<string, any>;
  console.log(`\n[notice]`);
  console.log(`  title       ${String(s.title ?? "").slice(0, 70)}`);
  console.log(`  agency      ${String(s.fullParentPathName ?? s.department ?? "-").slice(0, 70)}`);
  console.log(`  naics       ${s.naicsCode ?? s.naics ?? "-"} · set-aside ${s.typeOfSetAside ?? "-"} · type ${s.type ?? "-"}`);
  console.log(`  desc chars  ${String(s.description ?? "").length}`);

  // Item 6 — census vs doc listing. Enumerate what SAM publishes as attachments.
  const links: string[] = [];
  for (const k of ["resourceLinks", "additionalInfoLink", "links"]) {
    const v = s[k];
    if (Array.isArray(v)) for (const x of v) links.push(typeof x === "string" ? x : (x?.href ?? x?.url ?? JSON.stringify(x).slice(0, 80)));
    else if (typeof v === "string" && v) links.push(v);
  }
  console.log(`\n[doc listing — item 6 census]`);
  console.log(`  resourceLinks published: ${links.length}`);
  for (const l of links.slice(0, 25)) {
    const name = decodeURIComponent(String(l).split("/").pop() ?? l).slice(0, 62);
    const binding = isBindingDoc({ role: "attachment", name });
    console.log(`    ${binding ? "BINDING    " : "non-binding"} ${classifyDocType(name).padEnd(14)} ${name}`);
  }
  if (links.length > 25) console.log(`    … ${links.length - 25} more`);

  console.log(`\n[cost prediction]`);
  console.log(`  Stages 0a/0b (paid claude-opus-5 OCR vision) fire ONLY on docs with no machine-readable text.`);
  console.log(`  SAM's listing does not expose text-layer status, so this cannot be known until ingest —`);
  console.log(`  it is a RANGE, not a number: baseline ≈$1.25–1.50, higher if any attachment is scanned.`);
  console.log(`\n[floor relevance]`);
  console.log(`  ${live.amendmentCount ?? "?"} amendment(s). The binding-doc analysis floor (#388, ARMED) names any BINDING`);
  console.log(`  document no grounded finding analyzed. Amendments state changes in the INDICATIVE, which is`);
  console.log(`  exactly what obligationsOf cannot see — so this package is the intended test.`);
  console.log(`\n[known engine limit for THIS package]`);
  console.log(`  AUDIT_TEMPORAL_VERDICT is OFF — the engine has NO CLOCK. With ${live.amendmentCount ?? "?"} amendments`);
  console.log(`  stacking deadline changes, it cannot do date arithmetic on which deadline is operative.`);
  console.log(`  Expect the report to NAME deadlines, not to reason about which one is current.\n`);
  process.exit(0);
})();
