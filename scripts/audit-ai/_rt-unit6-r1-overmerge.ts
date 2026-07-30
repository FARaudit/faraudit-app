// RT Unit6 R1 — OVER-MERGE (cardinal sin) + logicalShowStopperCount geometry + 0.8 boundary.
import { applyFindingDedup, deriveVerdict, logicalShowStopperCount, disposeFinding } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

type F = TypedFinding;
const mk = (o: Partial<F>): F => ({
  requirement: "", citation: "", excerpt: "", kind: "other",
  controllability: "bidder_controls", grounded: true, ...o,
} as F);

// ---- O1: logicalShowStopperCount — two show-stopper bars sharing a clause number but DIFFERENT
// object-ids. Full: 2 logical stoppers. Deduped: 1 row → 1 logical stopper. Count changes.
{
  const findings = [
    mk({ citation: "52.204-7", requirement: "must hold cert DGMT1002 at award", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "a" }),
    mk({ citation: "52.204-7", requirement: "must hold cert ABCD9999 at award", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "b" }),
  ];
  const stoppersFull = findings.map((f) => ({ ...f, disposition: disposeFinding(f) })) as any;
  const deduped = applyFindingDedup(findings, { enabled: true });
  const stoppersDed = deduped.map((f) => ({ ...f, disposition: disposeFinding(f) })) as any;
  const cFull = logicalShowStopperCount(stoppersFull);
  const cDed = logicalShowStopperCount(stoppersDed);
  console.log(`${cFull === cDed ? "ok " : "*** LOGICAL-COUNT CHANGED"} [O1 distinct object-ids merged] logicalShowStopperCount ${cFull} -> ${cDed}`);
  console.log(`     NOTE: brief claims 'logicalShowStopperCount unchanged' as a HARD invariant.`);
}

// ---- O2: TRUE over-merge — two genuinely distinct obligations that share a clause but whose
// requirement token-overlap ≥ 0.8 (so facet-append is SKIPPED and the 2nd obligation VANISHES).
{
  const r1 = "The offeror shall submit the certified cost or pricing data package for the base year option";
  const r2 = "The offeror shall submit the certified cost or pricing data package for the FIRST option"; // near-identical tokens, DIFFERENT year
  const findings = [
    mk({ citation: "52.215-12", requirement: r1, controllability: "bidder_controls" }),
    mk({ citation: "52.215-12", requirement: r2, controllability: "bidder_controls" }),
  ];
  const deduped = applyFindingDedup(findings, { enabled: true });
  const survivorReq = deduped[0].requirement;
  const keptBoth = survivorReq.includes("base year") && survivorReq.includes("FIRST");
  console.log(`${keptBoth ? "ok " : "*** OVER-MERGE (distinct facet vanished)"} [O2 0.8-containment swallows distinct year] survivor="${survivorReq}"`);
}

// ---- O3: 0.8 boundary — a SHORT distinct requirement (few tokens) is more easily ≥0.8-contained.
{
  const acc = "contractor shall provide monthly progress reports to the contracting officer within five business days";
  const cand = "reports within five days"; // short → all its ≥4-char tokens (reports, within, five, days) present in acc?
  const findings = [
    mk({ citation: "52.242-15", requirement: acc, controllability: "bidder_controls" }),
    mk({ citation: "52.242-15", requirement: cand, controllability: "bidder_controls" }),
  ];
  const deduped = applyFindingDedup(findings, { enabled: true });
  console.log(`[O3 short-cand containment] survivor="${deduped[0].requirement}"  (cand ${deduped[0].requirement.includes("within five days") ? "KEPT" : "DROPPED as restatement"})`);
}

// ---- O4: citation-vs-requirement key source. A finding whose clause is ONLY in the EXCERPT must
// NOT merge (brief guard 2). Verify.
{
  const findings = [
    mk({ citation: "§L instructions", requirement: "submit past performance", excerpt: "see also FAR 52.219-33", controllability: "bidder_controls" }),
    mk({ citation: "§M eval", requirement: "evaluate past performance", excerpt: "see also FAR 52.219-33", controllability: "bidder_controls" }),
  ];
  const deduped = applyFindingDedup(findings, { enabled: true });
  console.log(`${deduped.length === 2 ? "ok " : "*** EXCERPT-MERGE"} [O4 excerpt-only clause not keyed] rows ${findings.length}->${deduped.length}`);
}

// ---- O5: false-clause-key collision — a phone number in requirement fuses two UNRELATED findings.
{
  const findings = [
    mk({ citation: "§L", requirement: "questions to the CO at 252.555-1212 by Friday", controllability: "bidder_controls", severity: "P2" }),
    mk({ citation: "§B", requirement: "invoices to AP at 252.555-1212 monthly", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "z" }),
  ];
  const deduped = applyFindingDedup(findings, { enabled: true });
  const merged = deduped.length === 1;
  console.log(`${merged ? "*** FALSE-KEY MERGE (phone number)" : "ok "} [O5 phone-number collision] rows ${findings.length}->${deduped.length}${merged ? "  survivorCtrl=" + deduped[0].controllability : ""}`);
}

// ---- O6: order-stability — survivor stays at FIRST member's original index.
{
  const findings = [
    mk({ citation: "§A", requirement: "unrelated first", controllability: "bidder_controls" }),
    mk({ citation: "52.217-8", requirement: "option ext A", controllability: "bidder_controls" }),
    mk({ citation: "§C", requirement: "unrelated middle", controllability: "bidder_controls" }),
    mk({ citation: "52.217-8", requirement: "option ext B facet distinct zzzz", controllability: "bidder_controls" }),
    mk({ citation: "§Z", requirement: "unrelated last", controllability: "bidder_controls" }),
  ];
  const deduped = applyFindingDedup(findings, { enabled: true });
  const reqs = deduped.map((f) => f.requirement.slice(0, 12));
  const survivorAtIndex1 = /option ext A/.test(deduped[1]?.requirement ?? "");
  console.log(`${survivorAtIndex1 ? "ok " : "*** ORDER-UNSTABLE"} [O6 survivor at first index] order=${JSON.stringify(reqs)}`);
}
