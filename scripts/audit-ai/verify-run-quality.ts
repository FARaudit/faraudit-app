// $0 RUN-QUALITY VERIFIER (card 214 follow-up — CEO quality-review gate, 2026-07-02).
// Independent, deterministic quality check over a persisted run-record — the layer BELOW the panel review.
// Three signals, none of which trust the engine's self-report:
//   1. GROUNDING/FABRICATION — does each finding's `excerpt` actually appear verbatim in the audited source?
//   2. TRUNCATION — is any obligation stored cut off mid-sentence (period-split bug: "$1.", "at: michael.",
//      "…date specified for")? A grounded-but-truncated obligation is a coverage-tick, not actionable content.
//   3. KEY-FACT COVERAGE — does the SOURCE contain a high-value fact (quote deadline · delivery schedule ·
//      Non-Manufacturer Rule) that NO finding surfaces? Omissions are what grounding can never catch.
//
//   npx tsx scripts/audit-ai/verify-run-quality.ts <run-record.json> [--min=0.72] [--json]
//
// Exit 0 = clean. Exit 1 = at least one signal flags → the run needs human eyes BEFORE customer ship.
// Deterministic; no model, no spend. Called automatically at the end of every paid-run.ts (post-run gate).
import fs from "fs";
// isTruncated lives in the engine (audit-excerpt-repair) as THE single truncation detector, shared with the
// card-221 repair pass so the gate and the repair use the SAME definition of "clipped". The card-221 fix
// tightened the address-cut branch (requires a colon) so a clean sentence ending "…to Government." is no
// longer a false positive. NOTE: the gate checks BOTH excerpt and requirement; the repair pass re-grounds
// only the EXCERPT (a verbatim source span). A truncated `requirement` is a model SYNTHESIS with no source
// span to re-ground to — it is (correctly) NOT auto-repaired: STEP-1 retry prevents it at generation time,
// and a stored one honestly fails the gate for human review rather than being model-completed (Rule 64).
// analyzedExcerptOf — SCORE THE ANALYZED SPAN, NOT THE DISPLAY SPAN (review round 4, finding #4). The head
// re-grounding pass widens an excerpt for the reader and stamps the pre-widening span; grounding is a question
// about what the engine ANALYZED. It also grounds against `groundingSource ?? fullSource`, and this gate only
// has `fullSource` — on a compressed-digest run (card 291) a widened head can pull in text the compressor
// removed, so scoring the widened span would report a correctly-grounded finding as possible fabrication on
// the arc's own acceptance instrument.
import { isTruncatedExcerpt, analyzedExcerptOf } from "@/lib/audit-excerpt-repair";

const norm = (s: string) => (s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").replace(/[^a-z0-9 '"$%./-]/g, "").trim();

function coverageRatio(excerpt: string, source: string): number {
  const e = norm(excerpt), s = norm(source);
  if (!e) return 0;
  if (s.includes(e)) return 1;
  const words = e.split(" ");
  if (words.length < 6) return s.includes(e) ? 1 : 0;
  let covered = 0, total = 0; const W = 6;
  for (let i = 0; i + W <= words.length; i += W) { total++; if (s.includes(words.slice(i, i + W).join(" "))) covered++; }
  return total ? covered / total : 0;
}

const isTruncated = isTruncatedExcerpt; // shared detector (see import) — gate flags exactly what repair repairs

// High-value facts every real BD deliverable needs. sourceRe = present in solicitation; findingRe = surfaced.
const KEY_FACTS: Array<{ label: string; sourceRe: RegExp; findingRe: RegExp; severity: "HIGH" | "MED" }> = [
  { label: "quote deadline (due date/time)", sourceRe: /closing response date|offer due date/i, findingRe: /due (date|by)|closing response|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b.*\b(pm|am|edt|est|cst|local time)\b|deadline/i, severity: "HIGH" },
  { label: "delivery schedule / PoP", sourceRe: /delivery schedule|days aro|period of performance/i, findingRe: /deliver(y|ed| within| schedule)|days aro|period of performance/i, severity: "HIGH" },
  { label: "Non-Manufacturer Rule (52.219-33)", sourceRe: /non-?manufacturer rule|52\.219-33/i, findingRe: /non-?manufacturer|52\.219-33/i, severity: "MED" },
];

export interface RunQualityResult {
  total: number;
  grounding: { suspect: number; rows: Array<{ id: string; lens: string; kind: string; ratio: number; ok: boolean }> };
  truncated: Array<{ id: string; lens: string; text: string }>;
  keyFactGaps: Array<{ label: string; severity: string; sourceQuote: string }>;
  pass: boolean;
}

export function verifyRunQuality(rec: any, opts?: { min?: number }): RunQualityResult {
  const min = opts?.min ?? 0.72;
  const source: string = rec.input?.fullSource ?? "";
  const findings: any[] = rec.result?.findings ?? [];
  const rows = findings.map((f) => ({ id: f.id, lens: f.lens, kind: f.kind, ratio: coverageRatio(analyzedExcerptOf(f), source), ok: false }));
  rows.forEach((r) => (r.ok = r.ratio >= min));
  const truncated = findings
    .filter((f) => isTruncated(f.excerpt) || isTruncated(f.requirement))
    .map((f) => ({ id: f.id, lens: f.lens, text: (f.requirement || f.excerpt || "").slice(0, 110) }));
  const keyFactGaps = KEY_FACTS
    .filter((k) => k.sourceRe.test(source) && !findings.some((f) => k.findingRe.test(`${f.requirement} ${f.excerpt}`)))
    .map((k) => ({ label: k.label, severity: k.severity, sourceQuote: (source.match(k.sourceRe)?.input?.slice(source.search(k.sourceRe), source.search(k.sourceRe) + 80) || "").replace(/\s+/g, " ").trim() }));
  const suspect = rows.filter((r) => !r.ok).length;
  const pass = suspect === 0 && truncated.length === 0 && keyFactGaps.length === 0;
  return { total: rows.length, grounding: { suspect, rows }, truncated, keyFactGaps, pass };
}

export function formatRunQuality(rec: any, r: RunQualityResult): string {
  const L: string[] = [];
  L.push(`── RUN-QUALITY · ${rec.meta?.sol ?? "record"} · ${r.total} findings ──`);
  L.push(`1. GROUNDING: ${r.total - r.grounding.suspect}/${r.total} grounded${r.grounding.suspect ? ` · ❌ ${r.grounding.suspect} SUSPECT (possible fabrication)` : " · ✅ no fabricated spans"}`);
  L.push(`2. TRUNCATION: ${r.truncated.length ? `❌ ${r.truncated.length} obligation(s) stored mid-sentence` : "✅ none"}`);
  for (const t of r.truncated.slice(0, 8)) L.push(`      ✂ [${t.lens}] ${t.id}: "${t.text}…"`);
  L.push(`3. KEY-FACT COVERAGE: ${r.keyFactGaps.length ? `❌ ${r.keyFactGaps.length} high-value fact(s) in source but NOT surfaced` : "✅ deadline/delivery/NMR all surfaced (or N/A)"}`);
  for (const g of r.keyFactGaps) L.push(`      ⚠ ${g.severity} — ${g.label}: source has "${g.sourceQuote}…"`);
  L.push(`\n${r.pass ? "✅ RUN-QUALITY PASS — grounded · no truncation · key facts surfaced" : "❌ RUN-QUALITY: HUMAN REVIEW before customer ship (grounding is clean; completeness/formatting is not)"}`);
  return L.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && /verify-run-quality\.ts$/.test(process.argv[1])) {
  const recPath = process.argv[2];
  const min = Number((process.argv.find((a) => a.startsWith("--min=")) || "--min=0.72").split("=")[1]);
  const asJson = process.argv.includes("--json");
  if (!recPath || !fs.existsSync(recPath)) { console.error("usage: verify-run-quality.ts <run-record.json> [--min=0.72] [--json]"); process.exit(2); }
  const rec = JSON.parse(fs.readFileSync(recPath, "utf8"));
  if (!rec.input?.fullSource) { console.error("record has no input.fullSource — cannot verify"); process.exit(2); }
  const r = verifyRunQuality(rec, { min });
  console.log(asJson ? JSON.stringify(r, null, 2) : formatRunQuality(rec, r));
  process.exit(r.pass ? 0 : 1);
}
