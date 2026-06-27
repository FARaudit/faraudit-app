// $0 gate for the P2 ADVERSARIAL VERIFIER (Brain card 43). Proves: deterministic re-grounding drops
// ungrounded findings; the skeptic overturns misclassifications; an INCOMPLETE challenge ⇒ not sound.
import { makeAgenticVerifier, makeTieredSkeptic, type SkepticFn } from "@/lib/audit-verifier";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding } from "@/lib/audit-findings";

const SRC = "SECTION C\nThe item shall have a fully enclosed cab.\nSECTION I\n252.225-7001 Buy American applies.";
const ctx: AuditToolContext = { fullSource: SRC };
const f = (o: Partial<TypedFinding>): TypedFinding => ({ requirement: o.requirement ?? "r", citation: o.citation ?? "§C", excerpt: o.excerpt ?? "", grounded: true, lens: "x", kind: o.kind ?? "other", controllability: o.controllability ?? "bidder_controls", ...o });

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

async function main() {
  const grounded = f({ requirement: "enclosed cab", excerpt: "fully enclosed cab", controllability: "bidder_controls" });
  const ungrounded = f({ requirement: "ghost req", excerpt: "text that is not in the source at all" });
  const misclassified = f({ requirement: "cab as disqualifier", excerpt: "fully enclosed cab", controllability: "bidder_cannot_move" });

  // skeptic that upholds everything it's handed
  const upholdAll: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: true, reason: "ok" }));
  // skeptic that overturns any bidder_cannot_move it's handed (catching the misclassification)
  const overturnCannotMove: SkepticFn = async (_c, fs) => fs.map((x, i) => ({ index: i, upheld: x.controllability !== "bidder_cannot_move", reason: "classification" }));
  // skeptic that only rules on the first finding (incomplete challenge)
  const incomplete: SkepticFn = async () => [{ index: 0, upheld: true, reason: "only one" }];
  // skeptic that throws (challenge failed)
  const broken: SkepticFn = async () => { throw new Error("model down"); };

  // (1) deterministic re-grounding drops the ungrounded finding before the skeptic even sees it
  let r = await makeAgenticVerifier(upholdAll)(ctx, [grounded, ungrounded]);
  ok("ungrounded dropped by re-grounding", r.survived.map((x) => x.requirement), ["enclosed cab"]);
  ok("ungrounded listed as rejected", r.rejected.map((x) => x.requirement), ["ghost req"]);
  ok("sound when skeptic ruled on all grounded", r.sound, true);

  // (2) skeptic overturns the misclassified finding
  r = await makeAgenticVerifier(overturnCannotMove)(ctx, [grounded, misclassified]);
  ok("misclassified finding overturned", r.survived.map((x) => x.requirement), ["enclosed cab"]);
  ok("overturned listed as rejected", r.rejected.map((x) => x.requirement), ["cab as disqualifier"]);

  // (3) incomplete challenge ⇒ not sound (→ deriveVerdict routes to NEEDS_HUMAN_REVIEW)
  r = await makeAgenticVerifier(incomplete)(ctx, [grounded, misclassified]);
  ok("incomplete challenge ⇒ not sound", r.sound, false);

  // (4) skeptic throws ⇒ not sound, findings preserved (honest fail, no silent drop)
  r = await makeAgenticVerifier(broken)(ctx, [grounded]);
  ok("skeptic failure ⇒ not sound", r.sound, false);
  ok("skeptic failure preserves grounded findings", r.survived.length, 1);

  // (5) capability-tiered skeptic (Brain card-44 §4): Opus escalation only on CONTESTED (overturned) findings.
  let baseCalls = 0, escCalls = 0, escSeen = 0;
  const base: SkepticFn = async (_c, fs) => { baseCalls++; return fs.map((x, i) => ({ index: i, upheld: x.controllability !== "bidder_cannot_move", reason: "base" })); };
  const escalate: SkepticFn = async (_c, fs) => { escCalls++; escSeen = fs.length; return fs.map((_x, i) => ({ index: i, upheld: true, reason: "opus overrules — actually fine" })); };
  const tiered = makeTieredSkeptic(base, escalate);
  // one bidder_cannot_move finding (base overturns) + one normal (base upholds) → escalate sees ONLY the 1 contested.
  let r5 = await tiered(ctx, [grounded, misclassified]);
  ok("base ran once", baseCalls, 1);
  ok("escalation ran once (contested present)", escCalls, 1);
  ok("escalation saw ONLY the 1 contested finding (Opus bounded)", escSeen, 1);
  ok("escalation overrules base → contested finding upheld", r5.find((v) => v.index === 1)?.upheld, true);
  ok("uncontested finding keeps base ruling", r5.find((v) => v.index === 0)?.upheld, true);
  // no contest → Opus never spent
  escCalls = 0;
  await tiered(ctx, [grounded]);
  ok("no contested findings → escalation NOT called (no Opus spend)", escCalls, 0);

  // (6) KNIFE-EDGE escalation (Brain card-49/§4): a verdict-decisive bar escalates to Opus even when the
  // base skeptic UPHOLDS it — the BID↔CAUTION/CAUTION↔NO_BID driver always gets the second opinion.
  let ke = -1;
  const upholdAll2: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: true, reason: "base ok" }));
  const escTrack: SkepticFn = async (_c, fs) => { ke = fs.length; return fs.map((_x, i) => ({ index: i, upheld: true, reason: "opus" })); };
  await makeTieredSkeptic(upholdAll2, escTrack)(ctx, [grounded, misclassified]); // grounded=bidder_controls, misclassified=bidder_cannot_move
  ok("knife-edge: disqualifying bar escalates to Opus even when base upholds it", ke, 1);
  ke = -1;
  await makeTieredSkeptic(upholdAll2, escTrack)(ctx, [grounded]); // pure bidder_controls, base upholds → nothing decisive
  ok("no bar + no overturn → no Opus spend (knife-edge bounded)", ke, -1);

  console.log(`verifier gate: ${pass}/${pass + fails.length} pass`);
  if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
  console.log("✅ ALL PASS — re-grounding + adversarial overturn + honest-fail on incomplete/failed challenge.");
}
main();
