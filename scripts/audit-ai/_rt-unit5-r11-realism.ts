import { detectQuantityAmbiguities } from "../../src/lib/audit-decide";

// R11 — HONEST REALISM test. The r8/r9/r10/r11 family all require an embedded-declarative content clause
// with NO complementizer "that". A real KO writing a clarity question writes EITHER:
//   (A) the genuine which-quantity form (bare NP subject) — "Is the estimate 520 or 1,040 hours?" (SHOULD fire)
//   (B) an embedded declarative WITH "that" — "Is it correct that the base assumes 520 or 1,040 hours?"
//   (C) an embedded declarative with an INFLECTED verb — "...the schedule assumes/reflects 520..."
// The seam only survives the UNNATURAL zero-"that" + base/irregular-verb + non-s-subject intersection.
// This probe checks the NATURAL forms (B) and (C) are SAFELY caught, and characterizes realism.

const natural: Array<{ tag: string; s: string; wantFire: boolean }> = [
  // (B) natural "that"-complementized clarity questions — QA_AUX_RE catches "that" → reject (SAFE)
  { tag: "B1 that + base verb", s: "Is it correct that staff bill 520 hours or 1,040 hours?", wantFire: false },
  { tag: "B2 that + your assumption", s: "Is your assumption that the crew set 520 hours or 1,040 hours?", wantFire: false },
  { tag: "B3 that + noun head", s: "Is the assumption that staff bill 520 hours or 1,040 hours?", wantFire: false },
  // (C) natural inflected embedded verb — morphology catches -s/-ed (SAFE)
  { tag: "C1 assumes", s: "Is the assumption staff bills 520 hours or 1,040 hours?", wantFire: false },
  { tag: "C2 reflected", s: "Is the assumption staff reflected 520 hours or 1,040 hours?", wantFire: false },
  { tag: "C3 estimates", s: "Is the assumption the schedule estimates 520 hours or 1,040 hours?", wantFire: false },
  // (A) genuine which-quantity — SHOULD fire
  { tag: "A1 genuine bare-NP", s: "Is the estimate 520 hours or 1,040 hours?", wantFire: true },
  { tag: "A2 genuine total requirement", s: "Is the total requirement 520 hours or 1,040 hours?", wantFire: true },
  // A KO's MOST-natural way to pose the same clarity concern (adds trailing PP) — SAFE under-fire by R7 pivot
  { tag: "D1 genuine + trailing PP (under-fire OK)", s: "Is the base period 520 hours or 1,040 hours per year?", wantFire: true },
];

for (const p of natural) {
  const fired = detectQuantityAmbiguities(p.s).length > 0;
  const status = fired === p.wantFire ? "OK   " : (fired ? "★OVER" : "under");
  console.log(`${fired ? "FIRE " : "quiet"} ${status}  [${p.tag}]  ${JSON.stringify(p.s)}`);
}
