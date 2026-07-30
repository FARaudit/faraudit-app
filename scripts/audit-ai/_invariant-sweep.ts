// Brain Validation #1 — mid-sentence-span invariant sweep on banked agentic runs.
// For each NHR run: classify the verdict-driver family; for grounding-miss drivers, test whether the
// FULL driver sentence is already present in the run's OWN findings (⇒ a grounding-matcher false-negative
// the panel already captured = FIX-1 repairable). $0, offline, non-destructive.
import * as fs from "fs";
const runs = JSON.parse(fs.readFileSync("/tmp/banked_runs.json", "utf8"));
const nhr = runs.filter((r: any) => r.compliance_json?.v3?.verdict === "NEEDS_HUMAN_REVIEW");

const grab = (s: string): string | null => {
  if (!s) return null;
  const m = [...s.matchAll(/["“”]([^"“”]{6,})["“”]/g)];
  return m.length ? m[m.length - 1][1].trim() : null;
};
const norm = (s: string): string =>
  (s || "").toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const fam = (s: string): string => {
  if (/could not be grounded to a finding/i.test(s)) return "grounding-miss";
  if (/coverage cap|uncovered disqualifier/i.test(s)) return "coverage-cap";
  if (/unclassifiable|BINDING-a|self-determinable|structural bar/i.test(s)) return "binding-untyped";
  return "other";
};

const STOP = new Set("the a an of to in on for and or with shall must be is are will not this that as at by from into any all one".split(" "));
const ctoks = (s: string): string[] => norm(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w));
// FIX-1 fuzzy simulation: fraction of driver content-tokens present in the run's own findings corpus.
const containment = (span: string, corpus: string): number => {
  const dt = ctoks(span); if (!dt.length) return 0;
  const cset = new Set(corpus.split(" "));
  return dt.filter((w) => cset.has(w)).length / dt.length;
};

let grounding = 0, exactCap = 0, fuzzyCap = 0, midFrag = 0;
const famCount: Record<string, number> = {};
const rows: any[] = [];
for (const r of nhr) {
  const reason = r.compliance_json?.v3?.reason || r.bid_recommendation || "";
  const f = fam(reason); famCount[f] = (famCount[f] || 0) + 1;
  const span = grab(reason);
  const findings = r.compliance_json?.v3?.findings || [];
  const corpus = norm(findings.map((x: any) => `${x.excerpt || ""} ${x.requirement || ""}`).join(" || "));
  let mid = false, full = false, cont = 0;
  if (span) { mid = !/[.!?]["'”]?$/.test(span.trim()); const ns = norm(span); full = ns.length > 0 && corpus.includes(ns); cont = containment(span, corpus); }
  const fuzzyGrounded = cont >= 0.7;
  if (f === "grounding-miss") { grounding++; if (full) exactCap++; if (fuzzyGrounded) fuzzyCap++; if (mid) midFrag++; }
  rows.push({ sol: r.solicitation_number, fam: f, mid, full, cont, span: (span || "").slice(0, 64) });
}

console.log(`NHR runs analyzed: ${nhr.length}`);
console.log("NHR driver families:", JSON.stringify(famCount));
console.log(`\ngrounding-miss NHR: ${grounding}  (${((grounding/nhr.length)*100).toFixed(0)}% of NHR)`);
console.log(`  ├─ driver span is a MID-SENTENCE fragment (truncated): ${midFrag}/${grounding}`);
console.log(`  ├─ EXACT: full driver text present in run's own findings: ${exactCap}/${grounding}`);
console.log(`  └─ FUZZY (FIX-1 sim, ≥70% content-token containment) grounded in own findings: ${fuzzyCap}/${grounding}`);
console.log(`\nESTIMATED FIX-1-repairable NHR = ${fuzzyCap}/${nhr.length} NHR (${((fuzzyCap/nhr.length)*100).toFixed(0)}%). Residual NHR after FIX-1 = ${nhr.length-fuzzyCap}.`);
console.log(`\n--- grounding-miss runs (containment score) ---`);
for (const x of rows.filter((x) => x.fam === "grounding-miss"))
  console.log(`  ${x.sol || "?"}  mid=${x.mid ? "Y" : "n"} exact=${x.full ? "Y" : "n"} fuzzy=${(x.cont*100).toFixed(0)}%  ::  "${x.span}"`);
console.log(`\n--- non-grounding NHR families (what FIX-1 will NOT fix) ---`);
for (const x of rows.filter((x) => x.fam !== "grounding-miss"))
  console.log(`  ${x.sol || "?"} [${x.fam}]  ::  "${x.span}"`);
