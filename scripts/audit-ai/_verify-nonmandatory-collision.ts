// Proposal seat claims SITE_VISIT_MANDATORY_ATTENDANCE_RE matches MANDATORY inside NON-MANDATORY, so a
// solicitation saying the visit is NOT mandatory reads as mandatory. Same collision class I hit with my own
// grep earlier today. Execute it against the real gold-set sentence, not a paraphrase.
export {};
import { SITE_VISIT_MANDATORY_ATTENDANCE_RE } from "../../src/lib/audit-site-visit-patterns";
const CASES: Array<[string, string, boolean]> = [
  ["gold-set AOCSSB26R0023 L.2.1 verbatim", "A NON-MANDATORY site visit will be held at the Capitol Building, room S-216 on: Tuesday, April 7, 2026, at 1:00 PM EDT", false],
  ["lowercase variant", "a non-mandatory site visit will be held", false],
  ["spaced variant", "a non mandatory site visit will be held", false],
  ["genuinely mandatory", "Attendance at the mandatory site visit is required to be eligible for award", true],
  ["negated prose", "The site visit is not mandatory but is strongly encouraged", false],
  ["FAR 52.237-1 idiom", "Offerors are urged and expected to inspect the site", false],
];
let bad = 0;
for (const [name, text, wantMatch] of CASES) {
  const re = new RegExp(SITE_VISIT_MANDATORY_ATTENDANCE_RE.source, "i");
  const got = re.test(text);
  const hit = re.exec(text)?.[0] ?? "";
  const ok = got === wantMatch;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  ✗✗  "} ${name.padEnd(40)} want=${String(wantMatch).padEnd(5)} got=${String(got).padEnd(5)} ${hit ? `matched:"${hit}"` : ""}`);
}
console.log(`\n${bad ? `❌ ${bad} case(s) wrong — the recognizer reads NOT-mandatory as mandatory` : "✅ all correct"}`);
process.exit(bad ? 1 : 0);
