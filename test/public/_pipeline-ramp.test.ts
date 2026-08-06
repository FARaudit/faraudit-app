/**
 * The stage rail's ground ramp, measured — not read.
 *
 * A ramp is a GROUND claim. Text-contrast sweeps pass while a ramp is broken,
 * because they measure ink against its ground and never the grounds against each
 * other. The specific failure this gate exists for: the ramp's first step landed
 * at 1.088:1 (light) and 1.055:1 (dark) against the panel, under its own 1.12x
 * floor — and BELOW the weight of an empty cell's 1px outline, so a stage holding
 * pursuits rendered fainter than a stage holding nothing. Absent read as more
 * present than present.
 *
 * Neighbour-vs-neighbour cannot catch that: every adjacent pair passed. The first
 * step has to be measured against the surface it sits on, and against emptiness.
 *
 *   npx tsx test/public/_pipeline-ramp.test.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${name}${ok || !detail ? "" : `  — ${detail}`}`);
  if (!ok) failed++;
}

const html = readFileSync(resolve(process.cwd(), "public/pipeline.html"), "utf8");

// ── colour maths, on composited pixels ───────────────────────────────────────
type RGB = [number, number, number];
function hex(h: string): RGB {
  let c = h.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  return [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16)) as RGB;
}
function lum(c: RGB): number {
  const a = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(a: RGB, b: RGB): number {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** An alpha line over a card is NOT its own colour — composite before measuring. */
function over(fg: RGB, alpha: number, bg: RGB): RGB {
  return fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha))) as RGB;
}

/** Pull a declaration out of a specific token block, so the fields cannot alias. */
function block(sel: string): string {
  const i = html.indexOf(sel);
  if (i < 0) return "";
  return html.slice(i, html.indexOf("}", i));
}
function token(blk: string, name: string): string | null {
  const m = blk.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

const FIELDS = [
  { name: "light", sel: ':root,[data-theme="light"],[data-theme="auto"]{' },
  { name: "dark", sel: '[data-theme="dark"]{' },
];

const MIN_STEP = 1.12;   // a neighbour pair closer than this is not a step
const DEEP_END = 8;      // award must be unmistakably the deep end

for (const f of FIELDS) {
  console.log(`\n── ${f.name} field ──`);
  const blk = block(f.sel);
  check(`${f.name}: token block found`, blk.length > 0, `selector ${f.sel} not in pipeline.html`);
  if (!blk) continue;

  const steps = Array.from({ length: 8 }, (_, i) => token(blk, `ramp-${i + 1}`));
  check(`${f.name}: all 8 ramp steps declared IN THIS BLOCK`, steps.every(Boolean),
    `missing: ${steps.map((s, i) => (s ? null : i + 1)).filter(Boolean).join(",")}`);
  if (!steps.every(Boolean)) continue;

  const cardRaw = token(blk, "card");
  check(`${f.name}: --card declared in this block`, !!cardRaw);
  if (!cardRaw) continue;
  const card = hex(cardRaw);

  const vs = (steps as string[]).map((s) => ratio(hex(s), card));

  // depth-order may not invert, even though DIRECTION may between fields
  const backward = vs.map((v, i) => (i > 0 && v < vs[i - 1] - 0.02 ? i + 1 : 0)).filter(Boolean);
  check(`${f.name}: ramp is monotonic against its own card`, backward.length === 0,
    `runs backward at step(s) ${backward.join(",")}`);

  const pairs = vs.slice(1).map((v, i) => Math.max(v, vs[i]) / Math.min(v, vs[i]));
  const worstPair = Math.min(...pairs);
  check(`${f.name}: every neighbour pair separates by >= ${MIN_STEP}x`, worstPair >= MIN_STEP,
    `tightest pair ${worstPair.toFixed(3)}x at step ${pairs.indexOf(worstPair) + 1}->${pairs.indexOf(worstPair) + 2}`);

  // THE CHECK THE NEIGHBOUR SWEEP CANNOT MAKE
  check(`${f.name}: FIRST step clears the panel by >= ${MIN_STEP}x`, vs[0] >= MIN_STEP,
    `step 1 is ${vs[0].toFixed(3)}:1 against its own card — a cell that fades into its container reads as absent`);

  // ...and must outweigh emptiness, or zero outranks a real count
  const lineRaw = token(blk, "line")!;
  const alpha = lineRaw.match(/rgba\([^)]*?,\s*([\d.]+)\s*\)/);
  const lineRGB = alpha
    ? over(hex("#ffffff"), parseFloat(alpha[1]), card)   // the dark field's line is white-alpha
    : hex(lineRaw);
  const emptyWeight = ratio(lineRGB, card);
  check(`${f.name}: a POPULATED first cell outweighs an EMPTY one`, vs[0] > emptyWeight,
    `step 1 ${vs[0].toFixed(3)}:1 vs empty outline ${emptyWeight.toFixed(3)}:1 — emptiness would read stronger`);

  check(`${f.name}: deep end reaches >= ${DEEP_END}:1`, vs[7] >= DEEP_END,
    `ramp-8 is only ${vs[7].toFixed(2)}:1`);

  console.log(`   measured: ${vs.map((v) => v.toFixed(2)).join(" → ")}  · empty ${emptyWeight.toFixed(3)}`);
}

// ── planted positives — each check above must be able to go red ──────────────
console.log("\n── planted positives ──");
{
  const white = hex("#ffffff");
  // the ACTUAL pre-fix value, against the ACTUAL card: this is the defect, restated
  check("P1 · the shipped-before value fails the first-step floor",
    ratio(hex("#eff6ff"), white) < MIN_STEP);
  check("P2 · the respec'd value passes it",
    ratio(hex("#bfd9f7"), white) >= MIN_STEP);
  check("P3 · the pre-fix first step loses to an empty cell",
    ratio(hex("#eff6ff"), white) < ratio(hex("#e5e7eb"), white));
  check("P4 · the respec'd first step beats an empty cell",
    ratio(hex("#bfd9f7"), white) > ratio(hex("#e5e7eb"), white));
  check("P5 · a backward ramp is detected",
    [1.4, 1.9, 1.5].some((v, i, a) => i > 0 && v < a[i - 1] - 0.02));
  check("P6 · alpha compositing is applied, not skipped",
    ratio(over(hex("#ffffff"), 0.08, hex("#0c1b30")), hex("#0c1b30")) > 1.1);
}

console.log(`\n${failed === 0 ? "✅ ALL GREEN" : `❌ ${failed} FAILURE(S)`}`);
process.exit(failed === 0 ? 0 : 1);
