// PROBE for src/lib/audit-claim-entailment-flag.test.ts. Not a gate — it asserts nothing and owns no verdict.
//
// It exists because ATTACHMENT_COVERAGE_ENABLED is a module-load const: the attachment-coverage arms of the
// flag matrix are only reachable in a process whose env was set BEFORE import. The suite spawns this once per
// cell and reads one JSON line off stdout.
//
// Nothing here reaches a model. The skeptic's system prompt and response schema are observed by handing
// makeStructuredSkeptic a RECORDING callStructured — the same seam the $0 unit tests use — so this reports
// what the API would actually have been sent, not a re-derivation of it.
import { makeStructuredSkeptic, makeAgenticVerifier, type SkepticVerdict } from "../../src/lib/audit-verifier";
import { claimEntailmentEnabled, auditToolsFor, type AuditToolContext } from "../../src/lib/audit-tools";
import { submitFindingsToolFor } from "../../src/lib/audit-expert";
import type { TypedFinding } from "../../src/lib/audit-findings";

const EXCERPT = "The Contractor shall furnish all labor, materials and equipment.";
const SOURCE = `==== DOCUMENT: primary solicitation ====\nSection C.\n${EXCERPT}\nIt is not a Wage Determination.\n`;
const ctx = { fullSource: SOURCE } as AuditToolContext;

const finding = (): TypedFinding => ({
  id: "f0", requirement: "Offerors must pay a minimum wage of $29.99 per hour",
  citation: "WD 2015-5627", excerpt: EXCERPT,
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "probe",
} as TypedFinding);

/** The eab43ada shape: a REAL verbatim excerpt carrying an INVENTED requirement, refuted with a full
 *  `corrected` payload. Before card #373 this took the substantive branch and SURVIVED re-typed. */
async function dropProbe() {
  const skeptic = async (): Promise<SkepticVerdict[]> => [{
    index: 0, upheld: false, entailmentFail: true,
    reason: "the excerpt states a furnishing obligation and says nothing about a wage floor",
    corrected: { controllability: "bidder_controls" },
  }];
  const res = await makeAgenticVerifier(skeptic)(ctx, [finding()]);
  return {
    survived: res.survived.length,
    rejected: res.rejected.length,
    dropReason: res.correctedDrops?.[0]?.dropReason ?? null,
  };
}

/** Record what the skeptic call would carry, without making it. */
async function shapeProbe() {
  let system = "", schema: Record<string, unknown> = {};
  const recording = async (a: { model: string; system: string; user: string; schema: Record<string, unknown> }) => {
    system = a.system; schema = a.schema; return { verdicts: [] as SkepticVerdict[] };
  };
  await makeStructuredSkeptic(recording, "probe-model")(ctx, [finding()]);

  const verdictProps = ((schema.properties as Record<string, { items?: { properties?: Record<string, unknown> } }>)
    ?.verdicts?.items?.properties) ?? {};
  const submitProps = (submitFindingsToolFor().input_schema.properties ?? {}) as Record<string, unknown>;

  return {
    entailArmed: claimEntailmentEnabled(),
    promptSaysOnly: /Challenge ONLY the classification/.test(system),
    schemaHasEntailmentFail: "entailmentFail" in verdictProps,
    attestationsInSubmitSchema: "attestations" in submitProps,
    readDocumentExposed: auditToolsFor().some((t) => t.name === "read_document"),
  };
}

async function main() {
  const out = process.argv.includes("--drop") ? await dropProbe() : await shapeProbe();
  console.log(JSON.stringify(out));
}

main().catch((e) => { console.error(e); process.exit(1); });
