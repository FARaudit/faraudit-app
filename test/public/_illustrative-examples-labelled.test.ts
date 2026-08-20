// Gate — a worked example on a public page is LABELLED, and never claims it happened.
//
// WHAT SHIPPED BEFORE THIS GATE. The front door and the how-it-works page both carried a
// "proof card" for solicitation FA301626Q0068 / T-38 Intake Plugs: three findings on a P0/P1
// severity ladder, a DFARS 252.223-7008 citation, and captions asserting the work was done —
// "each cited to the clause it came from", "All traps caught · 4 min".
//
// ⛔ THAT AUDIT WAS NEVER RUN. Measured against our own records: zero rows in `audits` match
// the solicitation number, the title, or "Intake Plug". The card is an invention of our own
// output, on the public front door of a federal-compliance product, with no marker.
//
// WHY IT IS LABELLED RATHER THAN DELETED. A worked example does real work — it shows a buyer
// the SHAPE of an audit's output, which is hard to convey in prose. The defect was never that
// the card exists; it is that nothing said it was an example, and the captions said the
// opposite. So the card stays, carries an Illustrative badge, and the captions describe what
// it is instead of asserting an engagement.
//
// E1 every page carrying the example labels it · E2 no caption claims it happened ·
// E3 the label is real CSS, not an unstyled class · E4 planted positives.
//
// Run: npx tsx test/public/_illustrative-examples-labelled.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pageStyles, pageSource } from "./_page-styles";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const PUB = join(process.cwd(), "public");
/* The example's own identifiers. Any page showing these is showing the worked example. */
const MARKERS = ["FA301626Q0068", "T-38 Intake Plugs"];
/* Captions that assert the audit was performed rather than describing an example. */
const CLAIMS = [/All traps caught/i, /each cited to the clause it came from\./i, /caught all three in \w+ minutes/i];

console.log("E1 · every page carrying the worked example labels it");
const carriers: string[] = [];
for (const f of readdirSync(PUB).filter((n) => n.endsWith(".html")).sort()) {
  const html = readFileSync(join(PUB, f), "utf8");
  if (!MARKERS.some((m) => html.includes(m))) continue;
  carriers.push(f);
  ok(/class="badge example"|class="badge example /.test(html) || /demo-script/.test(html),
    `${f} marks the example`,
    "an unlabelled worked example reads as a delivered result");
}
ok(carriers.length > 0, `the example was found on ${carriers.length} page(s)`, carriers.join(", "));

console.log("\nE2 · no caption claims the audit happened");
for (const f of carriers) {
  const html = readFileSync(join(PUB, f), "utf8");
  if (/demo-script/.test(html)) continue;   // a sales script is a different artefact, see E4 note
  const hit = CLAIMS.find((r) => r.test(html));
  ok(!hit, `${f} describes the example instead of asserting it`, hit ? String(hit) : "");
}

console.log("\nE3 · the label is real CSS, not an unstyled class");
for (const f of carriers) {
  const html = readFileSync(join(PUB, f), "utf8");
  if (!/class="badge example"/.test(html)) continue;
  ok(/\.badge\.example\s*\{[^}]*(background|color)/.test(pageStyles(f)),
    `${f} resolves .badge.example to a real rule`,
    "a class with no rule renders as invisible text — PRESENT is not VISIBLE");
}

console.log("\nE4 · planted positives");
ok(CLAIMS.some((r) => r.test('<div class="caught">All traps caught <span>4 min</span></div>')),
  "the E2 detector would catch the old timing claim");
ok(!/class="badge example"/.test('<span class="badge naics">NAICS 336413</span>'),
  "and the E1 detector does not pass on an unlabelled badge row");
ok(MARKERS.every((m) => typeof m === "string" && m.length > 5),
  "the markers are specific enough to find the example, not any page");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
