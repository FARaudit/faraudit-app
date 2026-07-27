// ARC #747 — FINDING IDS STAY UNIQUE ON THE SEED (JUDGMENT-FIRST) PATH.
// Run: npx tsx src/lib/audit-seed-id-uniqueness.test.ts
//
// /code-review high round 4, finding #2 on PR #292. Commit 3fce09a closed the duplicate-id class by routing
// five emitters through `assignUniqueFindingIds` — and left the seed path numbering itself with
// `f.id ?? judgment#${j}`, where `j` is the index AFTER the grounded filter. That is the SAME defect the
// class fix exists to prevent, in the one path the arc's own $0 acceptance harness actually drives
// (_engine-rail-harness.ts seeds from `rec.result.findings`).
//
// Why a duplicate id is not cosmetic: `applyHeadRepairsTo` pairs findings BY ID. Under a duplicate it can
// write one finding's widened quote onto ANOTHER finding's requirement — a verbatim excerpt corroborating an
// obligation it does not belong to. That is the fabrication shape this arc exists to close.
//
// This drives the REAL rail through the production `seedFindings` seam ($0 — callModel throws), not a unit
// re-implementation of the numbering. A test of the numbering in isolation would have passed against the
// defect, because the defect is in which rows reach the numbering.
export {};
import { runAgenticAudit } from "./audit-orchestrator";
import type { AuditToolContext } from "./audit-tools";
import type { TypedFinding } from "./audit-findings";

// ── $0 ENFORCEMENT — a paid call is a test failure, not a cost line. [[feedback_static_review_cannot_replace_execution]]
delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL REACHED — the seed rail must never call the model"); }) as never;

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

// The source every GROUNDED excerpt below must appear in verbatim — `isGrounded` is a normalized substring
// check against it, and an ungrounded seed row is DROPPED. The drop is the mechanism: it shifts the indices
// the old numbering counted with.
const SOURCE = [
  "SECTION L INSTRUCTIONS TO OFFERORS",
  "Offerors shall submit the technical volume not later than 2:00 PM local time.",
  "The Government intends to award without discussions.",
  "This acquisition is set aside for HUBZone small business concerns.",
  "Offerors must hold an active registration in SAM at time of award.",
  "A site visit will be conducted and attendance is mandatory for all offerors.",
  "PARAGRAPH THAT NO SEEDED FINDING QUOTES, present only to keep the source realistic.",
].join("\n\n");

const F = (o: Partial<TypedFinding> & { excerpt: string }): TypedFinding => ({
  requirement: `obligation for: ${o.excerpt.slice(0, 40)}`,
  citation: "SECTION L",
  kind: "requirement",
  lens: "judgment",
  severity: "MED",
  grounded: true,
  ...o,
} as TypedFinding);

/** The seed shape a real banked record has: id-CARRYING rows from the judgment lens FIRST, then id-LESS rows
 *  from the notice-body eligibility / size-standard / self-determinable caveat emitters, which push findings
 *  with no `id` field at all (audit-orchestrator.ts ~1250-1470) and are appended AFTER the lens rows
 *  (`findings = [...findings, ...emit(...)]`, lines 2886/2895/2897).
 *
 *  The collision needs the drops to fall on LOW-numbered rows, so that HIGH-numbered ids survive at low
 *  filtered indices and the appended id-less rows land on an index a survivor already holds. Here #1/#2/#3
 *  fail to re-ground, so survivors judgment#0/#4/#5 sit at filtered indices 0/1/2 and the two emitter rows
 *  take indices 3 and 4 — and `judgment#4` is already taken. This is not a contrived ordering: re-grounding
 *  drops exactly the rows whose excerpts a prior engine version grounded and this one does not, which has no
 *  correlation with where they sit in the seed. */
const seed = (): TypedFinding[] => [
  F({ id: "judgment#0", excerpt: "Offerors shall submit the technical volume not later than 2:00 PM local time." }),
  F({ id: "judgment#1", excerpt: "NOT PRESENT IN SOURCE — dropped by re-grounding" }),
  F({ id: "judgment#2", excerpt: "ALSO NOT PRESENT IN SOURCE — dropped by re-grounding" }),
  F({ id: "judgment#3", excerpt: "THIRD ROW NOT PRESENT IN SOURCE — dropped by re-grounding" }),
  F({ id: "judgment#4", excerpt: "The Government intends to award without discussions." }),
  F({ id: "judgment#5", excerpt: "This acquisition is set aside for HUBZone small business concerns." }),
  // ── the emitter rows: grounded, decision-bearing, and carrying NO id ──
  F({ id: undefined, lens: "notice_body_elig", kind: "eligibility_bar",
      excerpt: "Offerors must hold an active registration in SAM at time of award." }),
  F({ id: undefined, lens: "notice_body_elig", kind: "eligibility_bar",
      excerpt: "A site visit will be conducted and attendance is mandatory for all offerors." }),
];

async function run() {
  const ctx: AuditToolContext = { fullSource: SOURCE, groundingSource: SOURCE } as AuditToolContext;
  const res: any = await runAgenticAudit({
    ctx, experts: [], callModel,
    seedFindings: seed(),
    bidderProfile: null,
    manifestComplete: null,
  } as never);

  const ids: string[] = (res.findings ?? []).map((f: TypedFinding) => f.id).filter(Boolean) as string[];
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);

  check("every finding leaving the rail carries an id", ids.length === (res.findings ?? []).length,
    `${ids.length} ids for ${(res.findings ?? []).length} findings`);
  check("NO duplicate finding id survives the seed path", dupes.length === 0,
    `duplicates: ${[...new Set(dupes)].join(", ")}\n     all ids: ${ids.join(", ")}`);

  // The three ids the seed brought are the record's identity — re-issuing them would break every
  // pairing that reads a prior record (replay drift, dedup bookkeeping, the differential harness).
  const kept = ["judgment#0", "judgment#4", "judgment#5"].filter((id) => ids.includes(id));
  check("the surviving seed ids are PRESERVED, not renumbered", kept.length === 3,
    `kept ${kept.join(", ")} — all ids: ${ids.join(", ")}`);

  // ── FALSIFICATION PROBE ────────────────────────────────────────────────────────────────────────────
  // A cert that cannot fail certifies nothing. [[feedback_certs_must_be_proven_falsifiable]] This reproduces
  // the OLD numbering against this exact seed and asserts it WOULD have collided. If this probe ever stops
  // reporting a collision, the fixture no longer exercises the defect and the assertions above are inert.
  const grounded = seed().filter((f) => !/NOT PRESENT IN SOURCE/.test(f.excerpt ?? ""));
  const oldIds = grounded.map((f, j) => f.id ?? `judgment#${j}`);
  const oldDupes = oldIds.filter((id, i) => oldIds.indexOf(id) !== i);
  check("PROBE — the old `judgment#${j}` numbering DOES collide on this fixture", oldDupes.length > 0,
    `old numbering produced ${oldIds.join(", ")} — expected a duplicate, found none, so this fixture no longer proves anything`);

  console.log(oldDupes.length ? `\n   old numbering collided on: ${[...new Set(oldDupes)].join(", ")}` : "");
  console.log(failures ? `\n❌ ${failures} failed` : "\n✅ all passed");
  process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.error("❌ threw:", e); process.exit(1); });
