// ARC #747 · E2 — THE CITATION GATE JUDGES AGAINST THE CORPUS THE EXECUTOR ACTUALLY HAS.
// Run: npx tsx src/lib/audit-e2-citation-corpus.test.ts
//
// /code-review high round 4 on PR #294, findings #1 and #4, proven through the REAL rail (production
// `seedFindings` seam, $0 — the model caller throws).
//
// #1 — the gate read `ctx.groundingSource ?? ctx.fullSource`, and `auditPackage` never sets
//      `ctx.groundingSource`: it RECEIVES `input.groundingSource` and then builds its ctx without it
//      (audit-package.ts:198), while `runJudgmentFirstAudit` does forward it (:294). So on the production path
//      the gate always landed on `fullSource` — which under AUDIT_LOSSLESS_INGEST (live = true) is a
//      binding-filtered SUBSET for an over-budget package — while the executor's fold gate one layer up used
//      the complete pre-compression text. Two gates, two corpora, and a comment asserting they matched. The
//      consequence is this module's own stated worst failure: a citation genuinely IN the solicitation
//      withheld from the customer's report.
// #4 — `decision.showStoppers` are COPIES of the finding objects, so gating both surfaces recorded the same
//      rejected token twice and the ledger was not a record of distinct withholdings.
export {};
import { runAgenticAudit } from "./audit-orchestrator";
import type { AuditToolContext } from "./audit-tools";
import type { TypedFinding } from "./audit-findings";
import { gateCitationsInText, extractRegulationTokens, corporaPairedInSource } from "./audit-citation-fidelity";

delete process.env.ANTHROPIC_API_KEY;
const callModel = (() => { throw new Error("PAID CALL REACHED — the seed rail must never call the model"); }) as never;

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

// The TRUE citation lives ONLY in the complete text — this is the whole point. `FULL` stands in for the
// lossless-filtered digest the engine reasons over; `COMPLETE` for the pre-compression corpus the executor
// holds. The excerpt below is verbatim in BOTH, so the finding grounds either way and the ONLY variable is
// which corpus the citation is checked against.
//
// THE CITED NUMBER IS DELIBERATELY GRAMMAR-INVALID. A first version of this fixture used DFARS 252.215-7009,
// which the grammar accepts outright — so the gate never consulted the corpus at all and the probe below
// correctly reported the test as inert. `215-2` is the FOUNDING defect's own shape (dash-only, no dot), which
// no grammar admits, so PRESENCE IN THE SOURCE is the only thing that can exonerate it. That makes which
// corpus is consulted the single variable, which is what this test is for.
const EXCERPT = "The contractor shall submit a certified cost proposal with its offer.";
const FULL = `SECTION L INSTRUCTIONS\n\n${EXCERPT}\n\nOffers are due at 2:00 PM local time.`;
const COMPLETE = `${FULL}\n\nDFARS provision 215-2 applies to this acquisition in its entirety.`;

const seed = (): TypedFinding[] => [
  {
    id: "judgment#0",
    requirement: "Submit a certified cost proposal — see DFARS 215-2 for the required format.",
    citation: "SECTION L",
    excerpt: EXCERPT,
    kind: "submission",   // a form/cert to submit — the shape a §L instruction actually takes
    lens: "judgment",
    severity: "P1",
    grounded: true,
    // A submission instruction the bidder satisfies by doing the work — a GATE-TO-CLEAR, never disqualifying.
    // Stated rather than cast away: `controllability` is what deriveVerdict reads, so a fixture that omits it
    // is not the shape the rail actually decides on.
    controllability: "bidder_controls",
  } as TypedFinding,
];

const ctx = (): AuditToolContext => ({ fullSource: FULL } as AuditToolContext);

async function rail(opts: { citationSource?: string }) {
  process.env.AUDIT_CITATION_FIDELITY = "true";
  return (await runAgenticAudit({
    ctx: ctx(), experts: [], callModel, seedFindings: seed(),
    bidderProfile: null, manifestComplete: null,
    ...(opts.citationSource !== undefined ? { citationSource: opts.citationSource } : {}),
  } as never)) as never as { findings: TypedFinding[]; citationsWithheld?: unknown[] };
}

const WITHHELD = /citation withheld/;
const printed = (r: { findings: TypedFinding[] }) => r.findings.map((f) => f.requirement ?? "").join(" ");

async function run() {
  // ── #1 · WITH the executor's corpus, the TRUE citation survives ─────────────────────────────────────
  const withCorpus = await rail({ citationSource: COMPLETE });
  check("a citation present in the COMPLETE text is printed, not withheld",
    !WITHHELD.test(printed(withCorpus)) && /215-2/.test(printed(withCorpus)),
    printed(withCorpus));

  // ── #1 · FALSIFICATION PROBE ────────────────────────────────────────────────────────────────────────
  // The pre-fix behaviour, reproduced: no explicit corpus ⇒ the gate falls back to the filtered digest,
  // which does not carry the citation ⇒ it is withheld from the customer. If this ever stops being
  // withheld, the fixture no longer distinguishes the two corpora and the assertion above proves nothing.
  // [[feedback_certs_must_be_proven_falsifiable]]
  const withoutCorpus = await rail({});
  check("PROBE — WITHOUT the corpus the same true citation IS withheld (the defect, reproduced)",
    WITHHELD.test(printed(withoutCorpus)),
    `expected a withholding on the digest-only corpus, got: ${printed(withoutCorpus)}`);

  // ── #4 · the ledger records DISTINCT withholdings ───────────────────────────────────────────────────
  // The finding above is HIGH and reaches `decision.showStoppers` as a COPY, so the pre-fix ledger counted
  // the same token once per surface it happened to reach.
  const led = (withoutCorpus.citationsWithheld ?? []) as Array<{ corpus: string; number: string; raw: string; field?: string }>;
  const keys = led.map((w) => `${w.corpus}|${w.number}|${w.raw}|${w.field ?? ""}`);
  check("the withholding ledger has no duplicate entries",
    keys.length === new Set(keys).size,
    `ledger: ${JSON.stringify(keys)}`);
  check("PROBE — the ledger is non-empty, so the dedup assertion is not vacuous",
    keys.length > 0,
    "nothing was withheld at all — this fixture cannot test dedup");

  // ── GRAMMAR REGRESSIONS (round 4, findings #2 · #3 · #6) ────────────────────────────────────────────
  // Each was verified by EXECUTION against the shipped module before the fix, not inferred from the regex.
  const SRC = "Comply with DFARS provision 252.215-7009 and DLAD 52.211-9000 as applicable.";

  // #2 — the pattern ran case-insensitively, so the English word "far" matched the FAR corpus and
  // "so far 0.5 percent" was rewritten into a withholding marker. Free prose is the exposed surface: the
  // executor gates the model-authored panel rationale, which is not a citation field.
  check("#2 · the English word \"far\" is not a citation",
    gateCitationsInText("so far 0.5 percent of the total was withheld", SRC, "t").text
      === "so far 0.5 percent of the total was withheld");
  check("#2 PROBE · a REAL uppercase FAR cite is still extracted (the fix did not just disable the corpus)",
    extractRegulationTokens("see FAR 52.219-6 for the set-aside").length === 1);

  // #3 — "provision" is the standard FAR/DFARS word for a §L/§K solicitation provision and was in neither
  // the extractor's connector list nor the source-pairing check.
  check("#3a · \"DFARS provision 215-2\" is extracted (was completely ungated)",
    extractRegulationTokens("per DFARS provision 215-2").length === 1);
  check("#3b · a source writing \"DFARS provision 252.215-7009\" pairs the number to DFARS",
    corporaPairedInSource("252.215-7009", SRC).has("DFARS"));

  // #6 — DLAD clauses are 52.2xx-9xxx, not 5452.xxx-xxxx; DLA is high-volume in this corpus.
  check("#6 · a real DLAD clause is not withheld",
    !WITHHELD.test(gateCitationsInText("See DLAD 52.211-9000 for packaging.", "nothing relevant here", "t").text));
  check("#6 PROBE · an invented DLAD number IS still withheld (the grammar did not go permissive)",
    WITHHELD.test(gateCitationsInText("See DLAD 215-2 for packaging.", "nothing relevant here", "t").text));

  console.log(failures ? `\n❌ ${failures} failed` : "\n✅ all passed");
  process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.error("❌ threw:", e); process.exit(1); });
