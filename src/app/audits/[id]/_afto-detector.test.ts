// AFTO DETECTOR — ARC #747. The LIVE copy in the legacy report path fired on ordinary delivery/quantity
// prose and produced a gate asserting that access to controlled Air Force technical data was required and
// uncurable. This pins both directions: the false fires are dead, the genuine citations still detect.
export {};
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// Extract the SHIPPED patterns from the served module rather than restating them — a restatement would only
// prove I can write the same regex twice.
const src = readFileSync(join(process.cwd(), "src", "app", "audits", "[id]", "_view-model.ts"), "utf8");
const named = src.match(/const VM_AFTO_NAMED_RE = (\/.*\/i?);/)![1];
const tonum = src.match(/const VM_AFTO_TONUM_RE = (\/.*\/);/)![1];
const fires = (s: string) =>
  (eval(named) as RegExp).test(s) || (eval(tonum) as RegExp).test(s);

// ── MUST NOT FIRE — the reproduced false positives, plus near neighbours ────────────────────────────
for (const s of [
  "Deliver within 30 to 45-60 days after receipt of order.",
  "CLIN 0002 quantities apply to 100-200 units.",
  "Ship to 700-1200 lbs pallets.",
  "Refer to 52-1 for packaging.",
  "Pricing applies to 1-5 units.",
  "Delivery to 30-45 days ARO.",
  "Quantities scale to 10-20 per lot.",
]) assert(!fires(s), `no fire: "${s}"`);

// ── MUST STILL FIRE — genuine technical-order references ────────────────────────────────────────────
for (const s of [
  "Contractor shall complete AFTO Form 95 for each unit.",
  "Work performed per Air Force Technical Order requirements.",
  "Maintenance per TO 1F-16C-2-70JG-00-1 is required.",
  "Refer to TO 00-20-1 for inspection intervals.",
  "afto form 22 submission required",
]) assert(fires(s), `fires: "${s}"`);

// ── The invented remedy instrument is gone from EMITTED TEXT ────────────────────────────────────────
// Check the emitted values, not the raw file: the comment recording the removal necessarily quotes the old
// wording, and a raw substring test flagged that comment as the defect. Assert on what ships.
const emitted = [...src.matchAll(/verification_action:\s*"([^"]*)"/g)].map((m) => m[1]);
assert(emitted.length > 0, `found ${emitted.length} verification_action literals to check`);
for (const bad of ["TO library agreement", "teaming arrangement with a holding contractor"]) {
  assert(!emitted.some((e) => e.includes(bad)), `no emitted verification_action asserts "${bad}"`);
}
const afto = emitted.filter((e) => /technical data/i.test(e));
assert(afto.length > 0 && afto.every((e) => /confirm with the contracting officer/i.test(e)),
  `the technical-data remedy is a question to the CO, not an invented instrument (${JSON.stringify(afto)})`);

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
if (failures) process.exit(1);
