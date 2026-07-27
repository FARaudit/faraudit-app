// UNWIRED-SURFACE SWEEP — ARC #747. Answers one mechanical question per customer-facing surface:
//
//                    DOES THIS SURFACE REQUEST DATA, OR DOES IT SHIP ANSWERS?
//
// WHY. Every real defect found on 2026-07-27 came from a surface asserting something it never computed —
// not from the engine reasoning wrongly about a real record:
//   · the legacy report template served a complete fictional acquisition through unbound slots
//   · Past Audits served fifteen hardcoded fake audits with a filter bar that had no code behind it
//   · the news feed fell open to invented articles attributed to real publications
//   · the signed-in dashboard asserts account statistics with no binding behind them
// All four were found by following unrelated defects. That is not a search strategy, and the arc had been
// writing rules about what the ENGINE is permitted to say while the actual failures were surfaces that never
// asked it anything.
//
// WHAT IT MEASURES (per surface):
//   ASSERTS  — text nodes carrying a checkable claim: a figure, a currency amount, a date, a count, or a
//              superlative. These are things a reader will believe.
//   BINDS    — evidence the surface gets data from somewhere: fetch/XHR calls, element ids the page's own
//              JS writes, data-field slots, template interpolation.
//   VERDICT  — asserts a lot and binds nothing ⇒ SHIPS-ANSWERS (the defect shape).
//
// DELIBERATELY NOT A JUDGMENT. It does not decide which claims are false — it ranks surfaces by how much
// they assert relative to how much they could possibly know. A human reads the top of the list.
//
// HONEST LIMIT, stated because understating coverage is the failure this arc keeps repeating: a surface can
// BIND and still lie (bind three fields, hardcode thirty). BINDS>0 is therefore NOT a clean bill — it only
// means the surface is not wholly disconnected. The ratio column is the signal, not the verdict.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.html$/.test(e)) out.push(p);
  }
  return out;
}

// Strip <script>/<style> so code is never counted as prose, and comments so prose ABOUT a claim is not a claim.
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

// TWO DIFFERENT CLASSES, kept apart on purpose. Conflating them was the first cut's flaw: it ranked
// "Mark all read" (the word "all") alongside "$48.2M total contract value audited".
//   QUANTITY  — a figure, currency amount or count. If unbound, the page states a number about the reader's
//               world that nothing will ever compute. This is the class that produced every defect today.
//   ABSOLUTE  — a superlative or universal ("the only platform", "every solicitation"). Also worth knowing,
//               but it is MARKETING COPY governed by the external-claims doctrine, not a data-binding defect.
// Reporting them in one column would let 40 pieces of landing-page copy bury four fabricated account stats.
const QUANTITY = /\$\s?[\d,]+(?:\.\d+)?\s?[MBK]?\b|\b\d{1,3}(?:,\d{3})+\b|\b\d+\s?(?:%|days?|hours?|months?|years?|contracts?|audits?|codes?|traps?|competitors?|solicitations?)\b/i;
const ABSOLUTE = /\b(?:strongest|the only|never|always|guaranteed)\b/i;
const ASSERTION = new RegExp(`${QUANTITY.source}|${ABSOLUTE.source}`, "i");

type Row = { file: string; asserts: number; unbound: number; unboundAbs: number; binds: number; detail: string[]; samples: string[]; verdict: string };

const surfaces = [...walk(join(ROOT, "public")), ...walk(join(ROOT, "src", "app"))];
const rows: Row[] = [];

for (const f of surfaces) {
  const raw = readFileSync(f, "utf8");
  const rel = f.replace(ROOT + "/", "");
  const text = visibleText(raw);

  // Collect the ids this page's own JS writes, and the slots it declares, BEFORE attributing assertions.
  const detail: string[] = [];
  const writtenIds = new Set<string>();
  for (const m of raw.matchAll(/getElementById\(['"]([\w-]+)['"]\)/g)) writtenIds.add(m[1]);
  for (const m of raw.matchAll(/\[([^\]]{0,200})\]\s*\.forEach\(\s*id\s*=>/g))
    for (const q of m[1].matchAll(/['"]([\w-]+)['"]/g)) writtenIds.add(q[1]);
  const fetches = (raw.match(/\bfetch\s*\(|XMLHttpRequest|EventSource\s*\(/g) ?? []).length;
  const slots = (raw.match(/\bdata-field="/g) ?? []).length;
  if (fetches) detail.push(`fetch×${fetches}`);
  if (slots) detail.push(`data-field×${slots}`);
  if (writtenIds.size) detail.push(`js-ids×${writtenIds.size}`);
  const binds = fetches + slots + writtenIds.size;

  // PER-ASSERTION ATTRIBUTION. A first cut counted page-level binding machinery and divided — which ranked
  // home.html at 0.2 and _template.html at 0.1, the two surfaces already PROVEN to ship fabricated data.
  // A detector that clears the known offenders is worse than none: it manufactures an all-clear. What
  // matters is not whether the page binds SOMETHING, it is whether THIS claim is bound. So each assertion is
  // attributed to its own enclosing element and asked one question: will anything ever overwrite you?
  let asserts = 0, unbound = 0, unboundAbs = 0;
  const unboundSamples: string[] = [];
  for (const m of text.matchAll(/>([^<>]{3,200})</g)) {
    const t = m[1].replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/\s+/g, " ").trim();
    if (t.length < 3 || !ASSERTION.test(t)) continue;
    const isQuantity = QUANTITY.test(t);
    asserts++;
    // Walk back to the opening tag that encloses this text node.
    const openIdx = text.lastIndexOf("<", m.index!);
    const openTag = openIdx >= 0 ? text.slice(openIdx, text.indexOf(">", openIdx) + 1) : "";
    const hasSlot = /\bdata-field="/.test(openTag);
    const idMatch = openTag.match(/\bid="([\w-]+)"/);
    const idWritten = !!idMatch && writtenIds.has(idMatch[1]);
    const isInterpolated = /\$\{|\{\{/.test(t);
    if (!hasSlot && !idWritten && !isInterpolated) {
      if (isQuantity) { unbound++; if (unboundSamples.length < 3) unboundSamples.push(t.slice(0, 60)); }
      else unboundAbs++;
    }
  }

  if (asserts === 0 && binds === 0) continue; // inert page, nothing to say

  const verdict = unbound === 0 ? "OK" : unbound >= 5 ? "SHIPS-ANSWERS" : "PARTIAL";
  rows.push({ file: rel, asserts, unbound, unboundAbs, binds, detail, samples: unboundSamples, verdict });
}

rows.sort((a, b) => b.unbound - a.unbound || b.asserts - a.asserts);

console.log(`\nUNWIRED-SURFACE SWEEP — ${new Date().toISOString().slice(0, 10)} · ${rows.length} surfaces with content\n`);
console.log("UNBOUND-QTY  ABS  SURFACE".padEnd(58) + "SAMPLE UNBOUND QUANTITY");
for (const r of rows) {
  console.log(
    String(r.unbound).padStart(11) + String(r.unboundAbs).padStart(5) + "  " +
    r.file.padEnd(42) + (r.samples[0] ?? ""));
}
const bad = rows.filter((r) => r.unbound > 0);
const totalUnbound = rows.reduce((n, r) => n + r.unbound, 0);
console.log(`\n── ${totalUnbound} UNBOUND QUANTITIES across ${bad.length} surfaces (superlatives counted separately) ──`);
for (const r of bad.slice(0, 12)) {
  console.log(`\n  ${r.file}  (${r.unbound} unbound / ${r.asserts} assertions)`);
  for (const s2 of r.samples) console.log(`      "${s2}"`);
}
console.log("\nAn unbound claim is one no code will ever overwrite: whatever is typed there is what ships.");
console.log("This does NOT decide truth — a hardcoded claim can be true today. It decides ACCOUNTABILITY.\n");
