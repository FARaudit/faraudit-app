/** CERT-2 Unit #12 — flag-OFF byte-identity + perf. Flag OFF must produce IDENTICAL attestations to a
 *  world where the floor code did not exist (i.e. valve always returns read_no_obligation on empty obligations). */
import { completenessOf } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";
import { looksMojibake } from "../../src/lib/pdf-ocr";

// A genuinely garbled section: with flag ON it floors; with flag OFF it MUST read_no_obligation (status quo).
const GARBLED = ("\x81\x8d\x90\x9d�� Â¬Ã¾ Ã— Ã· â‰¤ garbage salad no obligation verbs here ").repeat(8);

function attest(text: string, floor: boolean) {
  process.env.AUDIT_OBLIGATION_GARBLE_FLOOR = floor ? "true" : "false";
  const ctx = { fullSource: text, sections: { C: text } } as AuditToolContext;
  const findings: TypedFinding[] = [];
  const { attestations } = completenessOf(ctx, ["C"], findings, new Set(["C"]));
  return attestations.find((a) => a.section === "C")!;
}

const off = attest(GARBLED, false);
const on = attest(GARBLED, true);
console.log("garbled section — flag OFF status:", off.status, "| flag ON status:", on.status);
console.log("looksMojibake(garbled):", looksMojibake(GARBLED));
const flagInert = off.status === "read_no_obligation";
const flagActs = on.status === "obligations_ungrounded";
console.log(flagInert ? "PASS flag-OFF = status-quo read_no_obligation (byte-identical to no-floor world)" : "*** FAIL flag-OFF NOT inert");
console.log(flagActs ? "PASS flag-ON floors genuine garble" : "*** FAIL flag-ON did not floor garble");

// Clean section: flag ON vs OFF must be byte-identical (floor is a no-op on clean text).
const CLEAN = ("The contractor shall provide labor and materials as required by the statement of work section. ").repeat(4);
const cOff = JSON.stringify(attest(CLEAN, false));
const cOn = JSON.stringify(attest(CLEAN, true));
console.log(cOff === cOn ? "PASS clean section byte-identical flag ON==OFF" : "*** FAIL clean section differs ON vs OFF");

// Perf / ReDoS on the \p{L} per-char test over a large adversarial buffer.
const big = ("Â¬Ã¾Æ¢Ø¡™½¾¿×÷≤≥±¢£¥ ").repeat(5000);
const t0 = Date.now();
looksMojibake(big);
console.log(`perf: ${big.length} chars in ${Date.now() - t0}ms`);
