// Brain card 75-R1: rebuild the NO_BID source so the agentic engine actually grounds the impossibility.
// $0. The trailing AMENDMENT block (v1, unattributed) is GONE. The synthetic delivery contradiction now
// lives in a recognizable SECTION F (supersedes base §F 90-day + SOW §IV 8-month). §B is grounded from the
// real CLIN. Verbatim binding clause wording (60-day non-waivable FAT / 30-day ARO) is preserved so the
// frozen key's sourceCites still resolve. Writes a CANDIDATE v2 source (does NOT touch the committed v1).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const RAW = new URL("./gold-sets/_nobid-base-raw/", import.meta.url).pathname;
let sol = readFileSync(`${RAW}sol.txt`, "utf8");
let sow = readFileSync(`${RAW}sow.txt`, "utf8");
const reqinfo = readFileSync(`${RAW}reqinfo.txt`, "utf8");

const must = (cond, msg) => { if (!cond) { console.error(`ASSERT FAILED: ${msg}`); process.exit(1); } };

// ── EDIT 1 · §B grounding (real CLIN → explicit binding obligation under a recognized SECTION B header) ──
const bBefore = sol;
sol = sol.replace(
  "Supplies or Services & Prices or Costs",
  `SECTION B — SUPPLIES OR SERVICES AND PRICES/COSTS

Supplies or Services & Prices or Costs

CLIN 0001 (binding supply obligation): The Contractor shall furnish and deliver one (1) each High Dynamic Range Thermal Imaging System in accordance with the Statement of Work (Section C). Product Service Code: 5855. Pricing Arrangement: Firm-Fixed-Price. Quantity: 1 Each. Unit: Each. F.O.B. Destination, Wright-Patterson AFB, OH. The Contractor shall deliver the supplies and the Government shall accept and pay the firm-fixed-price upon final inspection and acceptance.`,
);
must(sol !== bBefore && sol.includes("SECTION B — SUPPLIES OR SERVICES"), "§B header/obligation not inserted");

// ── EDIT 2 · §F supersession (replace base 'Deliveries or Performance' 90-day schedule with synthetic §F) ──
const SECTION_F = `SECTION F — DELIVERIES OR PERFORMANCE [SYNTHETIC-ADVERSARIAL AMENDMENT — SUPERSEDES BASE §F]

================================================================================
[SYNTHETIC-ADVERSARIAL PROVENANCE — HUMAN AUTHORING NOTE, NOT THE GOVERNMENT'S SOLICITATION, NOT A BINDING TERM]
Provenance: Authored by Brain (cards 72 / 75-R1 / 76-R1), 2026-06-27, as a clearly-labeled
FRONTIER-adversarial Section F that SUPERSEDES and VOIDS all base delivery terms (the base
§F 90-day schedule and the SOW §IV "8 months" target). Synthetic test artifact; never the
real solicitation. Everything between these banners is synthetic.
AUTHORING NOTE (net-effect / derivation — for HUMANS ONLY; deliberately demoted OUT of the
binding solicitation body per card 76-R1 so the engine must DERIVE the conflict itself, not
read the conclusion): because F.1 imposes a non-waivable 60-day first-article precondition
before any delivery and F.2 mandates delivery within 30 days ARO, and 60 > 30, the delivery
window is universally unmeetable from award by every bidder — a solicitation-side
impossibility, not a bidder bar. The correct disposition is NO_BID; the offeror stays
eligible. THIS NET-EFFECT STATEMENT IS NOT PART OF THE SOLICITATION AND IS NOT READ AS A TERM.
================================================================================

F.1 FIRST ARTICLE APPROVAL — GOVERNMENT TESTING (FAR 52.209-4, ADAPTED) [SYNTHETIC]
(a) Before producing or delivering any production unit, the Contractor shall deliver one (1)
first article unit for Government first article testing and approval. First article testing
is a NON-WAIVABLE precondition to production and delivery. The Contracting Officer SHALL NOT
waive first article testing under any circumstances and SHALL NOT authorize production,
shipment, or delivery of any production unit until first article approval is granted in writing.
(b) The Government will require SIXTY (60) calendar days to conduct first article testing and
issue the written approval notice, measured from receipt of the first article unit. No
production delivery may occur before the close of this 60-day Government testing period.

F.2 TIME OF DELIVERY (FAR 52.211-8, ADAPTED) [SYNTHETIC]
The Contractor shall deliver all production units, F.O.B. destination (Wright-Patterson AFB,
OH), NOT LATER THAN THIRTY (30) calendar days After Receipt of Order (ARO), i.e., within 30
calendar days after the date of award. This 30-day production delivery requirement is fixed
by the Government and is identical for all offerors. It SUPERSEDES and VOIDS the base 90-day
and 8-month delivery terms.

F.3 DELIVERY SCHEDULE IS BINDING; A NONCONFORMING SCHEDULE IS UNACCEPTABLE [SYNTHETIC]
The 30-day production delivery schedule in F.2 is a material, binding requirement and a
condition of award. Any quotation that does not unconditionally commit to delivery within 30
days ARO, or whose delivery is contingent on a date later than 30 days ARO,
will be rated UNACCEPTABLE and ineligible for award. The Government will make no tradeoff and
grant no exception to this delivery schedule. Any quotation contingent on a later date will be rated UNACCEPTABLE.
================================================================================
[END SYNTHETIC-ADVERSARIAL SECTION F]
================================================================================

`;
const fBefore = sol;
must(/90 Calendar Days/.test(sol), "base 90-day schedule not present pre-edit");
sol = sol.replace(/Deliveries or Performance[\s\S]*?UNITED STATES\n/, SECTION_F);
must(sol !== fBefore && sol.includes("SECTION F — DELIVERIES OR PERFORMANCE"), "§F block not inserted");
must(!/90 Calendar Days/.test(sol), "base 90-day competing term still present (supersession failed)");

// ── EDIT 3 · neutralize the competing SOW §IV 8-month delivery target ──
const sBefore = sow;
sow = sow.replace(
  /Delivery is required by the earliest possible delivery date, not to exceed 8 months after receipt of\s*\n?\s*Award\./,
  "Delivery is governed exclusively by SECTION F (Deliveries or Performance) of the solicitation, as amended. [The base 8-month delivery target is SUPERSEDED and VOIDED by the SECTION F synthetic-adversarial amendment.]",
);
must(sow !== sBefore && !/8 months after receipt/.test(sow), "SOW §IV 8-month term not neutralized");

// ── assemble (NO trailing AMENDMENT block — it is gone) ──
const full = [
  ["SOLICITATION — FA860126Q00260001 (base, verbatim from SAM; §B grounded + §F superseded)", sol],
  ["STATEMENT OF WORK — THERMAL IMAGER (base, verbatim from SAM; §IV delivery superseded by §F)", sow],
  ["REQUIRED INFORMATION SHEET (base, verbatim from SAM)", reqinfo],
].map(([h, t]) => `\n\n===== ${h} =====\n\n${t}`).join("\n");

const out = new URL("./gold-sets/FA860126Q00260001-FULL-SOURCE.v2.complete.txt", import.meta.url).pathname;
writeFileSync(out, full);
const sha = createHash("sha256").update(full, "utf8").digest("hex");
console.log(`wrote ${out}`);
console.log(`bytes=${Buffer.byteLength(full, "utf8")}`);
console.log(`source_sha256=${sha}`);
