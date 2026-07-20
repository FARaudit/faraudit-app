// Card #609 DRY cert — sharded skeptic truncation fix. $0, stub skeptics only (NO paid calls).
import * as fs from "fs";
import { makeShardedSkeptic, makeAgenticVerifier, type SkepticFn, type SkepticVerdict } from "../../src/lib/audit-verifier";
import { salvageVerdictsPrefix, parseSkepticResponsePartial } from "../../src/lib/audit-package";
import type { AuditToolContext } from "../../src/lib/audit-tools";

process.env.AUDIT_BANK_RUN_RECORD = "true";
process.env.AUDIT_VERIFIER_SHARDED = "true";

const rec = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const findings = rec.result.findings as any[];
const fullSource = rec.input.fullSource ?? rec.input.groundingSource ?? "";
const ctx: AuditToolContext = { fullSource, sections: rec.input.sections ?? [], groundingSource: rec.input.groundingSource, noticeBodyText: rec.input.noticeBodyText } as any;

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

// ---- T1: salvageVerdictsPrefix recovers complete elements from a TRUNCATED array ----
const truncated = '{"verdicts":[{"index":0,"upheld":true,"reason":"ok"},{"index":1,"upheld":false,"reason":"drop"},{"index":2,"upheld":tru';
const sal = salvageVerdictsPrefix(truncated);
ok("T1 salvage prefix: 2 complete of 3 truncated", sal.length === 2 && sal[0].index === 0 && sal[1].index === 1, `got ${sal.length}`);
const clean = '{"verdicts":[{"index":0,"upheld":true,"reason":"a"},{"index":1,"upheld":true,"reason":"b"}]}';
ok("T1b salvage clean: recovers all", salvageVerdictsPrefix(clean).length === 2);

// ---- T2: parseSkepticResponsePartial returns prefix on max_tokens (does NOT throw) ----
let threw = false; let partial: any;
try { partial = parseSkepticResponsePartial({ text: truncated, stopReason: "max_tokens" }, "stub"); } catch { threw = true; }
ok("T2 partial parse on max_tokens: salvages, no throw", !threw && partial.verdicts.length === 2);
// clean stop still strict-throws on garbage (card 274 preserved)
let threw2 = false; try { parseSkepticResponsePartial({ text: "not json", stopReason: "end_turn" }, "stub"); } catch { threw2 = true; }
ok("T2b partial parse clean-stop garbage still throws", threw2);

// ---- T3: cab687da 100-claim replay — stub rules EVERY finding → sound, all ruled ----
const stubAll: SkepticFn = async (_c, fs2) => fs2.map((_f, i): SkepticVerdict => ({ index: i, upheld: true, reason: "stub-uphold" }));
const shardedAll = makeShardedSkeptic(stubAll, { shardSize: 15 });
const verifyAll = makeAgenticVerifier(shardedAll);
(async () => {
  const r: any = await verifyAll(ctx, findings as any);
  const grounded = r.ledger?.counts?.grounded ?? 0;
  ok("T3 replay: verifierSound=true", r.sound === true, `sound=${r.sound}`);
  ok("T3 replay: all grounded ruled (residue 0)", r.ledger?.counts?.unresolvedTotal === 0 && r.ledger?.counts?.ruled === grounded, `ruled=${r.ledger?.counts?.ruled}/${grounded} unresolved=${r.ledger?.counts?.unresolvedTotal}`);
  ok("T3 replay: findings count preserved", r.survived.length === grounded, `survived=${r.survived.length} grounded=${grounded}`);
  console.log(`   (input findings=${findings.length}, grounded=${grounded}, shards=${Math.ceil(grounded/15)})`);

  // ---- T4: salvage+re-request — shard base drops its LAST verdict on first attempt, full on retry ----
  const attemptByLen: Record<number, number> = {};
  const stubSalvage: SkepticFn = async (_c, fs2) => {
    const n = fs2.length; attemptByLen[n] = (attemptByLen[n] ?? 0) + 1;
    const drop = attemptByLen[n] === 1 ? 1 : 0; // first time we see this remainder-size, drop last (simulate truncation prefix)
    return fs2.slice(0, n - drop).map((_f, i): SkepticVerdict => ({ index: i, upheld: true, reason: "salv" }));
  };
  const shardedSalv = makeShardedSkeptic(stubSalvage, { shardSize: 15, retries: 2 });
  const rSalv: any = await makeAgenticVerifier(shardedSalv)(ctx, findings as any);
  ok("T4 salvage+re-request converges to sound", rSalv.sound === true && rSalv.ledger?.counts?.unresolvedTotal === 0, `sound=${rSalv.sound} unresolved=${rSalv.ledger?.counts?.unresolvedTotal}`);

  // ---- T5 (card #609-(8) part 5): incomplete coverage now THROWS (real assert, not log) → NHR, not silent partial ----
  const skipIds = new Set([findings[3].id, findings[7].id]);
  const stubSkip: SkepticFn = async (_c, fs2) => fs2.map((f, i): SkepticVerdict | null => skipIds.has((f as any).id) ? null : ({ index: i, upheld: true, reason: "ok" })).filter(Boolean) as SkepticVerdict[];
  const rSkip: any = await makeAgenticVerifier(makeShardedSkeptic(stubSkip, { shardSize: 15 }))(ctx, findings as any);
  ok("T5 coverage gap THROWS → sound=false (NHR), not silent partial", rSkip.sound === false && rSkip.ledger?.failureMode === "skeptic_throw", `sound=${rSkip.sound} mode=${rSkip.ledger?.failureMode}`);

  // ---- T6: ≤15 hard cap (request 20 → clamps to 15) ----
  let maxShardSeen = 0;
  const stubMeasure: SkepticFn = async (_c, fs2) => { maxShardSeen = Math.max(maxShardSeen, fs2.length); return fs2.map((_f, i): SkepticVerdict => ({ index: i, upheld: true, reason: "m" })); };
  await makeShardedSkeptic(stubMeasure, { shardSize: 20 })(ctx, findings.slice(0, 40) as any);
  ok("T6 ≤15 hard cap on shardSize", maxShardSeen <= 15, `maxShard=${maxShardSeen}`);

  // ---- T7 (card #609-(8) part 5): SMALL-SET (≤shardSize) truncation is NOT bypassed — card-274 contract holds ----
  // A ≤15 set whose base truncates on EVERY attempt (never rules the tail) → coverage gap → throw → NHR.
  const small = findings.slice(0, 10);
  const stubSmallTrunc: SkepticFn = async (_c, fs2) => fs2.slice(0, fs2.length - 1).map((_f, i): SkepticVerdict => ({ index: i, upheld: true, reason: "t" })); // always drops the last → never converges
  const rSmall: any = await makeAgenticVerifier(makeShardedSkeptic(stubSmallTrunc, { shardSize: 15, retries: 2 }))(ctx, small as any);
  ok("T7 small-set persistent truncation → sound=false (no fast-path bypass)", rSmall.sound === false, `sound=${rSmall.sound}`);

  // ---- T8 (card #609-(8) part 5): stale full-set escalateIdx is NOT forwarded into per-shard base calls ----
  let sawEscalate = false;
  const stubOptsProbe: SkepticFn = async (_c, fs2, o) => { if (o && (o as any).escalateIdx) sawEscalate = true; return fs2.map((_f, i): SkepticVerdict => ({ index: i, upheld: true, reason: "o" })); };
  await makeShardedSkeptic(stubOptsProbe, { shardSize: 15 })(ctx, findings as any, { escalateIdx: [0, 1, 2, 99] });
  ok("T8 escalateIdx NOT forwarded into shard base calls", sawEscalate === false);

  // ---- T9 (card #611): LATENCY-SHAPED — parallel shards (cap 4) beat sequential N×latency ----
  const SLEEP = 80;
  const sleepStub: SkepticFn = async (_c, fs2) => { await new Promise((r) => setTimeout(r, SLEEP)); return fs2.map((_f, i): SkepticVerdict => ({ index: i, upheld: true, reason: "s" })); };
  const big = findings.slice(0, 90); // 90 findings @ shardSize 15 → 6 shards
  const t0 = performance.now();
  await makeShardedSkeptic(sleepStub, { shardSize: 15 })(ctx, big as any);
  const elapsed = performance.now() - t0;
  const seqEstimate = 6 * SLEEP; // 6 shards sequential
  const parEstimate = Math.ceil(6 / 4) * SLEEP; // cap 4 → 2 waves
  ok("T9 parallel shards << sequential (6 shards, cap 4)", elapsed < seqEstimate * 0.6, `elapsed=${Math.round(elapsed)}ms seq≈${seqEstimate}ms par≈${parEstimate}ms`);

  // ---- T10 (card #611): DETERMINISM — same input → byte-identical merged output (order independent of completion) ----
  const detStub: SkepticFn = async (_c, fs2) => fs2.map((f, i): SkepticVerdict => ({ index: i, upheld: (f as any).id?.length % 2 === 0, reason: `r${i}` }));
  const r1 = JSON.stringify(await makeShardedSkeptic(detStub, { shardSize: 15 })(ctx, findings as any));
  const r2 = JSON.stringify(await makeShardedSkeptic(detStub, { shardSize: 15 })(ctx, findings as any));
  ok("T10 determinism: parallel merge is byte-identical across runs", r1 === r2 && JSON.parse(r1).length === findings.length);

  console.log(`\n=== CERT: ${pass} pass / ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})();
