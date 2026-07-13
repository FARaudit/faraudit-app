// $0 pin for the NAMED NHR reason-line (Card #477 ruling 3, flag AUDIT_REASON_LINE_NAMED).
// Run: npx tsx src/lib/audit-decide-reason-line.test.ts
//
// When grounded eligibility bars drive the notice-body NHR, the reason NAMES them instead of the generic B3 boilerplate.
// Fixtures = the real 6a67c0f1 showStopper requirements (BOA/vehicle-holder + concluded site visit). Empty ⇒ null ⇒ the
// caller keeps the generic string (byte-identical).
import { namedEligibilityReason } from "./audit-decide";
import type { DecidedFinding } from "./audit-decide";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const mk = (requirement: string): DecidedFinding => ({ requirement, citation: "SAM Notice Body", excerpt: "", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "orchestrator", disposition: "disqualifying" } as unknown as DecidedFinding);

// The real 6a67c0f1 grounded bars.
const stoppers = [
  mk("Order restricted to vehicle HOLDERS ONLY (BOA/IDIQ/BPA/GWAC/MAS) stated in the SAM notice body — this ITO/order can only be proposed by an existing holder of the underlying vehicle; a firm that does not hold it CANNOT bid."),
  mk("Mandatory site visit stated in the SAM notice body was held/concluded may 28, 2026; attendance is non-retroactive — this BARS AWARD unless the firm's attendance at the concluded site visit is confirmed."),
];

console.log("── named reason from the real bars ──");
const reason = namedEligibilityReason(stoppers);
assert(!!reason, "produces a named reason (not null)");
assert(!/could not be confirmed as analyzed/.test(reason ?? ""), "does NOT use the generic B3 boilerplate");
assert(/HOLDERS ONLY|holder of the underlying vehicle/i.test(reason ?? ""), "names the vehicle-holder bar");
assert(/site visit/i.test(reason ?? "") && /concluded|may 28/i.test(reason ?? ""), "names the concluded site-visit bar");
assert(/\(1\)/.test(reason ?? "") && /\(2\)/.test(reason ?? ""), "enumerates the bars (1)…(2)");
console.log("  →", reason);

console.log("\n── dedup: identical requirements collapse ──");
const dupReason = namedEligibilityReason([stoppers[0], mk(stoppers[0].requirement)]);
assert((dupReason?.match(/\(\d\)/g) || []).length === 1, "duplicate bar is deduped to a single entry");

console.log("\n── no bars ⇒ null (caller keeps generic string, byte-identical) ──");
assert(namedEligibilityReason([]) === null, "empty stoppers → null");
assert(namedEligibilityReason([mk("")]) === null, "blank-requirement stopper → null");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : "❌ " + failures + " FAIL"} — named reason-line pin`);
process.exit(failures === 0 ? 0 : 1);
