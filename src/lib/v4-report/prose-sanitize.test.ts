// CUSTOMER-PROSE SANITIZER — card #612-(3d). Strip engine-internal machine artifacts
// that leaked verbatim into the customer report (LBJ 653570ea bottom line + gate list):
// the eligibility-authority adjudication bracket and snake_case gap keys.
// Run: npx tsx src/lib/v4-report/prose-sanitize.test.ts
import { sanitizeProse } from "./build-data";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// ── the adjudication bracket ──
{
  const raw = "DOL Approval for Alcohol and Drug Abuse Specialist prior to providing services — [cited clause is not a recognized bidder-eligibility/set-aside authority (FAR 19 / 13 CFR 121-128); treated as informational, not a show-stopper — confirm]";
  const out = sanitizeProse(raw);
  assert(!/\[cited clause is not a recognized/.test(out), "adjudication bracket removed");
  assert(!out.includes("]"), "no dangling bracket left");
  assert(/\(advisory — not a recognized eligibility bar; confirm\)/.test(out), "replaced with concise customer phrasing");
  assert(out.startsWith("DOL Approval for Alcohol and Drug Abuse Specialist"), "substance before the bracket preserved");
}

// ── snake_case gap keys ──
{
  const raw = "confirm set_aside_eligibility; size_standard before relying on award eligibility";
  const out = sanitizeProse(raw);
  assert(!/set_aside_eligibility/.test(out) && !/size_standard/.test(out), "snake_case keys removed");
  assert(/set-aside eligibility/.test(out), "set_aside_eligibility → set-aside eligibility (hyphen preserved)");
  assert(/size standard/.test(out), "size_standard → size standard");
}

// ── does NOT mangle legitimate prose ──
{
  const raw = "FAR 52.219-14 Limitations on Subcontracting: the prime must self-perform at least 50% of the work.";
  assert(sanitizeProse(raw) === raw, "clean prose (hyphens, %, clause cites) is untouched");
}

// ── CRITICAL: legitimate underscores in load-bearing prose are NOT mangled (review 2026-07-21).
// The old blanket snake_case regex broke KO emails, attachment filenames, and portal URLs. ──
for (const raw of [
  "Submit questions to contract_officer@navy.mil no later than the deadline.",
  "Complete the wage_determination form and price_schedule.xlsx before award.",
  "Portal: https://sam.gov/opp/some_notice_here/view",
]) {
  assert(sanitizeProse(raw) === raw, `legitimate underscore prose untouched: "${raw.slice(0, 42)}…"`);
}
{
  assert(sanitizeProse("") === "", "empty → empty");
  assert(sanitizeProse(null) === "", "null → empty");
  assert(sanitizeProse("NAICS 561320 ($34M size standard)") === "NAICS 561320 ($34M size standard)", "already-spaced 'size standard' untouched");
}

// ── real-shape combined line collapses cleanly (no double spaces) ──
{
  const out = sanitizeProse("confirm set_aside_eligibility; size_standard — [cited clause is not a recognized authority; treated as informational, not a show-stopper — confirm] done");
  assert(!/ {2,}/.test(out), "no double spaces after substitutions");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
