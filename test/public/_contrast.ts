// THE CONTRAST SAMPLER — one calibrated implementation, composited, shared.
//
// WHY THIS EXISTS. This project has produced the SAME wrong sampler three times, in three
// separate sessions, and each time it was confident and wrong in the same direction:
//
//   1. the rail work — two of three hand-written samplers reported wrong numbers before the
//      third was calibrated (recorded in _rail-a11y.test.ts §R1)
//   2. Design's card 861 sheet — a translucent chip ground read as opaque reported ~1.8:1 on
//      a chip that actually measures 8.4:1
//   3. the card 861 verification here — a dark card node reported 2.18:1; composited it is
//      5.00:1, and 0 of 6193 nodes were below AA
//
// Every one of those was the same omission: `rgba(255,255,255,.05)` sampled as if it were
// `rgb(255,255,255)`. The failure mode is the dangerous direction — it CONVICTS A CORRECT
// PAGE, which costs a real fix chasing a defect that was never there.
//
// So it stops being a per-session fix. Import `ratio` and `flatten` from here; do not write
// a luminance function in a gate. If you need one in the BROWSER, use `browserSampler()`,
// which returns this same logic as a string to pass to page.evaluate().
//
// Calibrated by _contrast-sampler.test.ts, including the alpha leg and a negative control
// proving the non-compositing form gets it wrong.

export type RGB = [number, number, number];

const lin = (v: number): number => {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

export const luminance = (c: RGB): number =>
  0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

/** WCAG contrast, rounded to 2dp. Both arguments must already be OPAQUE — run anything
 *  translucent through `flatten()` first, or the number will be wrong and confident. */
export const ratio = (fg: RGB, bg: RGB): number => {
  const a = luminance(fg), b = luminance(bg);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

/** Composite `src` at alpha `a` over `dst`. */
export const over = (src: RGB, a: number, dst: RGB): RGB => [
  a * src[0] + (1 - a) * dst[0],
  a * src[1] + (1 - a) * dst[1],
  a * src[2] + (1 - a) * dst[2],
];

export type Layer = { rgb: RGB; alpha: number };

/** Flatten a stack of layers onto an opaque base. `layers` is ordered NEAREST-FIRST — the
 *  element's own background at index 0, its ancestors after it — which is the order a DOM
 *  walk produces. The base is the page's own opaque ground. */
export const flatten = (layers: Layer[], base: RGB): RGB => {
  let out: RGB = base;
  for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i].rgb, layers[i].alpha, out);
  return out;
};

/** Parse `#rgb`, `#rrggbb`, `rgb(...)`, `rgba(...)`, and `transparent`. Returns alpha
 *  separately rather than discarding it — discarding it IS the bug this module exists for. */
export const parseColor = (s: string): Layer | null => {
  const t = (s || "").trim().toLowerCase();
  if (!t || t === "transparent") return null;
  if (t.startsWith("#")) {
    const h = t.slice(1);
    const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    if (f.length < 6) return null;
    return { rgb: [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)], alpha: 1 };
  }
  const n = t.match(/-?[\d.]+/g);
  if (!n || n.length < 3) return null;
  const alpha = n.length > 3 ? Number(n[3]) : 1;
  if (alpha === 0) return null;
  return { rgb: [Number(n[0]), Number(n[1]), Number(n[2])], alpha };
};

/** The same logic as a self-contained expression for page.evaluate(). Browser probes cannot
 *  import this module, and hand-rolling one there is exactly how defect (3) above happened. */
export function browserSampler(): string {
  return `(() => {
    const lin = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    const lum = c => 0.2126*lin(c[0]) + 0.7152*lin(c[1]) + 0.0722*lin(c[2]);
    const parse = s => { const t=(s||'').trim(); if(!t||t==='transparent') return null;
      const n=t.match(/-?[\\d.]+/g); if(!n||n.length<3) return null;
      const a=n.length>3?Number(n[3]):1; if(a===0) return null;
      return {rgb:[Number(n[0]),Number(n[1]),Number(n[2])], alpha:a}; };
    const over = (s,a,d) => [a*s[0]+(1-a)*d[0], a*s[1]+(1-a)*d[1], a*s[2]+(1-a)*d[2]];
    const ratio = (f,b) => { const x=lum(f), y=lum(b), hi=Math.max(x,y), lo=Math.min(x,y);
      return Math.round(((hi+0.05)/(lo+0.05))*100)/100; };
    /* EVERY translucent ancestor, composited down — not the first non-transparent one. */
    const ground = (el, base) => { const stack=[]; let n=el;
      while(n){ const p=parse(getComputedStyle(n).backgroundColor); if(p) stack.push(p); n=n.parentElement; }
      let out=base; for(let i=stack.length-1;i>=0;i--) out=over(stack[i].rgb, stack[i].alpha, out);
      return out; };
    return { ratio, ground, parse,
      of: (el, base) => { const p=parse(getComputedStyle(el).color);
        return p ? ratio(over(p.rgb, p.alpha, ground(el, base)), ground(el, base)) : null; } };
  })()`;
}
