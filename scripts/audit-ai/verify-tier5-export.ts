// Phase-6 check for the v5 two-item Export menu (Executive Brief / Gate Deck).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier5-export.ts
//
// Drives the FULL v5 report shell (renderV5ReportFromRow) on a real agentic-v3
// fixture row, in two states, and asserts the port-spec §5 Export control:
//   · committal pole  → dropdown with BOTH items, ?format=brief and ?format=deck,
//     menu markup + toggle JS present, NOT the disabled state.
//   · gated pole (honest_fail) → "Export unavailable", NO menu, NO ?format links —
//     the disabled state teaches the gate (no committal artifact on a no-verdict).
// Single-source gate = shouldGateExport (same predicate the PDF route 409 uses).
// Also writes openable shells for the in-browser menu screenshot.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderV5ReportFromRow } from "@/lib/v5-report/report";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

const raw = JSON.parse(readFileSync("scripts/audit-ai/fixtures/w50-compliance-v3-REAL.json", "utf8"));
const row = (comp: Record<string, unknown>) => ({
  id: "aud-w50-export", solicitation_number: "W50S9H26QA018",
  title: "Grounds Maintenance Services", agency: "Dept. of the Army",
  naics_code: "561730", set_aside: "SDVOSB Set-Aside", response_deadline: "2026-09-30T14:00:00-05:00",
  compliance_json: comp,
});

// Committal — grounded verdict over a complete doc set → export ON.
const committal = renderV5ReportFromRow(row({ ...raw, engine: "agentic_v3", honest_fail: false, documents_complete: true }));
// Gated — engine honest-failed → export DISABLED (teaches the gate).
const gated = renderV5ReportFromRow(row({ ...raw, engine: "agentic_v3", honest_fail: true }));

// ── committal → two-item menu ──
ok("P6 R1: committal → Executive Brief item links ?format=brief", /href="\/api\/audit\/[^"]*\/pdf\?format=brief"/.test(committal) && committal.includes("Executive Brief"));
ok("P6 R2: committal → Gate Deck item links ?format=deck", /href="\/api\/audit\/[^"]*\/pdf\?format=deck"/.test(committal) && committal.includes("Gate Deck"));
ok("P6 R3: committal → dropdown markup + toggle JS present, aria-haspopup menu", /id="exportMenu"/.test(committal) && /aria-haspopup="menu"/.test(committal) && committal.includes("exMenu.hasAttribute('hidden')"));
ok("P6 R4: committal → NOT the disabled 'Export unavailable' state", !/Export unavailable/.test(committal));
ok("P6 R5: committal → menu CSS scoped (REPORT_V5_CSS stays 1:1)", /\.export-menu\{position:absolute/.test(committal));

// ── gated → disabled, no menu, no export at all ──
ok("P6 R6: gated (honest_fail) → 'Export unavailable' disabled button", /id="exportBtn" disabled/.test(gated) && /Export unavailable/.test(gated));
ok("P6 R7: gated → NO dropdown menu and NO ?format links (nothing exportable)", !/id="exportMenu"/.test(gated) && !/\?format=/.test(gated));

// ── both are the SAME report body otherwise (gate is the only difference in chrome) ──
ok("P6 R8: both render the v5 shell (sidebar + report article)", /class="report"/.test(committal) && /class="report"/.test(gated));

// ── write openable shells for the in-browser menu screenshot ──
const OUT = "ceo/redesign-final/Review/V5-PORT-render-samples";
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/export-menu-committal.html`, committal);
writeFileSync(`${OUT}/export-menu-gated.html`, gated);

console.log(`\nTier5 Export menu (Phase 6): ${pass}/${pass + fails.length} PASS`);
console.log(`→ samples: ${OUT}/export-menu-committal.html (click Export ▾) · export-menu-gated.html (disabled)`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
