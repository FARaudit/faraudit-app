// $0 regression gate for the two VERDICT-EMITTER run-blockers ruled by Brain card 274 (2026-07-05).
//  RULING 1 (audit-verifier.ts): a REFUTED finding with an empty/non-substantive corrected:{} must be DROPPED,
//           never resurrected unchanged (the false INELIGIBLE/NO_BID hole). Re-type ONLY on a substantive
//           correction. Every drop is persisted to correctedDrops (telemetry-visible).
//  RULING 2 (audit-verifier.ts makeTieredSkeptic + audit-package.ts parseSkepticResponse): NEVER pass through
//           the lenient base type on an unresolved knife-edge. A truncated/unparseable skeptic response throws
//           (no {verdicts:[]} swallow); an escalation that doesn't cover the contested set throws. Both land at
//           makeAgenticVerifier's catch → sound:false → NHR with the grounded set attached.
// Run: npx tsx scripts/audit-ai/test-card274-verdict-emitters-2026-07-05.ts
import { makeAgenticVerifier, makeTieredSkeptic, type SkepticFn } from "@/lib/audit-verifier";
import { parseSkepticResponse } from "@/lib/audit-package";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding } from "@/lib/audit-findings";

const SRC = "SECTION C\nThe item shall have a fully enclosed cab.\nSECTION L\nProposals shall not exceed 40 pages.";
const ctx: AuditToolContext = { fullSource: SRC };
const f = (o: Partial<TypedFinding>): TypedFinding => ({ requirement: o.requirement ?? "r", citation: o.citation ?? "§C", excerpt: o.excerpt ?? "fully enclosed cab", grounded: true, lens: "x", kind: o.kind ?? "eligibility_bar", controllability: o.controllability ?? "bidder_cannot_move", ...o });

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`); cond ? pass++ : fail++; };

async function main() {
  const bar = f({ requirement: "gate-bar", excerpt: "fully enclosed cab", controllability: "bidder_cannot_move" });

  // ── RULING 1 — corrected-resurrects ──────────────────────────────────────────────────────────────────
  console.log("RULING 1 — refuted-with-empty-corrected must DROP, not resurrect");

  // (A) THE BUG: skeptic REFUTES (upheld=false) but returns an empty corrected:{} → must be DROPPED.
  const refuteEmptyCorrected: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: false, reason: "not actually a bar", corrected: {} }));
  let r = await makeAgenticVerifier(refuteEmptyCorrected)(ctx, [bar]);
  check("refuted + empty corrected:{} → finding DROPPED (not resurrected)", r.survived.length === 0, `survived=${JSON.stringify(r.survived.map((x) => x.requirement))}`);
  check("refuted + empty corrected:{} → listed as rejected", r.rejected.some((x) => x.requirement === "gate-bar"));
  check("refuted + empty corrected:{} → sound:false (no lone false bar survives)", r.sound === false);
  check("drop persisted to correctedDrops with dropReason=empty_corrected", (r.correctedDrops ?? []).some((d) => d.dropReason === "empty_corrected" && d.requirement === "gate-bar"));
  check("drop record carries the refutation reason (telemetry)", (r.correctedDrops ?? [])[0]?.refutation === "not actually a bar");

  // (B) SUBSTANTIVE correction still RE-TYPES (survives with the corrected controllability).
  const retypeSubstantive: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: false, reason: "re-type", corrected: { controllability: "bidder_controls" as const } }));
  r = await makeAgenticVerifier(retypeSubstantive)(ctx, [bar]);
  check("substantive corrected → RE-TYPED, survives", r.survived.length === 1 && r.survived[0].controllability === "bidder_controls");
  check("substantive corrected → NOT recorded as a drop", (r.correctedDrops ?? []).length === 0);

  // (C) upheld=true with an empty corrected:{} → survives UNCHANGED, no drop (old code also survived — parity).
  const upholdEmptyCorrected: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: true, reason: "stands", corrected: {} }));
  r = await makeAgenticVerifier(upholdEmptyCorrected)(ctx, [bar]);
  check("upheld + empty corrected:{} → survives unchanged", r.survived.length === 1 && r.survived[0].controllability === "bidder_cannot_move");
  check("upheld + empty corrected:{} → not a drop", (r.correctedDrops ?? []).length === 0);

  // (D) plain overturn (no corrected) → dropReason=overturned.
  const plainOverturn: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: false, reason: "boilerplate" }));
  r = await makeAgenticVerifier(plainOverturn)(ctx, [bar]);
  check("plain overturn → dropReason=overturned", (r.correctedDrops ?? [])[0]?.dropReason === "overturned");

  // ── RULING 2 — no lenient pass-through on an unresolved knife-edge ────────────────────────────────────
  console.log("\nRULING 2 — tiered escalation fail-safe + no empty-swallow");
  const normal = f({ requirement: "normal", excerpt: "fully enclosed cab", controllability: "bidder_controls", kind: "technical_spec" });

  // (E) escalation returns EMPTY for a contested finding → throw → verifier NHR (sound:false, grounded attached).
  const baseOverturns: SkepticFn = async (_c, fs) => fs.map((x, i) => ({ index: i, upheld: x.controllability !== "bidder_cannot_move", reason: "base" }));
  const escEmpty: SkepticFn = async () => [];
  const tieredEmpty = makeTieredSkeptic(baseOverturns, escEmpty);
  r = await makeAgenticVerifier(tieredEmpty)(ctx, [bar, normal]);
  check("escalation empty on contested set → sound:false (NHR, no lenient pass-through)", r.sound === false);
  check("escalation empty on contested set → grounded findings preserved (contested set attached)", r.survived.length >= 1);

  // (F) escalation covers ALL contested → normal resolution (sound depends on survival), no throw.
  const escUpholds: SkepticFn = async (_c, fs) => fs.map((_x, i) => ({ index: i, upheld: true, reason: "opus: fine" }));
  const tieredFull = makeTieredSkeptic(baseOverturns, escUpholds);
  r = await makeAgenticVerifier(tieredFull)(ctx, [bar, normal]);
  check("escalation covers all contested → no throw, run resolves sound", r.sound === true && r.survived.length === 2);

  // (G) PARTIAL escalation (two contested, rules on only one) → throw → NHR.
  const bar2 = f({ requirement: "gate-bar-2", excerpt: "fully enclosed cab", controllability: "bidder_cannot_move" });
  const escPartial: SkepticFn = async () => [{ index: 0, upheld: true, reason: "only ruled on one contested" }];
  const tieredPartial = makeTieredSkeptic(baseOverturns, escPartial);
  r = await makeAgenticVerifier(tieredPartial)(ctx, [bar, bar2]);
  check("escalation partial-cover of contested set → sound:false (NHR)", r.sound === false);

  // (H) parseSkepticResponse — truncation / unparseable / missing-verdicts all THROW; valid passes.
  console.log("\nRULING 2 — parseSkepticResponse never swallows to {verdicts:[]}");
  const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
  check("max_tokens truncation → throws (no empty-swallow)", throws(() => parseSkepticResponse({ text: '{"verdicts":[{"index":0,"upheld":true', stopReason: "max_tokens" }, "m")));
  check("unparseable JSON → throws", throws(() => parseSkepticResponse({ text: "not json at all", stopReason: "end_turn" }, "m")));
  check("missing verdicts[] → throws", throws(() => parseSkepticResponse({ text: '{"foo":1}', stopReason: "end_turn" }, "m")));
  const okParsed = parseSkepticResponse({ text: '{"verdicts":[{"index":0,"upheld":true,"reason":"ok"}]}', stopReason: "end_turn" }, "m");
  check("valid response → parses through", okParsed.verdicts.length === 1 && okParsed.verdicts[0].upheld === true);
  // a LEGITIMATE empty verdicts array (valid JSON, not truncated) passes — the contested-coverage gate (E/G) is
  // what catches an empty-on-contested-set, not the parser.
  check("valid but empty verdicts[] → passes the parser (coverage gate governs, not the parser)", parseSkepticResponse({ text: '{"verdicts":[]}', stopReason: "end_turn" }, "m").verdicts.length === 0);

  console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
