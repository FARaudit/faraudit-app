// $0 PROOF for the UCF BLIND-APERTURE FALLBACK (#SEQ5-ROOTS root b).
// Run: npx tsx src/lib/ucf-blind-section-fallback.test.ts
//
// FIXTURE = the banked run record for the panel-F gate-4 failure (150c3ab3 / 36C25626Q1137). Replays the real
// 133K-char fullSource under the run's own flagEnv, so this is the forensic reproduced as an executable gate —
// not a synthetic approximation. The original probe was lost uncommitted in a recycled worktree; this one is
// committed BECAUSE of that.
//
// PROVEN RED AT FLAG-OFF, GREEN AT FLAG-ON. The RED legs are the point: at flag-OFF the four panel-F omissions
// are IN NO SLICE and every lens reads empty text. A leg that cannot fail proves nothing, so each flag-OFF
// assertion below asserts the BUG's presence, and each flag-ON assertion asserts it is gone.
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { buildPanelInputs, liveLensKeyUnion, anyLensStarvedUnderLiveMap } from "./panel-adapter";
import { detectDocumentClass, ucfHeaderCount } from "./panel-doc-class";
import { LENS_SECTIONS, lensAssignedSections, type PanelLensKey } from "./agentic-sections";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

const REC = join(
  process.cwd(),
  "scripts/audit-ai/run-records/_ua-cohort/36C25626Q1137__150c3ab3-9252-40a4-9ed3-49e64547eb70.json",
);
if (!existsSync(REC)) { console.error(`FIXTURE MISSING: ${REC}`); process.exit(1); }
const rec = JSON.parse(readFileSync(REC, "utf8"));
const src: string = rec.input.fullSource;

// The run's exact flagEnv, minus the flag under test (each pole sets that explicitly below).
const BASE_ENV: Record<string, string> = {};
for (const [k, v] of Object.entries(rec.meta.flagEnv as Record<string, string>)) {
  if (/^AUDIT_[A-Z0-9_]+$/.test(k) && k !== "AUDIT_UCF_BLIND_SECTION_FALLBACK") BASE_ENV[k] = String(v);
}
const applyEnv = (flagOn: boolean) => {
  for (const k of Object.keys(process.env)) if (k.startsWith("AUDIT_")) delete process.env[k];
  Object.assign(process.env, BASE_ENV);
  if (flagOn) process.env.AUDIT_UCF_BLIND_SECTION_FALLBACK = "true";
};

// The four omissions the expert panel caught as missing from the report. Each IS present in fullSource.
const OMISSIONS: Array<{ label: string; re: RegExp }> = [
  { label: "WD wage determination", re: /wage determination|\bWD\b\s*\d|Service Contract (?:Act|Labor Standards)/i },
  { label: "submission email/format kill-gate", re: /shall be (?:emailed|submitted via email)|email(?:ed)? to\b[^\n]{0,80}@|portable document format|\bAdobe\b/i },
  { label: "questions deadline 0900", re: /0900|9:00 ?a\.?m\.?/i },
  { label: "size standard $22.0M", re: /\$22(?:\.0)? ?million|22\.0 million|852\.219-75|\$22,000,000/i },
];
const slicesContaining = (sectionText: Record<string, string>, re: RegExp) =>
  Object.entries(sectionText).filter(([, t]) => re.test(t)).map(([k]) => k);

console.log("── FIXTURE INTEGRITY ─────────────────────────────────────────────");
assert(src.length > 100_000, `fullSource is the real 133K package (${src.length} chars)`);
assert(ucfHeaderCount(src) >= 3, `class detector counts ${ucfHeaderCount(src)} canonical UCF headers (≥3)`);
assert(detectDocumentClass(src) === "ucf", "class dispatch = ucf");
for (const o of OMISSIONS) assert(o.re.test(src), `omission present in fullSource: ${o.label}`);

console.log("\n── RED POLE (flag OFF — today's shipped behavior) ────────────────");
applyEnv(false);
const off = buildPanelInputs(src);
assert(Object.keys(off.sectionText).length === 0, "BUG REPRODUCED: sectionText is EMPTY — every lens reads nothing");
assert(off.detectedSections.size === 0, "BUG REPRODUCED: detectedSections is empty");
assert(off.manifest.ok === false, "BUG REPRODUCED: manifest gate !ok (panel suppressed)");
const offUnreachable = OMISSIONS.filter((o) => slicesContaining(off.sectionText, o.re).length === 0);
assert(
  offUnreachable.length === OMISSIONS.length,
  `BUG REPRODUCED: all ${OMISSIONS.length} omissions are IN NO SLICE (${offUnreachable.map((o) => o.label).join(" · ")})`,
);

console.log("\n── GREEN POLE (flag ON — the rescue) ─────────────────────────────");
applyEnv(true);
const on = buildPanelInputs(src);
assert(Object.keys(on.sectionText).length > 0, "RESCUED: sectionText is populated");
assert(on.documentClass === "ucf", "documentClass stays TRUTHFUL (ucf — the doc really is UCF-shaped)");
const stillUnreachable = OMISSIONS.filter((o) => slicesContaining(on.sectionText, o.re).length === 0);
assert(
  stillUnreachable.length === 0,
  `RESCUED: every omission is now reachable in a slice${stillUnreachable.length ? ` — STILL BLIND: ${stillUnreachable.map((o) => o.label).join(" · ")}` : ""}`,
);

// COMPLETE COVERAGE, not just omission reachability. The first version of this probe asserted only that the four
// KNOWN omissions were reachable — and a routing-based rescue passed the lens-starvation check while silently
// dropping the pre-first-anchor head, stranding the questions-deadline kill-gate. A phrase list only ever finds
// the omissions someone already thought of, so assert the STRUCTURAL property instead: the rescued slices must
// span the entire source, leaving no region unreadable by any lens.
const coveringSlices = Object.entries(on.sectionText).filter(([, t]) => t.includes(src));
assert(
  coveringSlices.length > 0,
  `COMPLETE COVERAGE: at least one rescued slice spans the ENTIRE source (no dropped head/tail region)`,
);
// Spot-check the head specifically — the region routing drops.
const head = src.slice(0, 2_000);
assert(
  Object.values(on.sectionText).some((t) => t.includes(head)),
  "the document HEAD (first 2K chars — where the questions deadline lives) is inside a rescued slice",
);

// The card #549 trap: no lens may be left reading nothing under the LIVE map.
const placed = Object.keys(on.sectionText);
assert(
  !anyLensStarvedUnderLiveMap(placed, "ucf"),
  `NO LENS STARVED under the live map (placed=[${placed.join(",")}])`,
);
for (const lens of Object.keys(LENS_SECTIONS) as PanelLensKey[]) {
  const assigned = lensAssignedSections(lens, "ucf");
  const got = assigned.filter((k) => placed.includes(k));
  assert(got.length > 0, `  lens ${lens} owns [${assigned.join(",")}] and received [${got.join(",")}]`);
}

// The gate must be the CONTENT scan, not a populated-key count. If checkManifest had been used, populating the
// bundle keys would flip ok→true for free; this asserts the gate tracks real content instead.
console.log("\n── GATE PROVENANCE (no phantom-key credit) ───────────────────────");
assert(
  on.manifest.statement.includes("iddable") || on.manifest.missing.length > 0,
  `gate is the biddable-content scan, not a key count — "${on.manifest.statement.slice(0, 90)}…"`,
);

// Falsification: the rescue must NOT fire on a healthy UCF package, nor on a commercial one.
console.log("\n── FALSIFICATION (the rescue must stay narrow) ───────────────────");
const HEALTHY_UCF = [
  "SECTION A - SOLICITATION/CONTRACT FORM", "Standard Form 33 follows.",
  "SECTION B - SUPPLIES OR SERVICES AND PRICES", "CLIN 0001 base year services, unit price firm-fixed.",
  "SECTION C - DESCRIPTION/SPECIFICATIONS", "The contractor shall perform the statement of work herein.",
  "SECTION I - CONTRACT CLAUSES", "52.212-4 applies. Contract clauses incorporated by reference.",
  "SECTION L - INSTRUCTIONS TO OFFERORS", "Offerors shall submit a technical volume not to exceed 20 pages.",
  "SECTION M - EVALUATION FACTORS FOR AWARD", "Award will be made on a best-value tradeoff basis.",
].join("\n");
applyEnv(true);
const healthy = buildPanelInputs(HEALTHY_UCF);
assert(detectDocumentClass(HEALTHY_UCF) === "ucf", "healthy fixture is UCF-classed");
assert(Object.keys(healthy.sectionText).length > 0, "healthy UCF still slices normally");
const healthyOffEnv = (() => { applyEnv(false); return buildPanelInputs(HEALTHY_UCF); })();
assert(
  JSON.stringify(Object.keys(healthy.sectionText).sort()) === JSON.stringify(Object.keys(healthyOffEnv.sectionText).sort())
    && healthy.manifest.ok === healthyOffEnv.manifest.ok,
  "healthy UCF is UNTOUCHED by the flag (rescue did not fire)",
);

// Degenerate source: must NOT manufacture phantom sections out of nothing.
applyEnv(true);
const empty = buildPanelInputs("SECTION A\nSECTION B\nSECTION C\n");
assert(
  empty.manifest.ok === false,
  "a contentless header-only stub still honest-fails the biddable gate (no fabricated verdict)",
);

console.log("\n── liveLensKeyUnion sanity ───────────────────────────────────────");
const union = liveLensKeyUnion("ucf");
const expected = [...new Set(Object.values(LENS_SECTIONS).flat())].sort();
assert(JSON.stringify(union) === JSON.stringify(expected), `union spans every assigned key: [${union.join(",")}]`);

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
