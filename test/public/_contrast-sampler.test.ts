// Gate — the shared contrast sampler is CALIBRATED, and the sampler that keeps getting
// written by hand is proven wrong against it.
//
// An uncalibrated contrast function is not evidence. This project has shipped three wrong
// ones (see _contrast.ts), all failing the same way — translucent colour sampled as opaque —
// and all failing toward CONVICTING A CORRECT PAGE, which is the expensive direction.
//
// C1 known pairs · C2 the alpha leg · C3 layered stacks · C4 parsing ·
// C5 NEGATIVE CONTROL: the non-compositing form disagrees, and is wrong.
//
// Run: npx tsx test/public/_contrast-sampler.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { ratio, over, flatten, parseColor, luminance, browserSampler, type RGB } from "./_contrast";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const CARD_DARK: RGB = [12, 17, 28];

console.log("C1 · known pairs");
ok(ratio(WHITE, BLACK) === 21, "white on black = 21");
ok(ratio([118, 118, 118], WHITE) === 4.54, "#767676 on white = 4.54 (the AA boundary colour)");
ok(ratio(CARD_DARK, CARD_DARK) === 1, "identical colours = 1");
ok(luminance(WHITE) === 1 && luminance(BLACK) === 0, "luminance is anchored at both ends");

console.log("\nC2 · the alpha leg");
{
  // Hand-computed: white @32% over #0a1628 -> 0.32*255 + 0.68*[10,22,40] = [88.4, 96.6, 108.8]
  const c = over(WHITE, 0.32, [10, 22, 40]);
  ok(c.map(Math.round).join(",") === "88,97,109", "alpha composite is correct", c.map(Math.round).join(","));
  ok(ratio(c, [10, 22, 40]) === 2.88, "and yields 2.88 — the figure the rail work published");
}

console.log("\nC3 · layered stacks flatten nearest-last");
{
  // Two translucent whites over a dark ground: .05 over .05 is not .10, and neither is white.
  const stacked = flatten([{ rgb: WHITE, alpha: 0.05 }, { rgb: WHITE, alpha: 0.05 }], CARD_DARK);
  const single = flatten([{ rgb: WHITE, alpha: 0.05 }], CARD_DARK);
  ok(stacked[0] > single[0], "a second translucent layer lightens further");
  ok(stacked[0] < 255, "but never reaches the raw colour", stacked.map(Math.round).join(","));
  ok(flatten([], CARD_DARK) === CARD_DARK, "an empty stack is the base itself");
}

console.log("\nC4 · parsing keeps alpha instead of discarding it");
ok(parseColor("#fff")?.rgb.join(",") === "255,255,255", "#fff expands");
ok(parseColor("#0a1628")?.rgb.join(",") === "10,22,40", "#rrggbb parses");
ok(parseColor("rgba(255, 255, 255, 0.05)")?.alpha === 0.05, "rgba alpha survives");
ok(parseColor("rgb(12, 17, 28)")?.alpha === 1, "rgb is opaque");
ok(parseColor("transparent") === null && parseColor("rgba(0,0,0,0)") === null,
  "fully transparent is null, not black");

console.log("\nC5 · NEGATIVE CONTROL — the sampler that keeps getting hand-written is wrong");
{
  // The defect, reproduced: a chip on rgba(255,255,255,.05) over a dark card.
  const ink: RGB = [232, 238, 246];
  const trueGround = flatten([{ rgb: WHITE, alpha: 0.05 }], CARD_DARK);
  const correct = ratio(ink, trueGround);
  // The wrong form: take the first non-transparent background and IGNORE its alpha.
  const naive = ratio(ink, WHITE);
  ok(naive !== correct, "the two samplers disagree — so this control is not inert",
    `naive ${naive} vs composited ${correct}`);
  ok(naive < correct, "and the naive one reads LOW — it convicts a page that is fine",
    `naive ${naive} < composited ${correct}`);
  ok(correct >= 4.5, "the real ratio clears AA", String(correct));
  ok(naive < 4.5, "while the naive number would have failed it", String(naive));
}

console.log("\nC6 · the browser sampler is the same logic, not a second implementation");
{
  const src = browserSampler();
  ok(/0\.2126|0.2126/.test(src) && /0\.7152/.test(src) && /0\.0722/.test(src),
    "it carries the same luminance coefficients");
  ok(/while\s*\(\s*n\s*\)/.test(src) && /parentElement/.test(src),
    "it walks EVERY ancestor rather than stopping at the first background");
  ok(/alpha/.test(src) && /over\(/.test(src), "and composites alpha rather than dropping it");
  ok(!/return null;\s*\}\s*;?\s*const ground[\s\S]*getComputedStyle\(n\)\.backgroundColor;\s*if\s*\(p\)\s*break/.test(src),
    "it does not break on the first non-transparent layer");
}

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
