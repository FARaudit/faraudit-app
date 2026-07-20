/* RED-TEAM R3-2 — ATTACK 2: cautionFloor gain/loss across the merge. (a) OR-preservation both directions on
 * DOMAIN-VALID inputs; (b) the VALUE-DOMAIN probe (R2 memory doctrine): a TRUTHY-but-not-true cautionFloor
 * ("yes" — findings are blind-cast model output, no runtime enum/type enforcement). deriveVerdict reads
 * `f.cautionFloor === true` (strict); the merge reads `members.some(f => f.cautionFloor)` (truthy) and then
 * writes LITERAL true onto the survivor — the gate LAUNDERS an off-domain value into a verdict-live one. */
import { applyCrossFleetDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let fails = 0;
const ok = (c: boolean, msg: string) => { console.log(`${c ? "✅" : "❌ BREAK"} ${msg}`); if (!c) fails++; };
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as VerdictInputs);
const tuple = (fs: TypedFinding[]) => { const d = deriveVerdict(vi(fs)); return `${d.verdict}/${d.eligible}/${d.showStoppers.length}`; };
const run = (fs: TypedFinding[]) => applyCrossFleetDedup(fs, { enabled: true });

// (a1) member true + anchor undefined → survivor must floor (GAIN is correct: the true-bearer existed OFF-path too).
{
  const a = F({ requirement: "Prices held firm through July 22, 2026." });
  const b = F({ requirement: "Hold pricing firm until July 22, 2026 receipt.", cautionFloor: true });
  const off = tuple([a, b]); const on = tuple(run([a, b]));
  ok(off === on && on.startsWith("BID_WITH_CAUTION"), `a1: true member OR-preserved, both paths floor (OFF=${off} ON=${on})`);
}
// (a2) neither member floored → survivor must NOT gain a floor.
{
  const a = F({ requirement: "Offer due July 22, 2026 A." });
  const b = F({ requirement: "Offer due July 22, 2026 B." });
  const off = tuple([a, b]); const on = tuple(run([a, b]));
  ok(off === on && on.startsWith("BID/"), `a2: no member floored ⇒ no gained floor (OFF=${off} ON=${on})`);
}
// (a3) member cautionFloor === false explicit on the WORST member, other true → still floors both paths.
{
  const a = F({ requirement: "Offer due July 22, 2026 with pricing volume attached and signed.", cautionFloor: false, severity: "P1" });
  const b = F({ requirement: "Offer due July 22, 2026.", cautionFloor: true, severity: "P2" });
  const off = tuple([a, b]); const on = tuple(run([a, b]));
  ok(off === on && on.startsWith("BID_WITH_CAUTION"), `a3: floor survives worst-member cautionFloor:false (OFF=${off} ON=${on})`);
}
// (b) VALUE-DOMAIN: cautionFloor = "yes" (truthy, not true — off-domain model output; key IS in FD_ABSORBABLE_KEYS
// so the bearer is absorbable). OFF: `=== true` fails → no floor → BID. ON: some(truthy) → survivor cautionFloor:true
// (LITERAL) → floor → BID_WITH_CAUTION. Same laundering class as the R2 off-enum ctrl P1.
{
  const a = F({ requirement: "Offer due July 22, 2026 A." });
  const b = F({ requirement: "Offer due July 22, 2026 B.", cautionFloor: "yes" as unknown as boolean });
  const off = tuple([a, b]);
  const merged = run([a, b]);
  const on = tuple(merged);
  console.log(`   (b): OFF=${off}  ON=${on}  survivor.cautionFloor=${JSON.stringify((merged[0] as any).cautionFloor)} (member had "yes")`);
  ok(off === on, `b: off-domain truthy cautionFloor must not flip the verdict (OFF=${off} ON=${on})`);
}
// (b2) same probe on `grounded` (truthy string) — verdict must be invariant (grounded not verdict-read on plains).
{
  const a = F({ requirement: "Offer due July 22, 2026 A.", grounded: "verbatim" as unknown as boolean });
  const b = F({ requirement: "Offer due July 22, 2026 B.", grounded: false });
  const off = tuple([a, b]); const on = tuple(run([a, b]));
  ok(off === on, `b2: off-domain grounded value verdict-invariant (OFF=${off} ON=${on})`);
}

console.log(fails === 0 ? "\nR3-2: ALL PASS (no break)" : `\nR3-2: ${fails} BREAK(S)`);
process.exit(0);
