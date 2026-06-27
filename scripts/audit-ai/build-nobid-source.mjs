// Builds the NO_BID gold source: REAL base package FA860126Q00260001 (fetched from SAM, source of
// record) + a CLEARLY-LABELED [SYNTHETIC-ADVERSARIAL] mod layer authored by Brain (card 72/NO_BID).
// The mod creates a Government-controlled, four-corners, UNIVERSALLY-unmeetable delivery contradiction
// (60-day non-waivable First Article precondition vs 30-day-ARO binding production delivery). It is a
// labeled test artifact; the synthetic layer is fenced + annotated and never blended into base text.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const RAW = new URL("./gold-sets/_nobid-base-raw/", import.meta.url).pathname;
const base = [
  ["SOLICITATION — FA860126Q00260001 (base, verbatim from SAM)", readFileSync(`${RAW}sol.txt`, "utf8")],
  ["STATEMENT OF WORK — THERMAL IMAGER (base, verbatim from SAM)", readFileSync(`${RAW}sow.txt`, "utf8")],
  ["REQUIRED INFORMATION SHEET (base, verbatim from SAM)", readFileSync(`${RAW}reqinfo.txt`, "utf8")],
].map(([h, t]) => `\n\n===== ${h} =====\n\n${t}`).join("\n");

const SYNTH = `

================================================================================
[SYNTHETIC-ADVERSARIAL MODIFICATION — NOT PART OF THE GOVERNMENT'S ACTUAL SOLICITATION]
Provenance: Authored by Brain (card 72 / NO_BID pole), 2026-06-26, as a clearly-labeled
FRONTIER-adversarial layer over the genuine base package FA860126Q00260001 (the real
source of record, fetched from SAM.gov). This layer exists ONLY to anchor the NO_BID gold
key — a Government-controlled, four-corners, UNIVERSALLY-unmeetable delivery contradiction.
It is a synthetic test artifact and must NEVER be presented or treated as the real
solicitation. Everything between these banners is synthetic.
================================================================================

AMENDMENT 0001 — REVISED DELIVERY AND FIRST ARTICLE REQUIREMENTS  [SYNTHETIC-ADVERSARIAL]

The following three clauses REPLACE the delivery terms of the base solicitation (Statement
of Work Section IV "Delivery and Training" and the base Deliveries-or-Performance delivery
schedule) in their entirety. They are imposed by the Government and apply identically to
every offeror.

[SYNTHETIC-ADVERSARIAL] SYNTHETIC CLAUSE 1 — FIRST ARTICLE APPROVAL, GOVERNMENT TESTING (FAR 52.209-4, ADAPTED)
(a) Before producing or delivering any production unit, the Contractor shall deliver one (1)
first article unit for Government first article testing and approval. First article testing
is a NON-WAIVABLE precondition to production and delivery. The Contracting Officer SHALL NOT
waive first article testing under any circumstances and SHALL NOT authorize production,
shipment, or delivery of any production unit until first article approval is granted in
writing.
(b) The Government will require SIXTY (60) calendar days to conduct first article testing and
issue the written approval notice, measured from receipt of the first article unit. No
production delivery may occur before the close of this 60-day Government testing period.

[SYNTHETIC-ADVERSARIAL] SYNTHETIC CLAUSE 2 — TIME OF DELIVERY (FAR 52.211-8, ADAPTED)
The Contractor shall deliver all production units, F.O.B. destination, NOT LATER THAN
THIRTY (30) calendar days After Receipt of Order (ARO), i.e., within 30 calendar days after
the date of award. This 30-day production delivery requirement is fixed by the Government and
is identical for all offerors.

[SYNTHETIC-ADVERSARIAL] SYNTHETIC CLAUSE 3 — DELIVERY SCHEDULE IS BINDING; A NONCONFORMING SCHEDULE IS UNACCEPTABLE
The 30-day production delivery schedule in Synthetic Clause 2 is a material, binding
requirement and a condition of award. Any quotation that does not unconditionally commit to
delivery within 30 days ARO, or whose delivery is contingent on a date later than 30 days
ARO, will be rated UNACCEPTABLE and ineligible for award. The Government will make no
tradeoff and grant no exception to this delivery schedule.

[SYNTHETIC-ADVERSARIAL] NET EFFECT (four-corners, Government-controlled, universal):
First article approval is a non-waivable precondition that consumes a minimum of SIXTY (60)
days (Synthetic Clause 1) before any production delivery is permitted, while production
delivery is mandated within THIRTY (30) days ARO (Synthetic Clause 2) and that schedule is
binding and Unacceptable-if-missed (Synthetic Clause 3). Because 60 > 30, NO offeror — no
matter its inventory, capacity, lead time, or capability — can deliver a production unit
within 30 days of award when 60 days of mandatory Government first article testing must first
elapse. The delivery window is physically unmeetable from award by EVERY bidder. This is a
solicitation-side impossibility — a defect in the Government's own schedule — not a
bidder-specific eligibility bar. The correct disposition is NO_BID (walk away); the offeror
remains eligible (unrestricted, no set-aside), so no eligibility or set-aside bar applies.

================================================================================
[END SYNTHETIC-ADVERSARIAL MODIFICATION]
================================================================================
`;

const full = base + SYNTH;
const out = new URL("./gold-sets/FA860126Q00260001-FULL-SOURCE.complete.txt", import.meta.url).pathname;
writeFileSync(out, full);
const sha = createHash("sha256").update(full, "utf8").digest("hex");
console.log(`wrote ${out}`);
console.log(`bytes=${Buffer.byteLength(full, "utf8")}`);
console.log(`source_sha256=${sha}`);
