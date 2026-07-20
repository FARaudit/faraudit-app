/* RED-TEAM unit6cf #1 — BREAK ATTEMPTS against applyCrossFleetDedup safety claims.
 * Each case states the claim under attack, the constructed input, and asserts the INVARIANT (so a ❌ = a real break). */
import { applyCrossFleetDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { VerdictInputs } from "../../src/lib/audit-findings";

let breaks = 0;
const inv = (holds: boolean, msg: string) => { console.log(`${holds ? "✅ holds" : "💥 BREAK"} ${msg}`); if (!holds) breaks++; };
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const run = (fs: TypedFinding[]) => applyCrossFleetDedup(fs, { enabled: true });
const vi = (fs: TypedFinding[]): VerdictInputs => ({ findings: fs, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source: "" });
const vtuple = (fs: TypedFinding[]) => { const d = deriveVerdict(vi(fs)); return `${d.verdict}/${d.eligible}/${d.showStoppers.length}`; };

// ─── ATTACK 1 (CLAIM 1: VERDICT-SAFE) ─ boilerplate+bidder_controls (ctrl rank 2) absorbs the set's ONLY
// decision-bearing row (submission+already_satisfied, ctrl rank 1). worst-sort is ctrl FIRST, kind SECOND,
// so the survivor takes kind="boilerplate" → disposeFinding=dropped → step-2b materially-empty NHR.
{
  const a = F({ kind: "boilerplate", controllability: "bidder_controls", requirement: "Standard notice: offers due July 22, 2026 per instructions" });
  const b = F({ kind: "submission", controllability: "already_satisfied", requirement: "Electronic submission portal registration for the July 22, 2026 deadline is complete" });
  const off = vtuple([a, b]);
  const on = vtuple(run([a, b]));
  console.log(`   [attack1] OFF=${off}  ON=${on}  survivorKind=${run([a, b])[0]?.kind} survivorDisp=${run([a, b]).length} rows`);
  inv(off === on, `CLAIM 1 verdict OFF==ON on mixed boilerplate/decision-bearing same-date plains (OFF=${off} ON=${on})`);
}

// ─── ATTACK 2 (CLAIM 3: NO TEXT LOSS) ─ negation distinguisher "no" is a 2-char digitless token that
// fdNormTokens DISCARDS → the negated obligation is judged a restatement of its un-negated sibling → dropped.
{
  const a = F({ requirement: "No extensions granted after July 22, 2026" });
  const b = F({ requirement: "Extensions granted after July 22, 2026 upon written request" });
  const out = run([a, b]);
  const txt = out.map((f) => f.requirement).join(" ||| ");
  console.log(`   [attack2] survivor requirement: "${txt}"`);
  inv(/\bno extensions\b/i.test(txt), `CLAIM 3 negated facet "No extensions" survives merge (got: "${txt}")`);
}

// ─── ATTACK 3 (CLAIM 3: NO TEXT LOSS) ─ 2-char alpha distinguishers (Phase II, QA, IT) invisible to fdNormTokens.
{
  const a = F({ requirement: "Phase II deliverables due July 22, 2026" });
  const b = F({ requirement: "The phase deliverables due July 22, 2026 with all attachments" });
  const out = run([a, b]);
  const txt = out.map((f) => f.requirement).join(" ||| ");
  console.log(`   [attack3] survivor requirement: "${txt}"`);
  inv(/phase ii/i.test(txt), `CLAIM 3 "Phase II" distinguisher survives merge (got: "${txt}")`);
}

// ─── ATTACK 4 (CLAIM 4: regex soundness / over-merge key) ─ citation carries the AMENDMENT ISSUANCE DATE
// (not a deadline). Two UNRELATED obligations citing the same amendment fuse on the document date.
{
  const a = F({ requirement: "Provide key personnel resumes with the technical volume", citation: "Amendment 0002, dated 07/15/2026, Section L.4" });
  const b = F({ requirement: "Small business subcontracting plan required with the offer", citation: "Amendment 0002, dated 07/15/2026, Section L.9" });
  const out = run([a, b]);
  console.log(`   [attack4] rows=${out.length} mergedDateSig=${(out[0] as any).mergedDateSig ?? "-"}`);
  inv(out.length === 2, `CLAIM 4 unrelated obligations citing the same amendment DATE do not fuse (got ${out.length} row(s))`);
}

// ─── ATTACK 5 (CLAIM 4: false date-match) ─ no month/day range validation: "13/13/2026" (not a calendar date)
// still anchors and merges two findings on a bogus key.
{
  const a = F({ requirement: "Refer to exhibit numbering 13/13/2026 for the item breakout" });
  const b = F({ requirement: "Line items enumerated 13/13/2026 in the continuation sheet" });
  const out = run([a, b]);
  console.log(`   [attack5] rows=${out.length} key=${(out[0] as any).mergedDateSig ?? "-"}`);
  inv(out.length === 2, `CLAIM 4 non-calendar "13/13/2026" (month 13) is not a merge anchor (got ${out.length} row(s))`);
}

// ─── ATTACK 6 (CLAIM 4: recall) ─ DoD day-first "22 July 2026" — the dominant DoD format — is unanchored,
// so the gate's core dedup mission fails on DoD records (verdict-inert under-merge, efficacy gap only).
{
  const a = F({ requirement: "Offers due no later than 2:00 PM CT on 22 July 2026" });
  const b = F({ requirement: "Proposals must arrive by 22 July 2026" });
  const out = run([a, b]);
  inv(out.length === 2, `CLAIM 4 (informational): day-first "22 July 2026" does NOT anchor (rows=${out.length}; under-merge = safe direction, but zero dedup on DoD-format records)`);
}

// ─── ATTACK 7 (CLAIM 4: ReDoS) ─ adversarial repetition around the alternation.
{
  const evil = ("jul " + "1 ".repeat(30000)) + "x" + " 12-12-".repeat(20000) + "9999";
  const f1 = F({ requirement: evil });
  const f2 = F({ requirement: evil });
  const t0 = Date.now();
  run([f1, f2]);
  const ms = Date.now() - t0;
  inv(ms < 2000, `CLAIM 4 no catastrophic backtracking on ${evil.length}-char adversarial blob (${ms}ms)`);
}

// ─── ATTACK 8 (CLAIM 2: PROTECTED PASSTHROUGH) ─ bar + every marker key, same date as a mergeable plain pair;
// also a clause-gate survivor (findingDedupMerged) must be protected in THIS gate (CLAIM 5 ordering).
{
  const bar = F({ requirement: "Active TS facility clearance required at offer, due July 22, 2026", controllability: "no_one_can_move", kind: "eligibility_bar", severity: "P0", curableInWindow: false });
  const marker = F({ requirement: "WOSB status verification due July 22, 2026", requiredAttribute: "setaside:WOSB" } as any);
  const clauseSurvivor = F({ requirement: "Clause obligations consolidated for July 22, 2026", findingDedupMerged: true, mergedLensCount: 2, mergedClause: "52.212-1" } as any);
  const p1 = F({ requirement: "Submit offer by July 22, 2026 via SAM.gov" });
  const p2 = F({ requirement: "Quotations accepted through July 22, 2026 only" });
  const out = run([bar, marker, clauseSurvivor, p1, p2]);
  inv(out.includes(bar) && out.includes(marker) && out.includes(clauseSurvivor), `CLAIM 2/5 bar + marker + clause-survivor all pass through BY REFERENCE`);
  inv(out.filter((f) => (f as any).crossFleetMerged).length === 1 && out.length === 4, `CLAIM 2/5 only the plain pair merged (rows=${out.length})`);
}

// ─── ATTACK 9 (CLAIM 1 stress) ─ verdict OFF==ON across a randomized fuzz sweep of plain-only sets.
{
  const kinds = ["other", "submission", "boilerplate", "pricing", "technical"];
  const ctrls = ["bidder_controls", "already_satisfied"];
  const dates = ["July 22, 2026", "07/22/2026", "July 14, 2026", ""];
  let diverged = 0; let first = "";
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let t = 0; t < 500; t++) {
    const n = 2 + Math.floor(rnd() * 4);
    const set = Array.from({ length: n }, (_, i) => F({
      kind: kinds[Math.floor(rnd() * kinds.length)] as any,
      controllability: ctrls[Math.floor(rnd() * ctrls.length)] as any,
      requirement: `Obligation ${i} token${Math.floor(rnd() * 3)} due ${dates[Math.floor(rnd() * dates.length)]}`,
      ...(rnd() < 0.2 ? { cautionFloor: true } : {}),
    } as any));
    const off = vtuple(set); const on = vtuple(run(set));
    if (off !== on) { diverged++; if (!first) first = `n=${n} OFF=${off} ON=${on} reqs=${set.map((f) => `${f.kind}/${f.controllability}`).join(",")}`; }
  }
  inv(diverged === 0, `CLAIM 1 fuzz: 500 random plain sets, ${diverged} divergences${first ? ` — first: ${first}` : ""}`);
}

console.log(breaks === 0 ? "\nNO BREAKS FOUND" : `\n${breaks} INVARIANT BREAK(S) CONFIRMED`);
process.exit(0);
