// The security review named three shapes that still over-refute and said they fire identically on main
// (pre-existing). Verify BOTH halves: do they fire now, and did they fire before the affirmative rewrite?
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";
const SRC = [
  "==== DOCUMENT: Solicitation - W91.pdf ====", "Section B", "x".repeat(300),
  "==== DOCUMENT: PWS KO Appropved - 20260720.pdf ====", "The contractor shall mow.", "y".repeat(300),
].join("\n");
const PROV = new Set(["PWS KO Appropved - 20260720.pdf"]);
const CASES = [
  "The PWS (and the drawings) are not provided — pricing cannot be built.",
  "The QASP; the PWS are not provided — pricing cannot be built.",
  "The PWS [together with the QASP] is not provided — pricing cannot be built.",
  "PWS (Attachment 0001) is listed but not reproduced in the source — obligations unknown.", // TRUE POSITIVE, must fire
];
for (const c of CASES) {
  const n = reconcileAbsenceClaims([{ id: "c", requirement: c }], SRC, PROV, null).refuted.length;
  console.log(`  ${n ? "REFUTES" : "stands down"}  ${c.slice(0, 66)}`);
}
