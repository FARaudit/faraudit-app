// V2 render-smoke verifier — feeds a full synthetic v2_shadow through the
// REAL _template.html via buildV2ViewModelFromShadow → renderV2Surfaces,
// then asserts each of the 9 surface markers appears in the output HTML.
//
// Halt on first missing surface. Catches:
//   - missing data-field anchors in template
//   - renderer skipping a surface
//   - regex/replace bug producing stale placeholder text
//   - V2RenderInput field shape drift
//
// Pure function test. No DB, no API. ~10ms.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  renderV2Surfaces,
  buildV2ViewModelFromShadow,
} from "../src/app/audit/[id]/_v2-render-surfaces";

const TEMPLATE_PATH = path.join(process.cwd(), "src/app/audit/[id]/_template.html");

// Synthetic v2_shadow — every surface populated with distinctive content
// the verifier can grep for in the output.
const SYNTHETIC_AUDIT = {
  compliance_json: {
    v2_shadow: {
      path: "pdf",
      surfaces: {
        work_statement: {
          abbr: "PWS",
          full: "Performance Work Statement",
          meaning: "Outcome-based — propose to standards",
          evidence: "EVIDENCE_MARKER_WS",
          confidence: "High confidence",
          bid_strategy: "STRATEGY_MARKER_WS",
        },
        work_statement_unknown: null,
        matrix_rollup: {
          required: [
            { number: "52.204-7", title: "MARKER_CLAUSE_TITLE", badge: "required", trapReason: null },
          ],
          reference: [],
          reference_count: 7,
        },
        submission_checklist_filtered: [
          {
            bucket: "deadline",
            label: "MARKER_CHECKLIST_LABEL",
            critical: true,
            items: [
              { bucket: "deadline", text: "MARKER_CHECKLIST_ITEM", isCritical: true, complete: false },
            ],
          },
        ],
        l02_catches: [
          {
            category: "MARKER_L02_CAT",
            title: "MARKER_L02_TITLE",
            why_invisible: "MARKER_L02_WHY",
            move: "MARKER_L02_MOVE",
          },
        ],
        confidence_notes: [
          {
            field: "MARKER_CN_FIELD",
            uncertain: "MARKER_CN_UNCERTAIN",
            assumption: "MARKER_CN_ASSUME",
            resolve: "MARKER_CN_RESOLVE",
          },
        ],
        has_incumbent: false,
        metadata_brief: {
          eligibility: { set_aside_type: "SB", naics: "541330", notes: "MARKER_MB_NOTES" },
          synopsis_summary: "MARKER_MB_SUMMARY",
          missing_intel: ["MARKER_MB_MISSING_1", "MARKER_MB_MISSING_2"],
          co_contact: { name: "MARKER_MB_CO_NAME", email: "marker.mb.co@example.gov" },
          deadline: { iso: "2026-07-15", formatted: "Jul 15, 2026", days_remaining: 38 },
        },
        submission_preflight: [
          { item: "MARKER_SP_ITEM_REQUIRED", status: "required", source: "FAR 52.204-7" },
          { item: "MARKER_SP_ITEM_CONDITIONAL", status: "conditional", source: "§L", detail: "MARKER_SP_DETAIL" },
        ],
        recompete_signal: {
          contract_number: "MARKER_RS_PIID",
          naics: "541330",
          agency: "MARKER_RS_AGENCY",
          estimated_end_date: "2027-06-15",
          recompete_window: "MARKER_RS_WINDOW",
          monitoring_note: "MARKER_RS_NOTE",
        },
        price_anchor: {
          evaluation_type: "LPTA",
          is_lpta: true,
          estimated_value: null,
          clin_count: 5,
          lpta_guidance: "MARKER_PA_GUIDANCE",
          ige_note: "MARKER_PA_IGE",
        },
      },
    },
  },
};

interface SurfaceCheck {
  surface: string;
  markers: string[]; // all must appear in output
}

const CHECKS: SurfaceCheck[] = [
  { surface: "work_statement", markers: ["EVIDENCE_MARKER_WS", "STRATEGY_MARKER_WS"] },
  { surface: "matrix_rollup", markers: ["MARKER_CLAUSE_TITLE", "52.204-7"] },
  { surface: "submission_checklist_filtered", markers: ["MARKER_CHECKLIST_LABEL", "MARKER_CHECKLIST_ITEM"] },
  { surface: "l02_catches", markers: ["MARKER_L02_CAT", "MARKER_L02_TITLE", "MARKER_L02_WHY", "MARKER_L02_MOVE"] },
  { surface: "confidence_notes", markers: ["MARKER_CN_FIELD", "MARKER_CN_UNCERTAIN", "MARKER_CN_ASSUME", "MARKER_CN_RESOLVE"] },
  { surface: "metadata_brief", markers: ["MARKER_MB_SUMMARY", "MARKER_MB_NOTES", "marker.mb.co@example.gov", "MARKER_MB_MISSING_1", "Jul 15, 2026"] },
  { surface: "submission_preflight", markers: ["MARKER_SP_ITEM_REQUIRED", "MARKER_SP_ITEM_CONDITIONAL", "MARKER_SP_DETAIL"] },
  { surface: "recompete_signal", markers: ["MARKER_RS_PIID", "MARKER_RS_AGENCY", "MARKER_RS_WINDOW", "MARKER_RS_NOTE"] },
  { surface: "price_anchor", markers: ["LPTA", "MARKER_PA_GUIDANCE", "MARKER_PA_IGE"] },
];

function main() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  V2 render-smoke — all 9 surfaces via real template + adapter");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`FATAL: template not found at ${TEMPLATE_PATH}`);
    process.exit(1);
  }
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  console.log(`  loaded template (${(template.length / 1024).toFixed(0)} KB)`);

  const vmInput = buildV2ViewModelFromShadow(SYNTHETIC_AUDIT);
  if (!vmInput) {
    console.error("FATAL: adapter returned null on synthetic audit");
    process.exit(1);
  }
  console.log(`  adapter built V2RenderInput (11 keys)`);

  const t0 = Date.now();
  const html = renderV2Surfaces(template, vmInput);
  const ms = Date.now() - t0;
  console.log(`  rendered in ${ms}ms (${(html.length / 1024).toFixed(0)} KB out)`);
  console.log("");

  let allPass = true;
  for (const c of CHECKS) {
    const missing = c.markers.filter((m) => !html.includes(m));
    if (missing.length === 0) {
      console.log(`  ✓ ${c.surface.padEnd(32)} ${c.markers.length}/${c.markers.length} markers found`);
    } else {
      console.log(`  ✗ ${c.surface.padEnd(32)} MISSING: ${missing.join(", ")}`);
      allPass = false;
      // CEO spec: halt on first missing surface
      break;
    }
  }

  console.log("");
  if (allPass) {
    console.log("✓ All 9 surfaces rendered — V2 overlay path is operational");
    process.exit(0);
  } else {
    console.log("✗ Render-smoke FAILED — see missing markers above");
    process.exit(1);
  }
}

main();
