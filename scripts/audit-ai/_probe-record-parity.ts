// $0 probe — does capture's coreMissing snapshot now agree with its own replay? (round-4 finding #3)
//
// FIRST VERSION WAS INERT and said ✅ three times: its fixture classified `part15-ucf`, whose branch
// (audit-orchestrator.ts:270) ignores `requiresLM` altogether, so capture and replay agreed no matter what
// either was passed. [[feedback_placebo_family_inert_equals_passing]] This one routes to part12-commercial,
// where `requiresLM` gates the impostor cap (line 280) and the divergence is observable.
import { buildRunRecord, replayRunRecord } from "@/lib/audit-run-record";
import { coreMissingFor } from "@/lib/audit-orchestrator";
import type { AuditToolContext } from "@/lib/audit-tools";

// Commercial-classified, NO §L/§M present, no recognized primary form ⇒ the impostor cap is in play.
const SOURCE = [
  "SF 1449 SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL PRODUCTS AND COMMERCIAL SERVICES",
  "This RFQ covers janitorial services at the installation.",
  "The contractor shall provide all labor, supervision and materials.",
].join("\n\n");

const mk = (noticeType: string | null) => buildRunRecord({
  meta: { sol: "PROBE", runId: "probe", ts: new Date(0).toISOString() } as never,
  input: {
    fullSource: SOURCE, bidderProfile: null, naics: null, setAside: null, manifestComplete: null,
    noticeType, formIdentified: false,
  },
  result: {
    decision: { verdict: "INCOMPLETE", eligible: null, reason: "probe", showStoppers: [] },
    inputs: { findings: [], source: SOURCE, bidderProfile: null, manifestComplete: null, coverage: { required: [], covered: [], missing: [] } } as never,
    findings: [], coverage: { required: [], covered: [], missing: [], attestations: [], coreMissing: [] },
    conflict: false, sectionsRead: [], perLens: {},
  } as never,
  billing: { honestFail: false, billable: false },
} as never);

const ctx = { fullSource: SOURCE } as AuditToolContext;
const asSet = (xs: string[]) => [...xs].sort().join(",");
// What capture said BEFORE the fix: no scoping args at all — the fail-safe "solicitation-type buy" default.
const preFix = asSet(coreMissingFor(ctx, {}));

let bad = 0;
for (const nt of ["Sources Sought", "Solicitation", null]) {
  const rec = mk(nt);
  const capture = asSet(rec.format.coreMissing);
  const replay = asSet(replayRunRecord(rec).coreMissing);
  const agree = capture === replay;
  if (!agree) bad++;
  console.log(`${agree ? "✅" : "❌"} noticeType=${JSON.stringify(nt)}  capture=[${capture}]  replay=[${replay}]`);
}

// FALSIFICATION PROBE — if the scoped answer equals the unscoped one for EVERY notice type, this fixture
// does not exercise the defect and the ✅s above mean nothing. The divergence lands on the SOLICITATION side
// here: pre-fix capture never passed `formIdentified`, so the impostor cap could not fire at capture time
// while replay fired it — the record contradicting its own replay in the direction that under-reports.
const scoped = ["Sources Sought", "Solicitation", null].map((nt) => asSet(mk(nt).format.coreMissing));
const moved = scoped.some((s) => s !== preFix);
console.log(`${moved ? "✅" : "❌"} PROBE — scoping CHANGES the answer here: pre-fix capture=[${preFix}] vs scoped [${scoped.map((s) => `[${s}]`).join(" ")}]`);
process.exit(bad === 0 && moved ? 0 : 1);
