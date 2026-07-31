// CERT — the new ruler must be a true MIRROR of isFalseBid, and must be FALSIFIABLE (planted positives on both
// sides). A counter that can only return 0 is worse than no counter: it reads as evidence of correctness.
import { isFalseBid, isFalseDecline, isCommittal, verdictErrors } from "./_instrument";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };

// planted POSITIVES — each must fire
ok("false DECLINE fires: expected BID, got NEEDS_HUMAN_REVIEW", isFalseDecline(["BID"], "NEEDS_HUMAN_REVIEW"));
ok("false DECLINE fires: expected BID_WITH_CAUTION, got INCOMPLETE", isFalseDecline(["BID_WITH_CAUTION"], "INCOMPLETE"));
ok("false BID still fires: expected NO_BID, got BID", isFalseBid(["NO_BID"], "BID"));

// planted NEGATIVES — each must stay silent
ok("correct commit is not a false decline", !isFalseDecline(["BID"], "BID"));
ok("correct decline is not a false decline", !isFalseDecline(["NEEDS_HUMAN_REVIEW"], "NEEDS_HUMAN_REVIEW"));
ok("declining when NO_BID expected is not a false decline", !isFalseDecline(["NO_BID"], "NEEDS_HUMAN_REVIEW"));
ok("correct commit is not a false bid", !isFalseBid(["BID"], "BID"));

// the two are genuinely disjoint — no specimen can be both
const all = [["BID"],["NO_BID"],["BID_WITH_CAUTION"],["NEEDS_HUMAN_REVIEW"],["INCOMPLETE"]];
const got = ["BID","NO_BID","BID_WITH_CAUTION","NEEDS_HUMAN_REVIEW","INCOMPLETE"];
let both = 0; for (const e of all) for (const g of got) if (isFalseBid(e as string[], g) && isFalseDecline(e as string[], g)) both++;
ok("no specimen counts as BOTH a false bid and a false decline", both === 0);

// NO_BID is committal-adjacent but NOT committal — assert the boundary explicitly
ok("NO_BID is not treated as committal", !isCommittal("NO_BID"));

// aggregate reports both directions
const r = verdictErrors([
  { exp: ["BID"], got: "NEEDS_HUMAN_REVIEW" },   // false decline
  { exp: ["NO_BID"], got: "BID" },               // false bid
  { exp: ["BID"], got: "BID" },                  // clean
]);
ok(`verdictErrors reports both (bids=${r.falseBids}, declines=${r.falseDeclines})`, r.falseBids === 1 && r.falseDeclines === 1);
ok(`declineRate computed (${(r.declineRate*100).toFixed(0)}%)`, Math.abs(r.declineRate - 1/3) < 1e-9);

console.log(`\nCERT FALSE-DECLINE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
