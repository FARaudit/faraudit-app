// $0. LENS DISCOVERY — inertness check against REAL banked packages, using the PRODUCTION functions.
//
// The question this answers is the only one that matters after a green suite: does the notice actually FIRE on the
// packages the engine really receives, or is it a placebo that passes its own fixtures? The gate-1 probe
// (_lens-01-discovery-cost.ts) measured cost with a hand-written MIRROR of docRegionsOf/listBindingDocuments. A mirror
// inherits whatever premise its author had, so it cannot answer "is the real function inert" — only the real function
// can. This imports listBindingDocuments itself.
//
// It also measures the thing the design hinges on: names cost ~4 orders of magnitude less than the rejected full-text
// pre-injection. That claim is re-derived here from the same banked sources rather than carried forward.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

process.env.AUDIT_LENS_DISCOVERY = "true";        // the configuration under test
process.env.AUDIT_ATTACHMENT_COVERAGE = "false";  // live worker state

const CORPUS = join(process.cwd(), "scripts", "audit-ai", "run-records");
const CHARS_PER_TOKEN = 3.5;

function records(): Array<{ sol: string; src: string }> {
  const out: Array<{ sol: string; src: string }> = [];
  if (!existsSync(CORPUS)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        try {
          const r = JSON.parse(readFileSync(p, "utf8"));
          const src = r?.input?.fullSource;
          if (typeof src === "string" && src) out.push({ sol: r?.meta?.sol ?? e.name, src });
        } catch { /* skip */ }
      }
    }
  };
  walk(CORPUS);
  return out;
}

const pct = (a: number[], p: number) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

(async () => {
  const { listBindingDocuments } = await import("../../src/lib/audit-tools");
  const recs = records();
  if (!recs.length) { console.log("NO BANKED RECORDS at " + CORPUS + " — cannot answer inertness. NOT a pass."); process.exit(1); }

  let fired = 0, inert = 0;
  const noticeTokens: number[] = [], fullTextTokens: number[] = [];
  const inertSols: string[] = [];

  for (const { sol, src } of recs) {
    const names = listBindingDocuments({ fullSource: src } as never);
    if (names.length === 0) { inert++; inertSols.push(sol); continue; }
    fired++;
    // The notice as actually rendered: the bracketed name list plus the fixed prose around it.
    noticeTokens.push(Math.ceil((names.join("; ").length + 330) / CHARS_PER_TOKEN));
    // The REJECTED design, for the same package: every binding doc's full text, injected per lens.
    const regions = [...src.matchAll(/^====\s*DOCUMENT:\s*(.+?)\s*====$/gm)];
    let bytes = 0;
    for (let i = 0; i < regions.length; i++) {
      const name = regions[i][1];
      if (!names.includes(name)) continue;
      const start = (regions[i].index ?? 0) + regions[i][0].length;
      const end = i + 1 < regions.length ? (regions[i + 1].index ?? src.length) : src.length;
      bytes += end - start;
    }
    fullTextTokens.push(Math.ceil(bytes / CHARS_PER_TOKEN));
  }

  console.log(`packages banked            ${recs.length}`);
  console.log(`notice FIRES (≥1 binding)  ${fired}`);
  console.log(`notice INERT (0 binding)   ${inert}`);
  if (inertSols.length) console.log(`  inert on: ${inertSols.slice(0, 12).join(", ")}${inertSols.length > 12 ? " …" : ""}`);
  console.log(`\nNAME LIST tokens/lens      p50 ${pct(noticeTokens, 0.5)}  max ${pct(noticeTokens, 1)}`);
  console.log(`REJECTED full-text/lens    p50 ${pct(fullTextTokens, 0.5)}  max ${pct(fullTextTokens, 1)}`);
  const p50a = pct(noticeTokens, 0.5), p50b = pct(fullTextTokens, 0.5);
  console.log(`ratio at p50               ${p50a ? Math.round(p50b / p50a) : "n/a"}×`);
  console.log(`\nacross 5 lenses            names ${pct(noticeTokens, 0.5) * 5}   full text ${pct(fullTextTokens, 0.5) * 5}`);
  console.log(fired === 0
    ? "\n⛔ INERT ON EVERY BANKED PACKAGE — the feature would ship doing nothing."
    : `\n✓ fires on ${fired}/${recs.length} banked packages.`);
  process.exit(fired === 0 ? 1 : 0);
})();
