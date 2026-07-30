import { detectQuantityAmbiguities, applyQuantityAmbiguityFidelity, deriveVerdict } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-decide";

// R11 — verdict-flip proof for the R10 second-subject seam over-fire, through the REAL deriveVerdict.
// A clean BID doc + one benign embedded-declarative clarity question must NOT flip to BID_WITH_CAUTION.

const benign = "Is the assumption staff bill 520 hours or 1,040 hours?";

const cleanFindings: TypedFinding[] = [
  { id: "f1", requirement: "Offeror shall submit a technical volume.", citation: "L.1", excerpt: "submit technical volume",
    kind: "other", controllability: "bidder_controls", grounded: true, lens: "commercial", severity: "P3", curableInWindow: true } as any,
];

const withGate = applyQuantityAmbiguityFidelity(cleanFindings, benign, { enabled: true });
console.log("gate emitted findings:", withGate.length, "(was", cleanFindings.length, ")");
const emitted = withGate.filter((f: any) => f.quantityAmbiguityFlagged);
console.log("quantityAmbiguity emitted:", emitted.length, emitted.map((f: any) => f.cautionFloor));

function verdictOf(findings: TypedFinding[]) {
  const d = deriveVerdict({ findings, source: benign, bidderProfile: null } as any);
  return d.verdict;
}
const vClean = verdictOf(cleanFindings);
const vGate = verdictOf(withGate);
console.log(`\nverdict CLEAN (no gate): ${vClean}`);
console.log(`verdict WITH gate:      ${vGate}`);
console.log(vClean === "BID" && vGate === "BID_WITH_CAUTION"
  ? "★ CONFIRMED FLIP: BID → BID_WITH_CAUTION on a benign embedded-declarative clarity question"
  : `(flip result: ${vClean} → ${vGate})`);

// flag-OFF byte-identity
const off = applyQuantityAmbiguityFidelity(cleanFindings, benign, { enabled: false });
console.log("\nflag-OFF same ref:", off === cleanFindings);

// idempotency — run gate on its own output
const twice = applyQuantityAmbiguityFidelity(withGate, benign, { enabled: true });
console.log("idempotent (no new emit on own output):", twice.length === withGate.length);
