// Which decide-layer predicate ACTUALLY moves when a Top Secret clearance head is absorbed?
// The classifier-invariance signature is only as good as the predicates in it; guessing which ones matter is
// how a guard becomes a placebo.
import * as D from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

const EX = "business days prior to the closing date and time of this solicitation";
const WIDE = "Offerors must possess a Top Secret facility clearance at time of proposal submission\nquestions shall be submitted in writing no later than five\n" + EX;
const mk = (excerpt: string): TypedFinding => ({
  requirement: "Questions must be submitted in writing no later than five business days prior to closing.",
  citation: "Section L", excerpt, kind: "submission_mechanic", controllability: "bidder_controls",
  grounded: true, lens: "proposal_manager", severity: "P2",
} as unknown as TypedFinding);

const a = mk(EX), b = mk(WIDE);
for (const [name, fn] of Object.entries(D)) {
  if (typeof fn !== "function") continue;
  let ra: unknown, rb: unknown;
  try { ra = (fn as (x: TypedFinding) => unknown)(a); rb = (fn as (x: TypedFinding) => unknown)(b); }
  catch { continue; }
  if (typeof ra !== "boolean" && typeof ra !== "string") continue;
  if (ra !== rb) console.log(`MOVES  ${name}: ${JSON.stringify(ra)} -> ${JSON.stringify(rb)}`);
}
// string-arg predicates
for (const [name, fn] of Object.entries(D)) {
  if (typeof fn !== "function") continue;
  let ra: unknown, rb: unknown;
  try { ra = (fn as (x: string) => unknown)(EX); rb = (fn as (x: string) => unknown)(WIDE); }
  catch { continue; }
  if (typeof ra !== "boolean") continue;
  if (ra !== rb) console.log(`MOVES(str) ${name}: ${ra} -> ${rb}`);
}
