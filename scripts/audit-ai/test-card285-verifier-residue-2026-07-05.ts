// $0 REGRESSION — Brain card 285 Fix 1: verifier batching + RESIDUE DOCTRINE.
// Proves: (flag OFF) byte-identical old soundness; (flag ON) an UNRESOLVED informational finding does NOT sink
// soundness (marked unverified, kept), an UNRESOLVED verdict-driving (bar / knife-edge) finding DOES → not sound
// (NHR) and is ATTACHED never dropped (Brain's forbidden silent-drop fail-safe); makeBatchedSkeptic covers a
// >batch set and remaps indices, and leaves per-batch residue when the base can't rule everything.
import { makeAgenticVerifier, makeBatchedSkeptic, type SkepticFn } from "@/lib/audit-verifier";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding } from "@/lib/audit-findings";

const SRC = "SECTION C\nThe item shall have a fully enclosed cab.\nThe contractor shall submit a price schedule.\nSECTION I\n252.225-7001 Buy American applies.\nA facility security clearance at the Secret level is required.";
const ctx: AuditToolContext = { fullSource: SRC };
const f = (o: Partial<TypedFinding>): TypedFinding => ({ requirement: o.requirement ?? "r", citation: o.citation ?? "§C", excerpt: o.excerpt ?? "", grounded: true, lens: "x", kind: o.kind ?? "other", controllability: o.controllability ?? "bidder_controls", ...o });

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

// grounded excerpts (must be verbatim substrings of SRC)
const info = f({ requirement: "submit price schedule", excerpt: "shall submit a price schedule", controllability: "bidder_controls", kind: "submission" });
const cab = f({ requirement: "enclosed cab", excerpt: "fully enclosed cab", controllability: "bidder_controls" });
const bar = f({ requirement: "secret clearance", excerpt: "facility security clearance at the Secret level is required", controllability: "bidder_cannot_move", curableInWindow: false });

// skeptic that ONLY rules index 0 → index 1 is the UNRESOLVED residue.
const rulesOnlyFirst: SkepticFn = async () => [{ index: 0, upheld: true, reason: "only first" }];

async function main() {
  // ── FLAG OFF — byte-identical old rule: any unresolved finding ⇒ not sound. ──
  delete process.env.AUDIT_VERIFIER_BATCHING;
  let r = await makeAgenticVerifier(rulesOnlyFirst)(ctx, [cab, info]);
  ok("flag OFF: unresolved informational ⇒ NOT sound (old rule)", r.sound, false);
  ok("flag OFF: nothing silently dropped", r.survived.length, 2);

  // ── FLAG ON — residue doctrine. ──
  process.env.AUDIT_VERIFIER_BATCHING = "true";

  // (A) unresolved INFORMATIONAL (bidder_controls, not knife-edge) ⇒ still SOUND; kept + marked unverified.
  r = await makeAgenticVerifier(rulesOnlyFirst)(ctx, [cab, info]);
  ok("flag ON: unresolved informational ⇒ SOUND (does not sink)", r.sound, true);
  ok("flag ON: informational residue KEPT (not dropped)", r.survived.length, 2);
  ok("flag ON: informational residue marked unverified", r.survived.find((x) => x.requirement === "submit price schedule")?.unverified, true);
  ok("flag ON: resolved finding NOT marked unverified", r.survived.find((x) => x.requirement === "enclosed cab")?.unverified, undefined);
  ok("flag ON: informational residue never in rejected (no silent drop)", r.rejected.some((x) => x.requirement === "submit price schedule"), false);

  // (B) unresolved VERDICT-DRIVING (bar-class) ⇒ NOT sound (→ NHR); ATTACHED to survived, never dropped.
  r = await makeAgenticVerifier(rulesOnlyFirst)(ctx, [cab, bar]);
  ok("flag ON: unresolved bar ⇒ NOT sound (NHR)", r.sound, false);
  ok("flag ON: unresolved bar ATTACHED to survived", r.survived.some((x) => x.requirement === "secret clearance"), true);
  ok("flag ON: unresolved bar NOT in rejected (forbidden silent drop)", r.rejected.some((x) => x.requirement === "secret clearance"), false);
  ok("flag ON: unresolved bar NOT marked unverified", r.survived.find((x) => x.requirement === "secret clearance")?.unverified, undefined);

  // (C) total-overturn is never sound even flag-on.
  const overturnAll: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: false, reason: "no" }));
  r = await makeAgenticVerifier(overturnAll)(ctx, [info]);
  ok("flag ON: total-overturn ⇒ NOT sound (survived empty)", r.sound, false);

  // ── makeBatchedSkeptic — coverage + index remap + residue. ──
  // base that rules EVERY finding it's handed → batched must cover all 5 indices, remapped.
  const ruleAll: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: true, reason: "b" }));
  let vs = await makeBatchedSkeptic(ruleAll, { batchSize: 2 })(ctx, [cab, info, bar, cab, info]);
  ok("batched: rules ALL 5 across 3 batches", vs.map((v) => v.index).sort((a, b) => a - b), [0, 1, 2, 3, 4]);

  // base that rules only the FIRST of each handed set on EVERY attempt → per-batch residue; indices remap correctly.
  let calls = 0;
  const ruleFirstOnly: SkepticFn = async (_c, fs) => { calls++; return fs.length ? [{ index: 0, upheld: true, reason: "first" }] : []; };
  vs = await makeBatchedSkeptic(ruleFirstOnly, { batchSize: 2, retries: 1 })(ctx, [cab, info, bar, cab, info]);
  // 3 batches [0,1][2,3][4]; each: attempt0 rules local0, retry rules the remaining local (which becomes local0 of remainder) → both resolved.
  ok("batched w/ retry: converges to all 5", vs.map((v) => v.index).sort((a, b) => a - b), [0, 1, 2, 3, 4]);

  // base that rules NOTHING → residue is the whole set (absent), never a crash; merged empty.
  const ruleNone: SkepticFn = async () => [];
  vs = await makeBatchedSkeptic(ruleNone, { batchSize: 2, retries: 1 })(ctx, [cab, info, bar]);
  ok("batched: base rules nothing ⇒ empty merged (pure residue, no crash)", vs.length, 0);

  console.log(`\ncard285 Fix1 verifier residue — ${pass} passed, ${fails.length} failed`);
  for (const x of fails) console.log("  ✗ " + x);
  process.exit(fails.length ? 1 : 0);
}
main();
