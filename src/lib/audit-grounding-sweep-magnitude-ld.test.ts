// $0 pin for the magnitude + liquidated-damages archetypes (Card #479, flag AUDIT_MAGNITUDE_LD_EMIT).
// Run: AUDIT_MAGNITUDE_LD_EMIT=true npx tsx src/lib/audit-grounding-sweep-magnitude-ld.test.ts
//
// Both are machine-readable pricing anchors a prior FA8137 run left ungrounded (pricing-lens additive-capture gap).
// Grounded verbatim from source; bidder-priced (kind:"pricing"), never a show-stopper. Flag-OFF ⇒ neither fires.

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// Real FA8137 source spans (verbatim-styled).
const SRC = [
  "==== DOCUMENT: Solicitation - FA813726R0033.pdf ====",
  "THE ESTIMATED MAGNITUDE OF THIS PROJECT IS BETWEEN Magnitude of Construction: $500,000 and $1,000,000.",
  "The Contractor shall be liable for liquidated damages in the amount of $227.15 per calendar day of delay.",
  "Offerors must submit a technical volume and a price proposal by the response date.",
].join("\n");

async function main() {
  process.env.AUDIT_MAGNITUDE_LD_EMIT = "true";
  const { highSignalSweep } = await import("./audit-grounding-sweep");
  const hits = highSignalSweep(SRC);
  const mag = hits.find((h) => /magnitude/i.test(h.requirement));
  const ld = hits.find((h) => /liquidated damages/i.test(h.requirement));

  console.log("── flag ON ──");
  assert(!!mag, "magnitude archetype grounds a finding");
  assert(mag?.kind === "pricing", "magnitude finding is kind=pricing (never a show-stopper)");
  assert(/\$500,000|\$1,000,000/.test(mag?.excerpt ?? ""), "magnitude finding is GROUNDED verbatim on the $500K–$1M bracket");
  assert(!!ld, "liquidated-damages archetype grounds a finding");
  assert(ld?.kind === "pricing", "LD finding is kind=pricing");
  assert(/\$227\.15/.test(ld?.excerpt ?? ""), "LD finding is GROUNDED verbatim on $227.15/day");

  console.log("\n── over-fire guards ──");
  const noMag = highSignalSweep("==== DOCUMENT: x ====\nThe magnitude of the effort is significant and complex.");
  assert(!noMag.some((h) => /magnitude/i.test(h.requirement)), "'magnitude' without a dollar amount does NOT fire");
  const noLd = highSignalSweep("==== DOCUMENT: x ====\nLiquidated damages may apply as determined by the CO.");
  assert(!noLd.some((h) => /liquidated damages/i.test(h.requirement)), "'liquidated damages' without a per-day amount does NOT fire");

  console.log("\n── flag OFF ⇒ byte-identical (neither archetype fires) ──");
  process.env.AUDIT_MAGNITUDE_LD_EMIT = "";
  // fresh import to re-evaluate the env-gated branch would require module reset; instead assert the guard directly:
  const offHits = (await import("./audit-grounding-sweep")).highSignalSweep(SRC).filter((h) => /magnitude|liquidated damages/i.test(h.requirement));
  // (module const is read at call time via process.env in the classify branch, so clearing the env disables it in-process)
  assert(offHits.length === 0, "flag OFF: neither magnitude nor LD archetype fires (byte-identical)");

  console.log(`\n${failures === 0 ? "✅ ALL PASS" : "❌ " + failures + " FAIL"} — magnitude + LD archetype pin`);
  process.exit(failures === 0 ? 0 : 1);
}
main();

export {};
