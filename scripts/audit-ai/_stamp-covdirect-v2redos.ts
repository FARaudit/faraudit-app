// DRY-STAMP addendum — close the two flagged verification gaps:
//  (A) V2 DOWNSTREAM: run REAL gradeCoverageV2 over the R4 fixtures (over-fire fixtures stay covered; under-fire escalates).
//  (B) ReDoS WORST-CASE: catastrophic-backtracking-shaped adversarial inputs, measured through REAL completenessOf.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import { gradeCoverageV2 } from "@/lib/audit-gate-v2";
import type { TypedFinding } from "@/lib/audit-types";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`FAIL ${l}: got ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };
const f = (sec: string, ex: string): TypedFinding =>
  ({ id: "f_" + sec, citation: "§" + sec, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);
const G = "Inspection will be performed at destination.";
function cov(sec: string, extra: string) {
  const src = [`SECTION ${sec} - HEADER`, G, extra].join("\n");
  const r = completenessOf({ fullSource: src } as any, [sec], [f(sec, G)], new Set([sec]));
  return gradeCoverageV2(r.attestations);
}

function main() {
  // ===== (A) V2 DOWNSTREAM — R4 over-fire fixtures must stay CLEAN in V2 (no manufactured disqualifierUncovered).
  {
    const c = cov("F", "The firm's documents shall be registered in the tracking system.");
    ok("[v2-of1] genitive-thing over-fire fixture ⇒ V2 grade 1.0 (no false uncovered-disqualifier)", c.coverageGrade, 1);
    ok("[v2-of1] disqualifierUncovered empty", c.disqualifierUncovered.length, 0);
  }
  {
    const c = cov("D", "The program described in block 8(a) shall be delivered per schedule.");
    ok("[v2-of2] form-field 8(a) over-fire fixture ⇒ V2 grade 1.0", c.coverageGrade, 1);
    ok("[v2-of2] disqualifierUncovered empty", c.disqualifierUncovered.length, 0);
  }
  // ===== (A) V2 DOWNSTREAM — a REAL under-fire bar must escalate end-to-end in V2 (disqualifierUncovered + grade<1).
  {
    const c = cov("H", "The contractor shall possess a Top Secret facility clearance at time of award.");
    ok("[v2-uf1] real clearance bar ⇒ V2 disqualifierUncovered surfaces the bar", c.disqualifierUncovered.some((d) => /top secret facility clearance/i.test(d.obligation)), true);
    ok("[v2-uf1] V2 grade < 1", c.coverageGrade < 1, true);
  }

  // ===== (B) ReDoS WORST-CASE — inputs shaped to stress the bounded quantifiers ([\w /:.\-]{0,40}, [^.!?]{0,55}, etc.).
  const shapes: Array<[string, string]> = [
    ["shall-possess run", "SECTION H - HEADER\nThe contractor shall possess " + "a ".repeat(2000) + "clearance."],
    ["only-attend run", "SECTION H - HEADER\nOnly " + "attended ".repeat(1500) + "may propose."],
    ["restricted-to run", "SECTION C - HEADER\nAward is restricted to " + "small business ".repeat(1500) + "concerns."],
    ["8a-adjacency run", "SECTION C - HEADER\nAward to " + "x ".repeat(1500) + "8(a) participants."],
    ["set-aside run", "SECTION C - HEADER\n" + "small business ".repeat(1500) + "set-aside program."],
    ["no-terminator giant", "SECTION H - HEADER\n" + "the offeror shall be certified and registered and cleared ".repeat(1000)],
  ];
  for (const [name, src] of shapes) {
    const t0 = Date.now();
    completenessOf({ fullSource: src } as any, [src.includes("SECTION C") ? "C" : "H"], [f("H", "x")], new Set(["C", "H"]));
    const ms = Date.now() - t0;
    ok(`[redos ${name}] linear (<500ms, got ${ms}ms)`, ms < 500, true);
  }

  console.log(`\n${fails.length === 0 ? "ALL PASS" : "HAS FAILURES"} — ${pass} passed, ${fails.length} failed`);
  fails.forEach((x) => console.log(x));
  if (fails.length) process.exit(1);
}
main();
