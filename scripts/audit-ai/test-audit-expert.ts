// $0 gate for the AGENTIC EXPERT REACT LOOP (Brain card 43). Proves the loop executes tools, iterates,
// and the deterministic grounding backstop drops ungrounded findings — all with a STUB model ($0, no API).
import { runAgenticExpert, type CallModel } from "@/lib/audit-expert";
import type { AuditToolContext } from "@/lib/audit-tools";

const SRC = "SECTION C - STATEMENT OF WORK\nThe contractor shall furnish one mini-excavator with a fully enclosed cab.\n"
  + "52.219-6 Notice of Total Small Business Set-Aside applies.\nSECTION M\nAward is Lowest-Priced Technically Acceptable.";
const ctx: AuditToolContext = { fullSource: SRC };

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

// Scripted stub: turn 1 calls two tools; turn 2 submits two findings — one GROUNDED (excerpt in source),
// one UNGROUNDED (fabricated excerpt). The loop must execute the tools then keep only the grounded one.
let turn = 0; const toolsSeen: string[] = [];
const stub: CallModel = async ({ priorToolResults }) => {
  turn++;
  if (turn === 1) return { toolCalls: [{ id: "t1", name: "read_section", input: { key: "C" } }, { id: "t2", name: "lookup_clause", input: { clause: "52.219-6" } }], findings: null };
  for (const batch of priorToolResults) for (const r of batch) toolsSeen.push(r.name);
  return { toolCalls: [], findings: [
    { requirement: "fully enclosed cab", citation: "§C", excerpt: "fully enclosed cab", kind: "technical_spec", controllability: "bidder_controls" },
    { requirement: "fabricated requirement", citation: "§C", excerpt: "this exact text is NOT in the document at all", kind: "other", controllability: "bidder_controls" },
  ] };
};

async function main() {
  const res = await runAgenticExpert({ key: "capture_strategist", system: "lens" }, ctx, { callModel: stub });
  ok("converged", res.converged, true);
  ok("ran 2 turns", res.turns, 2);
  ok("executed the tools the expert called", toolsSeen.sort(), ["lookup_clause", "read_section"]);
  ok("kept 1 grounded finding", res.findings.length, 1);
  ok("dropped 1 ungrounded finding", res.dropped, 1);
  ok("the survivor is the grounded one", res.findings[0]?.requirement, "fully enclosed cab");
  ok("finding is tagged grounded", res.findings[0]?.grounded, true);
  ok("finding carries the lens", res.findings[0]?.lens, "capture_strategist");

  // non-convergence guard: a model that never submits → [] after maxTurns, no crash.
  const spin: CallModel = async () => ({ toolCalls: [{ id: "x", name: "read_section", input: { key: "C" } }], findings: null });
  const res2 = await runAgenticExpert({ key: "x", system: "s" }, ctx, { callModel: spin, maxTurns: 3 });
  ok("non-convergence → empty, bounded", [res2.converged, res2.turns, res2.findings.length], [false, 3, 0]);

  console.log(`audit-expert gate: ${pass}/${pass + fails.length} pass`);
  if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
  console.log("✅ ALL PASS — react loop executes tools + iterates; deterministic grounding drops ungrounded findings; bounded.");
}
main();
