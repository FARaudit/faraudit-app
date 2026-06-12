// FA-153 gate — OHA appeal window anchors to original issuance, restarts only
// on NAICS-changing amendments. Run: npx tsx test/verify-fa153-appeal-window.ts
//
// Fixture mirrors the live FA460026Q0047 history (SAM opps/v2 …/history,
// fetched 2026-06-12): v1 submit 2026-06-03, Amendment 0001 (PWS re-upload)
// 2026-06-08, Amendment 0002 (site-visit/EAL dates) 2026-06-09 — NAICS 561210
// primary on all three versions.

import { deriveAppealAnchor, appealWindowCloseDate, type NoticeVersion } from "../src/lib/sam-history";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}${ok ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!ok) failures++;
}

// ── Fixture 1: FA460026Q0047 — amendments do NOT restart the clock ──────────
const fa460026q0047: NoticeVersion[] = [
  { opportunityId: "b0d9dd1a47034553adf8eb0add442259", postedDate: "2026-06-03", naics: "561210" },
  { opportunityId: "c83463f4083b4d2a89e89ca406d14357", postedDate: "2026-06-08", naics: "561210" }, // Amd 0001 — PWS re-upload
  { opportunityId: "d612cc613d33400b96cec0a906247382", postedDate: "2026-06-09", naics: "561210" }  // Amd 0002 — site-visit/EAL dates
];
const a1 = deriveAppealAnchor(fa460026q0047);
check("FA460026Q0047 original issuance", a1.originalPostedDate, "2026-06-03");
check("FA460026Q0047 anchor = original (no restart)", a1.anchorDate, "2026-06-03");
check("FA460026Q0047 amendments did not restart", a1.naicsChangedByAmendment, false);
check("FA460026Q0047 window closes 06-13 (NOT 06-19 off posted_date)", appealWindowCloseDate(a1.anchorDate!), "2026-06-13");
check("FA460026Q0047 version count", a1.versionCount, 3);

// ── Fixture 2: synthetic NAICS-changing amendment DOES restart ──────────────
const naicsChanged: NoticeVersion[] = [
  { opportunityId: "v1", postedDate: "2026-06-03", naics: "561210" },
  { opportunityId: "v2", postedDate: "2026-06-08", naics: "238150" } // NAICS change → FAR 19.103(a)(1) restart
];
const a2 = deriveAppealAnchor(naicsChanged);
check("NAICS-change keeps original issuance", a2.originalPostedDate, "2026-06-03");
check("NAICS-change restarts anchor to amendment date", a2.anchorDate, "2026-06-08");
check("NAICS-change flagged", a2.naicsChangedByAmendment, true);
check("NAICS-change window closes from amendment", appealWindowCloseDate(a2.anchorDate!), "2026-06-18");

// ── Fixture 3: unretrievable version NAICS → conservative, no restart ────────
const holey: NoticeVersion[] = [
  { opportunityId: "v1", postedDate: "2026-06-03", naics: "561210" },
  { opportunityId: "v2", postedDate: "2026-06-08", naics: null }
];
const a3 = deriveAppealAnchor(holey);
check("missing version NAICS → no restart claimed", a3.naicsChangedByAmendment, false);
check("missing version NAICS → anchor stays original", a3.anchorDate, "2026-06-03");

// ── Fixture 4: failure contract — nulls, never a fabricated date ────────────
check("empty history → UNKNOWN", deriveAppealAnchor([]).originalPostedDate, null);
check("dateless v1 → UNKNOWN", deriveAppealAnchor([{ opportunityId: "x", postedDate: null, naics: null }]).anchorDate, null);
check("malformed anchor → null close", appealWindowCloseDate("not-a-date"), null);

// ── Fixture 5: month rollover in the +10 math ────────────────────────────────
check("month rollover (2026-06-25 → 2026-07-05)", appealWindowCloseDate("2026-06-25"), "2026-07-05");

console.log(failures === 0 ? "\nFA-153 gate: ALL PASS" : `\nFA-153 gate: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
