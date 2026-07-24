// Vehicle F · D1 cert — E operative-eligibility quote-hardening (flag AUDIT_ELIG_OPERATIVE_EXCERPT, default-OFF).
// FAITHFUL to e63bd1e7 (L40-D4): the operative attendance-eligibility sentence and the "held and concluded" marker sit
// >600 chars apart (SAM chronological-UPDATE layout), so the notice-wide fallback grounds the finding on the bare
// recital → item E fails → the gate goes unnamed (tier-1 was 1 of 2). D1 prepends the operative sentence so E passes.
// Run: npx tsx src/lib/audit-decide-elig-operative-excerpt.test.ts
import { emitNoticeBodyEligBarFindings } from "./audit-orchestrator";
import { hasOperativeEligibilityLanguage } from "./audit-decide";

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// Far-apart layout (>600 chars of filler between the operative bar and the unique concluded marker).
const FILLER = "The following administrative provisions apply to this acquisition and are provided for offeror awareness. " +
  "Questions regarding the scope of work shall be submitted via Request for Information in accordance with the instructions herein. " +
  "The Government intends to award on a lowest-price technically-acceptable basis subject to the terms of the resulting order. " +
  "All interested parties are responsible for monitoring this posting for amendments and updates through the closing date. ";
const NOTICE = `You must attend the Initial Site Visit for the project to be considered eligible to propose. ${FILLER}${FILLER}UPDATE 01 - May 28, 2026: The site visit was held and concluded on May 28, 2026. Offers are due later per amendment.`;
const emit = () => emitNoticeBodyEligBarFindings(NOTICE, [], NOTICE, null);
const siteVisitFinding = (fs: ReturnType<typeof emit>) =>
  fs.find((f) => /site\s*visit/i.test(`${f.requirement} ${f.excerpt}`));

// notice-wide fallback must be on for the far-apart concluded marker to reframe (matches the real run config).
process.env.AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE = "true";

console.log("\n── FLAG OFF ⇒ bare-recital excerpt ⇒ item E FAILS (gate unnamed) ──");
{
  delete process.env.AUDIT_ELIG_OPERATIVE_EXCERPT;
  const sv = siteVisitFinding(emit());
  ok(!!sv, "site-visit eligibility finding emitted");
  ok(!!sv && !hasOperativeEligibilityLanguage(sv.excerpt ?? ""), `flag-OFF excerpt lacks operative language (E fails) — excerpt: "${(sv?.excerpt ?? "").slice(0, 70)}…"`);
}

console.log("\n── FLAG ON ⇒ operative sentence prepended ⇒ item E PASSES (gate can be named) ──");
{
  process.env.AUDIT_ELIG_OPERATIVE_EXCERPT = "true";
  const sv = siteVisitFinding(emit());
  ok(!!sv, "site-visit eligibility finding emitted");
  ok(!!sv && hasOperativeEligibilityLanguage(sv.excerpt ?? ""), `flag-ON excerpt carries operative language (E passes) — excerpt: "${(sv?.excerpt ?? "").slice(0, 90)}…"`);
  ok(!!sv && /concluded/i.test(sv.excerpt ?? ""), "flag-ON excerpt still carries the concluded framing (no information lost)");
}
delete process.env.AUDIT_ELIG_OPERATIVE_EXCERPT;
delete process.env.AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE;

console.log(failures === 0 ? "\n✅ ALL GREEN — D1 operative-eligibility quote-hardening" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
