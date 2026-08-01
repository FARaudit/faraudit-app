// Worker: rebuilds ELIGIBILITY_BAR_RE exactly as audit-orchestrator does (the const is module-private), under
// whatever AUDIT_MANDATORY_NEGATION_GUARD this process carries, and reports match/no-match.
export {};
import { readFileSync } from "node:fs";
const src = readFileSync("src/lib/audit-orchestrator.ts", "utf8");
const i = src.indexOf("const ELIGIBILITY_BAR_RE_BASE = /");
if (i < 0) throw new Error("ELIGIBILITY_BAR_RE_BASE not found — cert is measuring nothing");
const line = src.slice(i, src.indexOf("\n", i));
const body = line.slice(line.indexOf("/")).replace(/;\s*$/, "");
const base: RegExp = (0, eval)(`(${body})`);
const NEEDLE = "\\b(?:mandatory|required)";
if (!base.source.includes(NEEDLE)) throw new Error("mandatory arm absent — cert would be inert");
const re = process.env.AUDIT_MANDATORY_NEGATION_GUARD === "true"
  ? new RegExp(base.source.replace(NEEDLE, "(?<!non[-\\s])(?<!not\\s)" + NEEDLE), "i")
  : base;
const AOC = "A NON-MANDATORY site visit will be held at the Capitol Building, room S-216 on: Tuesday, April 7, 2026, at 1:00 PM EDT To attend the site visit, all companies MUST register with the Contracting Officer";
// REACHABILITY NOTE (measured, not assumed): this arm needs mandatory|required ... site visit|conference ...
// then within 55 chars one of `attend\b`, `eligib\b`, `to (propose|bid|submit)\b`. The word boundaries mean
// "attendance" does NOT satisfy `attend\b` and "eligible" does NOT satisfy `eligib\b` — only the bare words do.
// So the arm is far narrower than it reads, and the real AOC sentence does NOT reach it (asserted below).
const CASES: Array<[string, string, boolean]> = [
  // MUST STILL MATCH — genuine mandatory bars that DO reach the arm.
  ["MUST mandatory + bare attend", "A mandatory site visit will be held and only firms that attend", true],
  ["MUST mandatory + to propose", "A mandatory site visit is required for firms wishing to propose", true],
  // MUST NOT MATCH — same shapes, negated. These are the real 4th-site leak.
  ["NOT  non-mandatory + attend", "A NON-MANDATORY site visit will be held and firms may attend", false],
  ["NOT  non-mandatory + to propose", "A NON-MANDATORY site visit will be held for firms wishing to propose", false],
  // The real gold-set sentence does NOT reach this arm in either flag state — recorded so nobody later
  // "fixes" a leak here believing it was the AOC specimen's path. Its path is the pattern-file site.
  ["REAL AOC never reaches this arm", AOC, false],
];
console.log("__J__" + JSON.stringify(CASES.map(([n, t, w]) => ({ n, w, got: re.test(t) }))));
