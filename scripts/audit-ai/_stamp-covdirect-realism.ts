// DRY-STAMP probe 3 — multi-bar realism (§B/§D/§F), flag-OFF byte-identity, ReDoS linearity.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`FAIL ${l}: got ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };
const f = (sec: string, ex: string): TypedFinding =>
  ({ id: "f_" + sec + "_" + ex.slice(0, 6), citation: "§" + sec, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

function run(sec: string, lines: string[], findings: TypedFinding[]) {
  const src = [`SECTION ${sec} - HEADER`, ...lines].join("\n");
  return completenessOf({ fullSource: src } as any, [sec], findings, new Set([sec]));
}

function main() {
  const withFlag = (on: boolean, fn: () => void) => {
    process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = on ? "true" : "false"; try { fn(); } finally { process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true"; }
  };

  // ===== MULTI-BAR §H: a benign grounded finding + a real clearance bar + a real ITAR bar → floors, surfaces the REAL bar.
  const GB = "Government-furnished property will be provided at the contractor's facility.";
  const BAR1 = "The contractor shall possess a Top Secret facility clearance at time of award.";
  const BAR2 = "The offeror must be registered with DDTC under ITAR to perform this work.";
  {
    const r = run("H", [GB, BAR1, BAR2], [f("H", GB)]);
    const h = r.attestations.find((a) => a.section === "H");
    ok("[mb1] §H multi-bar ⇒ obligations_ungrounded", h?.status, "obligations_ungrounded");
    ok("[mb1] surfaces the clearance bar sentence", h?.ungrounded.some((u) => /top secret facility clearance/i.test(u)), true);
    ok("[mb1] surfaces the ITAR bar sentence", h?.ungrounded.some((u) => /ddtc|itar/i.test(u)), true);
    ok("[mb1] does NOT surface the benign grounded finding", h?.ungrounded.some((u) => /government-furnished/i.test(u)), false);
    ok("[mb1] §H missing", r.missing, ["H"]);
  }

  // ===== MULTI-BAR §D realism — benign form-field 8(a) SKIPS but a real CMMC bar in same section still floors.
  {
    const r = run("D", [
      "Mark each container per MIL-STD-129.",
      "Enter the contract line item in block 8(a).",                               // benign form-field → skip
      "The contractor shall maintain a current CMMC Level 2 certification.",        // real firm-credential bar → floor
    ], [f("D", "Mark each container per MIL-STD-129.")]);
    const d = r.attestations.find((a) => a.section === "D");
    ok("[mb2] §D w/ benign-8a + real CMMC bar ⇒ floors", d?.status, "obligations_ungrounded");
    ok("[mb2] surfaces the CMMC bar, not the form-field", d?.ungrounded.some((u) => /cmmc/i.test(u)) && !d?.ungrounded.some((u) => /block 8\(a\)/i.test(u)), true);
  }

  // ===== §F fully clean (no bar) ⇒ covered_direct (zero over-fire).
  {
    const r = run("F", [
      "Delivery shall be made within 30 days after award.",
      "The contractor's samples shall be delivered to the destination point.",
      "Contractor personnel shall coordinate delivery windows with the COR.",
    ], [f("F", "Delivery shall be made within 30 days after award.")]);
    ok("[clean-F] fully-benign §F ⇒ covered_direct", r.attestations.find((a) => a.section === "F")?.status, "covered_direct");
    ok("[clean-F] §F not missing", r.missing, []);
  }

  // ===== FLAG-OFF byte-identity — the exact multi-bar §H input must be covered_direct when OFF.
  withFlag(false, () => {
    const r = run("H", [GB, BAR1, BAR2], [f("H", GB)]);
    ok("[flagoff] OFF ⇒ multi-bar §H covered_direct (byte-identical status quo)", r.attestations.find((a) => a.section === "H")?.status, "covered_direct");
    ok("[flagoff] OFF ⇒ §H not missing", r.missing, []);
  });

  // ===== ReDoS — a pathological adversarial line must run linearly (bounded quantifiers). Budget generous.
  {
    const evil = "SECTION H - HEADER\n" + "The offeror shall be " + "registered ".repeat(400) + "8(a) ".repeat(400) + "and eligible.";
    const t0 = Date.now();
    run("H", [evil], [f("H", "x")]);
    const ms = Date.now() - t0;
    ok(`[redos] pathological input runs <400ms (got ${ms}ms)`, ms < 400, true);
  }

  console.log(`\n${fails.length === 0 ? "ALL PASS" : "HAS FAILURES"} — ${pass} passed, ${fails.length} failed`);
  fails.forEach((x) => console.log(x));
  if (fails.length) process.exit(1);
}
main();
