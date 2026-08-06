// GATE — lens fan-out degradation (settleLensRuns) + per-model effort gating (effortLevelsFor).
//
// WHAT THIS PROTECTS. Two defects found in the 2026-08-06 stage-04/06 line audit:
//
//   P0-2  The five lenses ran under `Promise.all`, so ONE rejection discarded four completed lenses and the
//         whole PAID audit. The panel in the same stage already used allSettled.
//   P0-1  `AUDIT_LENS_EFFORT` accepted all five effort levels for every model. `xhigh` is NOT supported on
//         claude-sonnet-4-6 — the live lens model — so arming it would have 400'd every lens call, and under
//         P0-2 that one 400 killed the run.
//
// THE LEGS THAT CARRY THE WEIGHT ARE THE ONES THAT STILL THROW. Making a fan-out tolerant is easy; the risk
// is making it tolerant of things that must stay fatal. A budget-breach abort must reject the whole audit
// rather than degrade into a thin-but-decided verdict (that is what the throw in runAgenticExpert exists for),
// and a total wipeout must not render as an ordinary INCOMPLETE indistinguishable from an unreadable package.
// Legs 3 and 4 are those two, and a fix that "worked" by swallowing everything would go red on both.
//
// PLANTED-POSITIVE PROOF — five plants, each restored, each turning its named leg red:
//   A  drop the `opts.aborted` clause                → leg 3 (a budget breach degrades instead of throwing)
//   B  drop the all-failed clause                    → leg 4 (a total wipeout returns 5 empty runs)
//   C  degradedRun() returns `converged: true`       → leg 5 (a failed lens reports as converged)
//   D  settle keeps only fulfilled (no slot filling) → leg 2 (positional alignment breaks)
//   E  effortLevelsFor returns all five for sonnet-4-6 → leg 6 (xhigh accepted on a model that rejects it)
//
//   npx tsx src/lib/lens-fanout-and-effort.test.ts

import { settleLensRuns, effortLevelsFor, type ExpertRun } from "./audit-expert";

let failures = 0;
const fail = (leg: string, msg: string) => { failures++; console.error(`  ✗ ${leg} — ${msg}`); };
const pass = (leg: string, msg: string) => console.log(`  ✓ ${leg} — ${msg}`);

const KEYS = ["capture_strategist", "proposal_compliance", "source_selection_evaluator", "pricing_contracts_risk", "smallbiz_eligibility_counsel"];

/** A lens run that succeeded, shaped like the real one. */
const ok = (key: string, findings = 2): ExpertRun => ({
  findings: Array.from({ length: findings }, (_, i) => ({
    requirement: `${key} req ${i}`, citation: "52.212-1", excerpt: "the offeror shall submit",
    kind: "submission", controllability: "bidder_controls", grounded: true, lens: key,
  })) as ExpertRun["findings"],
  turns: 3, dropped: 0, droppedInReadSource: 0, converged: true,
  sectionsRead: ["L"], docsRead: [`${key}.pdf`], attestations: [], trace: [{ turn: 1, tools: [{ name: "read_section", input: { key: "L" } }] }],
});
const good = (key: string): PromiseSettledResult<ExpertRun> => ({ status: "fulfilled", value: ok(key) });
const bad = (msg: string): PromiseSettledResult<ExpertRun> => ({ status: "rejected", reason: new Error(msg) });

function main() {
  console.log("GATE — lens fan-out degradation + per-model effort gating\n");

  // ── LEG 1 · ALL SUCCEED — unchanged from today ──
  {
    const settled = KEYS.map(good);
    const { runs, failed } = settleLensRuns(settled, KEYS, { aborted: false });
    if (failed.length !== 0) fail("1 all-ok", `reported ${failed.length} failures on an all-fulfilled input`);
    else if (runs.length !== 5) fail("1 all-ok", `returned ${runs.length} runs for 5 lenses`);
    else if (!runs.every((r) => r.converged)) fail("1 all-ok", "a fulfilled run came back not-converged");
    else if (runs.reduce((n, r) => n + r.findings.length, 0) !== 10) fail("1 all-ok", "findings were lost on the happy path");
    else pass("1 all-ok", "5/5 preserved, converged, 10 findings — byte-equivalent to today");
  }

  // ── LEG 2 · ONE FAILS — the other four SURVIVE, and slots stay positionally aligned ──
  // This is the whole point of the fix: before it, this input threw and four lenses' paid work was discarded.
  {
    const settled: Array<PromiseSettledResult<ExpertRun>> = [good(KEYS[0]), bad("400 output_config.effort: xhigh unsupported"), good(KEYS[2]), good(KEYS[3]), good(KEYS[4])];
    const { runs, failed } = settleLensRuns(settled, KEYS, { aborted: false });
    if (runs.length !== 5) fail("2 one-fails", `POSITIONAL BREAK: ${runs.length} runs for 5 lenses — runs[i] no longer aligns with experts[i]`);
    else if (runs[1].converged) fail("2 one-fails", "the failed lens reported converged");
    else if (runs[1].findings.length !== 0 || runs[1].sectionsRead.length !== 0 || runs[1].docsRead.length !== 0) fail("2 one-fails", "the failed lens contributed content it never read");
    else if (runs.reduce((n, r) => n + r.findings.length, 0) !== 8) fail("2 one-fails", "surviving lenses lost findings");
    else if (failed.length !== 1 || failed[0].key !== KEYS[1]) fail("2 one-fails", `failure not named correctly: ${JSON.stringify(failed)}`);
    else if (!failed[0].reason.includes("xhigh")) fail("2 one-fails", "the failure reason was not carried through for diagnosis");
    else pass("2 one-fails", "4 lenses preserved (8 findings), slot 1 degraded + named with its reason");
  }

  // ── LEG 3 · ABORTED SIGNAL STILL THROWS — a budget breach must never degrade into a verdict ──
  {
    const settled: Array<PromiseSettledResult<ExpertRun>> = [good(KEYS[0]), bad("agentic expert aborted: overall budget exceeded"), good(KEYS[2]), good(KEYS[3]), good(KEYS[4])];
    let threw = false, msg = "";
    try { settleLensRuns(settled, KEYS, { aborted: true }); } catch (e) { threw = true; msg = (e as Error).message; }
    if (!threw) fail("3 abort-fatal", "A BUDGET BREACH DEGRADED INSTEAD OF THROWING — a thin verdict would be emitted for an audit that ran out of time");
    else if (!msg.includes("budget")) fail("3 abort-fatal", `threw, but the message does not name the cause: ${msg}`);
    else pass("3 abort-fatal", "aborted signal + any rejection ⇒ throws, cause named");
  }

  // ── LEG 3b · the abort check keys on the SIGNAL, not on the error text ──
  // A rejection whose message happens to mention "budget" must NOT be fatal when the signal is clean; an abort
  // whose message says nothing about budgets must still be fatal. Message-matching would invert both.
  {
    const looksLikeBudget: Array<PromiseSettledResult<ExpertRun>> = [good(KEYS[0]), bad("upstream said: budget exceeded on their side"), good(KEYS[2]), good(KEYS[3]), good(KEYS[4])];
    let threwOnClean = false;
    try { settleLensRuns(looksLikeBudget, KEYS, { aborted: false }); } catch { threwOnClean = true; }
    const silentAbort: Array<PromiseSettledResult<ExpertRun>> = [good(KEYS[0]), bad("socket hang up"), good(KEYS[2]), good(KEYS[3]), good(KEYS[4])];
    let threwOnAbort = false;
    try { settleLensRuns(silentAbort, KEYS, { aborted: true }); } catch { threwOnAbort = true; }
    if (threwOnClean) fail("3b signal-not-text", "a clean-signal failure threw because its MESSAGE mentioned a budget");
    else if (!threwOnAbort) fail("3b signal-not-text", "an aborted run did NOT throw because its message did not mention a budget");
    else pass("3b signal-not-text", "fatality keys on the signal; the error text is not consulted");
  }

  // ── LEG 4 · TOTAL WIPEOUT STILL THROWS — not degradation, the stage did not run ──
  {
    const settled = KEYS.map((_, i) => bad(`lens ${i} died`));
    let threw = false, msg = "";
    try { settleLensRuns(settled, KEYS, { aborted: false }); } catch (e) { threw = true; msg = (e as Error).message; }
    if (!threw) fail("4 wipeout-fatal", "ALL FIVE LENSES FAILED AND IT RETURNED NORMALLY — that renders as an ordinary INCOMPLETE, indistinguishable from an unreadable package");
    else if (!/ALL 5/.test(msg)) fail("4 wipeout-fatal", `threw, but does not state the scope: ${msg}`);
    else pass("4 wipeout-fatal", "0 of 5 surviving ⇒ throws rather than emitting a verdict-shaped artifact");
  }

  // ── LEG 5 · a degraded lens is honest: nothing read, nothing covered, not converged ──
  // If a degraded slot claimed converged/sectionsRead, coverage would count a lens that never ran as covered —
  // turning a fault-tolerance fix into a false-COMPLETE, which is strictly worse than the crash it replaced.
  {
    const settled: Array<PromiseSettledResult<ExpertRun>> = [bad("boom"), good(KEYS[1]), good(KEYS[2]), good(KEYS[3]), good(KEYS[4])];
    const { runs } = settleLensRuns(settled, KEYS, { aborted: false });
    const d = runs[0];
    const clean = !d.converged && d.findings.length === 0 && d.sectionsRead.length === 0 && d.docsRead.length === 0 && d.attestations.length === 0 && d.trace.length === 0;
    if (!clean) fail("5 degraded-honest", `a degraded lens carries content: ${JSON.stringify({ converged: d.converged, f: d.findings.length, s: d.sectionsRead.length, docs: d.docsRead.length, att: d.attestations.length })}`);
    else if (runs.every((r) => r.converged)) fail("5 degraded-honest", "allConverged would still compute true with a dead lens");
    else pass("5 degraded-honest", "degraded slot reads nothing and is not converged ⇒ coverage falls toward INCOMPLETE");
  }

  // ── LEG 6 · EFFORT — xhigh must be refused on the live lens model, accepted on models that support it ──
  {
    const s46 = effortLevelsFor("claude-sonnet-4-6");
    const o5 = effortLevelsFor("claude-opus-5");
    const haiku = effortLevelsFor("claude-haiku-4-5");
    const unknown = effortLevelsFor("claude-some-future-model");
    if (!s46) fail("6 effort-map", "no capability record for the live lens model");
    else if (s46.has("xhigh")) fail("6 effort-map", "xhigh is ACCEPTED on claude-sonnet-4-6 — the API rejects it; every lens call would 400");
    else if (!["low", "medium", "high", "max"].every((l) => s46.has(l))) fail("6 effort-map", "a level the API does support was dropped from sonnet-4-6");
    else if (!o5?.has("xhigh")) fail("6 effort-map", "xhigh refused on claude-opus-5, which does support it");
    else if (haiku === undefined || haiku.size !== 0) fail("6 effort-map", "haiku-4-5 should be a KNOWN-EMPTY set (asked, answer was none), not absent");
    else if (unknown !== undefined) fail("6 effort-map", "an unknown model returned a level set instead of undefined — the caller would guess instead of omitting");
    else pass("6 effort-map", "sonnet-4-6 refuses xhigh, opus-5 allows it, haiku known-empty, unknown ⇒ undefined (omit)");
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
