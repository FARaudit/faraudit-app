// Gate — Upstream Intel renders the customer's OWN notices, and its draft never invents a
// federal submission.
//
// WHAT SHIPPED BEFORE THIS GATE. /upstream-intel rendered a hardcoded SEED of three notices to
// SIGNED-IN customers as their own upstream feed: invented notice ids, invented agencies,
// invented dates, an `influence_score` drawn as a precise gauge (92 · 78 · 64), and a
// `match_reason` stating a measured-sounding "60% inclusion rate" that nothing measured. No
// "Example" marker anywhere. Both row buttons pointed at those non-existent notices, and one
// pointed at /audit — not a route on this app.
//
// ⛔ AND THE DRAFT PAGE ASKED A MODEL TO INVENT A PAST-PERFORMANCE REFERENCE.
// `capability_statements.past_performance` is an EMPTY ARRAY on the measured account, so the
// only way to satisfy "include a prior performance reference" was to fabricate one — into a
// document a customer may send to a contracting officer. It also named three hardcoded NAICS
// codes as the company's specialities without reading the profile that holds the real ones.
//
// U1 no invented rows · U2 real feed + honest states · U3 the draft is grounded ·
// U4 past performance is never invented · U5 no dead links · U6 planted positives.
//
// Run: npx tsx test/public/_upstream-intel-truth.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/* COMMENTS STRIPPED. Both files explain the defect they fixed and quote the invented values, so
   a raw match convicts the explanation. Three gates in this repo have already done that. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LIST = code(read("src/app/upstream-intel/page.tsx"));
const DRAFT = code(read("src/app/upstream-intel/draft/[noticeId]/page.tsx"));

console.log("U1 · no invented rows");
for (const seed of ["FA8533-26-RFI-0042", "W912DY-26-RFI-0017", "N00024-26-PRESOL-0009"]) {
  ok(!LIST.includes(seed), `the invented notice ${seed} is gone`);
}
ok(!/influence_score/.test(LIST), "the invented influence score is gone",
  "a gauge drawn to the point implies a measurement");
ok(!/match_reason/.test(LIST), "the invented match_reason is gone");
ok(!/inclusion rate/i.test(LIST), "no fabricated statistic remains");
ok(!/\bconst SEED\b/.test(LIST), "no hardcoded seed array remains");

console.log("\nU2 · the rows are the customer's own, and the states are honest");
ok(/fetchLiveOpportunitiesScoped/.test(LIST),
  "rows come from the SAME scoped feed the rest of the platform reads");
ok(/sources sought/i.test(LIST) && /presolicitation/i.test(LIST),
  "and are filtered to the upstream types");
ok(/could not be read/i.test(LIST) && /not an empty result|outage/i.test(LIST),
  "a failed SAM read renders as an OUTAGE, not as an empty feed");
ok(/real zero|not a failure/i.test(LIST),
  "and a genuine zero says so rather than looking broken");

console.log("\nU3 · the draft is written against a real notice");
ok(/fetchLiveOpportunitiesScoped/.test(DRAFT),
  "the draft resolves the notice from the customer's feed");
ok(/not in your feed/i.test(DRAFT),
  "a notice outside their scope is REFUSED, not guessed at");
ok(/capability_statements/.test(DRAFT),
  "company facts come from the capability statement on file");
ok(!/336413\s*\/\s*332710\s*\/\s*332721|336413 . 332710 . 332721/.test(DRAFT),
  "the hardcoded NAICS triple is gone",
  "it asserted specialities the reader's profile may not hold");
ok(/naics_codes/.test(DRAFT), "and the reader's registered codes are read instead");

console.log("\nU4 · past performance is never invented");
ok(/ppCount/.test(DRAFT) && /past_performance/.test(DRAFT),
  "the prompt branches on how many records actually exist");
ok(/PAST PERFORMANCE — ADD A REFERENCE|PAST PERFORMANCE/.test(DRAFT),
  "with none on file it emits a placeholder for the customer to fill");
ok(/do not name a contract, customer, value or date/i.test(DRAFT),
  "and the model is explicitly forbidden to invent one");
ok(/do not add[\s\S]{0,120}certifications/i.test(DRAFT),
  "the prompt also bars invented capabilities and certifications");

console.log("\nU5 · no dead links");
ok(!/href=\{?["`]\/audit\?/.test(LIST) && !/["`]\/audit\?/.test(LIST),
  "the /audit link is gone — that route does not exist",
  "the app serves /audits and /run-audit");
for (const r of ["src/app/audits", "src/app/run-audit", "src/app/notices/[noticeId]", "src/app/settings"]) {
  ok(existsSync(join(ROOT, r)), `${r} exists — a link this page points at resolves`);
}
ok(!existsSync(join(ROOT, "src/app/audit")), "and /audit still does not exist, so the check is live");

console.log("\nU6 · planted positives");
ok(/influence_score/.test('const SEED=[{influence_score:92}]'),
  "the U1 detector would catch a reinstated score");
ok(!/fetchLiveOpportunitiesScoped/.test("const SEED = [];"),
  "the U2 detector would catch a page that stopped reading the feed");
ok(code("/* do not write influence_score here */").indexOf("influence_score") === -1,
  "a comment naming the banned field does not trip the gate");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
