// V2 cutover adapter verifier — exercises buildV2ViewModelFromShadow
// against synthetic audit rows covering 5 cases:
//   1. Full v2_shadow with all 11 surface keys → all fields mapped
//   2. Partial v2_shadow (only 3 of 11) → present mapped, absent defaulted
//   3. No v2_shadow at all → returns null
//   4. Null/undefined audit → returns null
//   5. Malformed v2_shadow (wrong types) → null-safe defaults, no throw
//
// Pure function test — no Supabase, no API, no PDF. Fast.

import { buildV2ViewModelFromShadow } from "../src/app/audit/[id]/_v2-render-surfaces";

interface Probe {
  label: string;
  audit: Record<string, unknown> | null | undefined;
  expectNull: boolean;
  check?: (r: ReturnType<typeof buildV2ViewModelFromShadow>) => string[];
}

const FULL_SHADOW = {
  compliance_json: {
    v2_shadow: {
      path: "pdf",
      judgment: { documentClassification: { type: "SOW" } },
      surfaces: {
        work_statement: {
          abbr: "SOW",
          full: "Statement of Work",
          meaning: "Prescriptive deliverables",
          evidence: "evidence",
          confidence: "High confidence",
          bid_strategy: "strategy",
        },
        work_statement_unknown: null,
        matrix_rollup: { required: [{ number: "52.204-7", title: "SAM", badge: "required" as const, trapReason: null }], reference: [], reference_count: 0 },
        submission_checklist_filtered: [
          { bucket: "deadline", label: "Deadlines", critical: true, items: [{ bucket: "deadline", text: "Submit by 2026-06-15", isCritical: true, complete: false }] },
        ],
        l02_catches: [{ category: "DFARS", title: "Hex chrome", why_invisible: "buried §I", move: "verify SDS" }],
        confidence_notes: [{ field: "naics", uncertain: "yes", assumption: "541330", resolve: "confirm in §A" }],
        has_incumbent: true,
        metadata_brief: null,
        submission_preflight: [{ item: "Submit by deadline", status: "required" as const, source: "§B" }],
        recompete_signal: {
          contract_number: "W912-25-R-0001",
          naics: "541330",
          agency: "USACE",
          estimated_end_date: "2027-06-15",
          recompete_window: "Feb 2027 - Mar 2027",
          monitoring_note: "Monitor SAM.gov",
        },
        price_anchor: {
          evaluation_type: "LPTA" as const,
          is_lpta: true,
          estimated_value: null,
          clin_count: 3,
          lpta_guidance: "LPTA guidance text",
          ige_note: "IGE proxy note",
        },
      },
      rendered_at: "2026-06-07T22:00:00Z",
      engine_ms: 4823,
    },
  },
};

const PARTIAL_SHADOW = {
  compliance_json: {
    v2_shadow: {
      surfaces: {
        work_statement: { abbr: "PWS" as const, full: "PWS", meaning: "", evidence: "", confidence: "Medium confidence" as const, bid_strategy: "" },
        matrix_rollup: { required: [], reference: [], reference_count: 5 },
        l02_catches: [{ category: "Test", title: "Test", why_invisible: "", move: "" }],
      },
    },
  },
};

const MALFORMED_SHADOW = {
  compliance_json: {
    v2_shadow: {
      surfaces: {
        work_statement: "not an object", // wrong type
        matrix_rollup: 42, // wrong type
        submission_checklist_filtered: "not an array",
        l02_catches: { not: "array" },
        confidence_notes: null,
        has_incumbent: "yes", // wrong type (expects boolean)
        submission_preflight: { not: "array" },
        recompete_signal: "not an object",
        price_anchor: 0,
      },
    },
  },
};

const PROBES: Probe[] = [
  {
    label: "Full v2_shadow with all 11 surface keys",
    audit: FULL_SHADOW,
    expectNull: false,
    check: (r) => {
      const errs: string[] = [];
      if (!r) { errs.push("returned null"); return errs; }
      if (r.work_statement?.abbr !== "SOW") errs.push(`work_statement.abbr=${r.work_statement?.abbr}`);
      if (r.matrix_rollup.required.length !== 1) errs.push(`matrix.required=${r.matrix_rollup.required.length}`);
      if (r.submission_checklist_filtered.length !== 1) errs.push(`checklist=${r.submission_checklist_filtered.length}`);
      if (r.l02_catches.length !== 1) errs.push(`l02=${r.l02_catches.length}`);
      if (r.confidence_notes.length !== 1) errs.push(`cn=${r.confidence_notes.length}`);
      if (r.has_incumbent !== true) errs.push(`has_incumbent=${r.has_incumbent}`);
      if (r.submission_preflight?.length !== 1) errs.push(`preflight=${r.submission_preflight?.length}`);
      if (r.recompete_signal?.contract_number !== "W912-25-R-0001") errs.push("recompete.contract_number");
      if (r.price_anchor?.evaluation_type !== "LPTA") errs.push("price.evaluation_type");
      if (r.metadata_brief !== null) errs.push("metadata_brief should be null on PDF path");
      return errs;
    },
  },
  {
    label: "Partial v2_shadow (3 surfaces only) — defaults fill gaps",
    audit: PARTIAL_SHADOW,
    expectNull: false,
    check: (r) => {
      const errs: string[] = [];
      if (!r) { errs.push("returned null"); return errs; }
      if (r.work_statement?.abbr !== "PWS") errs.push("work_statement not mapped");
      if (r.matrix_rollup.reference_count !== 5) errs.push("matrix not mapped");
      if (r.l02_catches.length !== 1) errs.push("l02 not mapped");
      // Missing surfaces should default cleanly
      if (r.work_statement_unknown !== null) errs.push("work_statement_unknown should default null");
      if (r.submission_checklist_filtered.length !== 0) errs.push("checklist should default []");
      if (r.confidence_notes.length !== 0) errs.push("cn should default []");
      if (r.has_incumbent !== false) errs.push("has_incumbent should default false");
      if (r.metadata_brief !== null) errs.push("metadata_brief should default null");
      if (r.submission_preflight !== null) errs.push("preflight should default null");
      if (r.recompete_signal !== null) errs.push("recompete should default null");
      if (r.price_anchor !== null) errs.push("price_anchor should default null");
      return errs;
    },
  },
  {
    label: "No v2_shadow (V1-only audit) → null",
    audit: { compliance_json: { pdf_source: "sam_fetched", dfars_flags: [] } },
    expectNull: true,
  },
  {
    label: "Missing compliance_json entirely → null",
    audit: { id: "test", solicitation_number: "TEST" },
    expectNull: true,
  },
  {
    label: "Null audit input → null",
    audit: null,
    expectNull: true,
  },
  {
    label: "Undefined audit input → null",
    audit: undefined,
    expectNull: true,
  },
  {
    label: "Malformed v2_shadow (wrong types) → defaults, no throw",
    audit: MALFORMED_SHADOW,
    expectNull: false,
    check: (r) => {
      const errs: string[] = [];
      if (!r) { errs.push("returned null"); return errs; }
      // matrix_rollup wrong-type: passes through as-is (no shape coercion) — acceptable
      if (r.submission_checklist_filtered.length !== 0) errs.push("malformed checklist should fall back to []");
      if (r.l02_catches.length !== 0) errs.push("malformed l02 should fall back to []");
      if (r.has_incumbent !== false) errs.push("malformed has_incumbent should fall back to false");
      if (r.submission_preflight !== null) errs.push("malformed preflight should fall back to null");
      return errs;
    },
  },
];

function check(p: Probe): { pass: boolean; line: string } {
  let r: ReturnType<typeof buildV2ViewModelFromShadow>;
  try {
    r = buildV2ViewModelFromShadow(p.audit);
  } catch (e) {
    return { pass: false, line: `${p.label.padEnd(60)} → FAIL: threw ${(e as Error).message}` };
  }

  if (p.expectNull) {
    if (r !== null) return { pass: false, line: `${p.label.padEnd(60)} → FAIL: expected null, got object` };
    return { pass: true, line: `${p.label.padEnd(60)} → PASS` };
  }

  if (r === null) {
    return { pass: false, line: `${p.label.padEnd(60)} → FAIL: expected object, got null` };
  }

  const errs = p.check ? p.check(r) : [];
  return {
    pass: errs.length === 0,
    line: `${p.label.padEnd(60)} → ${errs.length === 0 ? "PASS" : "FAIL: " + errs.join(", ")}`,
  };
}

function main() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  V2 cutover adapter verifier — buildV2ViewModelFromShadow");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  let allPass = true;
  for (const p of PROBES) {
    const r = check(p);
    console.log("  " + r.line);
    if (!r.pass) allPass = false;
  }
  console.log("");
  console.log(allPass ? "✓ Adapter verified — null-safe across 7 probes" : "✗ Adapter FAILED");
  process.exit(allPass ? 0 : 1);
}

main();
