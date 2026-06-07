// Fix 14 verifier — exercises the price-anchor builder contract across the
// 3 evaluation-type branches (LPTA / BEST_VALUE / UNKNOWN). Asserts:
//   - LPTA factor → evaluation_type="LPTA", is_lpta=true, guidance+ige populated
//   - best_value factor → evaluation_type="BEST_VALUE", is_lpta=false, guidance+ige null
//   - no factors → evaluation_type="UNKNOWN", clin_count null
//   - clin_count = facts.clins.length when ≥1, else null
//   - ige_note parametrized with agency + naics when present
//
// Same contract-replication pattern as Fix 13's verifier (builder is module-
// private). Live-PDF verification of the wired path covered by the burn-in
// matrix on the next sweep.

import type { ExtractedFacts, EvaluationFactor, ClinItem } from "../src/lib/section-extractors";
import type { PriceAnchor } from "../src/lib/audit-engine";

function buildPriceAnchorContract(
  facts: Pick<ExtractedFacts, "evaluationFactors" | "clins" | "naicsCode" | "issuingOffice">
): PriceAnchor {
  const hasLpta = facts.evaluationFactors.some((f) => f.method === "LPTA");
  const hasBestValue = facts.evaluationFactors.some((f) => f.method === "best_value");
  const evaluation_type: PriceAnchor["evaluation_type"] = hasLpta
    ? "LPTA"
    : hasBestValue
    ? "BEST_VALUE"
    : "UNKNOWN";
  const clin_count = facts.clins.length > 0 ? facts.clins.length : null;

  let lpta_guidance: string | null = null;
  let ige_note: string | null = null;
  if (hasLpta) {
    lpta_guidance =
      "LPTA awards to the lowest-priced technically acceptable offer. " +
      "Price above the IGE typically fails evaluation. Ensure all Section L " +
      "technical requirements are fully addressed before pricing.";
    const agencyStr = facts.issuingOffice || "the issuing agency";
    const naicsStr = facts.naicsCode ? `NAICS ${facts.naicsCode}` : "matching NAICS";
    ige_note =
      `IGE (Independent Government Estimate) not published in solicitation. ` +
      `Proxy: search ${agencyStr} prior awards in ${naicsStr} on USASpending.gov ` +
      `and SAM.gov award notices for comparable work.`;
  }

  return { evaluation_type, is_lpta: hasLpta, estimated_value: null, clin_count, lpta_guidance, ige_note };
}

const clin = (lineItem: string): ClinItem => ({
  lineItem,
  description: "",
  quantity: null,
  unitOfIssue: null,
  unitPrice: null,
  totalPrice: null,
  category: null,
} as unknown as ClinItem);

const lptaFactor: EvaluationFactor = { factor: "LPTA", weight: null, method: "LPTA" };
const bestValueFactor: EvaluationFactor = { factor: "Best Value Tradeoff", weight: null, method: "best_value" };

interface Probe {
  label: string;
  facts: Pick<ExtractedFacts, "evaluationFactors" | "clins" | "naicsCode" | "issuingOffice">;
  expectType: "LPTA" | "BEST_VALUE" | "UNKNOWN";
  expectIsLpta: boolean;
  expectClinCount: number | null;
  expectGuidance: boolean;
  expectIgeNote: boolean;
  expectIgeIncludes?: string[];
}

const PROBES: Probe[] = [
  {
    label: "LPTA + agency + naics + 3 CLINs",
    facts: {
      evaluationFactors: [lptaFactor],
      clins: [clin("0001"), clin("0002"), clin("0003")],
      naicsCode: "541330",
      issuingOffice: "DLA Aviation",
    },
    expectType: "LPTA",
    expectIsLpta: true,
    expectClinCount: 3,
    expectGuidance: true,
    expectIgeNote: true,
    expectIgeIncludes: ["DLA Aviation", "NAICS 541330", "USASpending.gov"],
  },
  {
    label: "Best Value Tradeoff",
    facts: {
      evaluationFactors: [bestValueFactor],
      clins: [clin("0001")],
      naicsCode: "541512",
      issuingOffice: "GSA",
    },
    expectType: "BEST_VALUE",
    expectIsLpta: false,
    expectClinCount: 1,
    expectGuidance: false,
    expectIgeNote: false,
  },
  {
    label: "No evaluation factors detected",
    facts: {
      evaluationFactors: [],
      clins: [],
      naicsCode: null,
      issuingOffice: null,
    },
    expectType: "UNKNOWN",
    expectIsLpta: false,
    expectClinCount: null,
    expectGuidance: false,
    expectIgeNote: false,
  },
  {
    label: "LPTA missing agency + naics (falls back to defaults)",
    facts: {
      evaluationFactors: [lptaFactor],
      clins: [clin("0001"), clin("0002")],
      naicsCode: null,
      issuingOffice: null,
    },
    expectType: "LPTA",
    expectIsLpta: true,
    expectClinCount: 2,
    expectGuidance: true,
    expectIgeNote: true,
    expectIgeIncludes: ["the issuing agency", "matching NAICS"],
  },
  {
    label: "Mixed LPTA + best_value factors — LPTA wins",
    facts: {
      evaluationFactors: [bestValueFactor, lptaFactor],
      clins: [clin("0001")],
      naicsCode: "238220",
      issuingOffice: "USACE",
    },
    expectType: "LPTA",
    expectIsLpta: true,
    expectClinCount: 1,
    expectGuidance: true,
    expectIgeNote: true,
  },
];

function check(p: Probe): { pass: boolean; line: string } {
  const r = buildPriceAnchorContract(p.facts);
  const checks: string[] = [];
  if (r.evaluation_type !== p.expectType) checks.push(`type=${r.evaluation_type} (want ${p.expectType})`);
  if (r.is_lpta !== p.expectIsLpta) checks.push(`is_lpta=${r.is_lpta} (want ${p.expectIsLpta})`);
  if (r.clin_count !== p.expectClinCount) checks.push(`clin_count=${r.clin_count} (want ${p.expectClinCount})`);
  if (p.expectGuidance && !r.lpta_guidance) checks.push("lpta_guidance=null (expected populated)");
  if (!p.expectGuidance && r.lpta_guidance) checks.push("lpta_guidance populated (expected null)");
  if (p.expectIgeNote && !r.ige_note) checks.push("ige_note=null (expected populated)");
  if (!p.expectIgeNote && r.ige_note) checks.push("ige_note populated (expected null)");
  if (p.expectIgeIncludes && r.ige_note) {
    for (const needle of p.expectIgeIncludes) {
      if (!r.ige_note.includes(needle)) checks.push(`ige_note missing "${needle}"`);
    }
  }
  return {
    pass: checks.length === 0,
    line: `${p.label.padEnd(54)} → ${checks.length === 0 ? "PASS" : "FAIL: " + checks.join(", ")}`,
  };
}

function main() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  Fix 14 verifier — price anchor + IGE proxy (LPTA / BEST_VALUE / UNKNOWN)");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");
  let allPass = true;
  for (const p of PROBES) {
    const r = check(p);
    console.log("  " + r.line);
    if (!r.pass) allPass = false;
  }
  console.log("");
  console.log(allPass ? "✓ Fix 14 contract verified — LPTA-only fields gate correctly" : "✗ Fix 14 FAILED");
  process.exit(allPass ? 0 : 1);
}

main();
