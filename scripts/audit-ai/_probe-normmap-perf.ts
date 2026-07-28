// $0 measurement of review-round-5 finding #3 — is normMap-per-finding actually costly at production scale?
// The FIRST version of this probe reported 0ms and repaired=0: the flag was unset (the pass returns early) and
// every excerpt was identical, so each one hit "occurs more than once". An inert probe reporting a fast time is
// the placebo shape — a measurement has to reach the code it claims to measure.
process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";
import { repairHeadClippedExcerpts } from "@/lib/audit-excerpt-repair";

const FILLER = "The Government reserves the right to make multiple awards under this solicitation. ";
// 40 UNIQUE head-clipped excerpts, each occurring exactly once, each starting mid-clause after a wrap.
const parts: string[] = [];
for (let i = 0; i < 40; i++) {
  parts.push(FILLER.repeat(Math.ceil(47_000 / FILLER.length)));
  parts.push(`Contract line item ${i} requires the offeror to deliver widget model ${i} within thirty days after receipt of order and\nto certify conformance of unit ${i} to the applicable specification before final acceptance.\n`);
}
const src = parts.join("");
const findings = Array.from({ length: 40 }, (_, i) => ({
  id: `x#${i}`, lens: "pricing_analyst",
  excerpt: `to certify conformance of unit ${i} to the applicable specification before final acceptance.`,
  requirement: "r", citation: "c", kind: "pricing", controllability: "bidder_controls", grounded: true,
})) as never;

const t0 = Date.now();
const res = repairHeadClippedExcerpts(findings, src, {}) as { repaired: number; unrepairable: number; skipped: unknown[] };
const ms = Date.now() - t0;
console.log(`source ${(src.length / 1e6).toFixed(2)}MB · findings 40 · ${ms}ms · repaired=${res.repaired} unrepairable=${res.unrepairable} skipped=${res.skipped.length}`);
if (res.repaired === 0) console.log("⚠ INERT — nothing was repaired, so this number does not measure the hot path");
