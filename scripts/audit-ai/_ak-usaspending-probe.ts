// $0 ANSWER-KEY PROBE — which engine-emitted facts are externally checkable against the PUBLIC AWARD RECORD.
//
// SCOPE (Brain ruling, 2026-07-30): win/loss outcome is OUT. `outcome`/`win_probability` at 0 of 110 is a TRUTHFUL
// EMPTY STATE — no bids submitted, no customers. It is not backfilled, and award data is never framed as evidence
// that the product improves with use (card #758 retired that claim).
//
// What IS in scope: facts the engine asserts TODAY about a solicitation that a third party publishes independently.
// USAspending is a federal award database we do not control, do not write to, and cannot bias. For any solicitation
// we audit, the PRIOR award on the same requirement is a public record that settles several of our claims outright.
//
// R58/R64: the capture seat's incumbent figures are a LEAD until confirmed against a raw response with named fields.
// This probe fetches the raw JSON and cites the field path for every figure it reports.
import fs from "fs";

const API = "https://api.usaspending.gov/api/v2";
const OUT = "/tmp/_ak-usaspending-raw.json";

type Row = { claim: string; engineField: string; settledBy: string; verdict: string };

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<Record<string, unknown>>;
}

(async () => {
  console.log("=== A · CONFIRM THE CAPTURE SEAT'S INCUMBENT LEAD (R58: raw response, named fields) ===\n");
  console.log("Lead under test: W9123821P0016 · Susie Lopez · $96,900 · PoP ended 2026-06-14 · 2 offers\n");

  // Keyword search scoped to the requirement, NAICS and place — no reliance on the seat's PIID being right.
  const search = await post("/search/spending_by_award/", {
    filters: {
      keywords: ["Valley Resident Office"],
      award_type_codes: ["A", "B", "C", "D"],
      naics_codes: ["561730"],
      time_period: [{ start_date: "2014-01-01", end_date: "2026-07-30" }],
    },
    fields: ["Award ID", "Recipient Name", "Award Amount", "Start Date", "End Date",
             "Awarding Agency", "Awarding Sub Agency", "Description", "recipient_id", "generated_internal_id"],
    page: 1, limit: 25, sort: "Award Amount", order: "desc", subawards: false,
  });

  const results = (search.results ?? []) as Array<Record<string, unknown>>;
  fs.writeFileSync(OUT, JSON.stringify(search, null, 2));
  console.log(`raw response written → ${OUT}  (${results.length} awards)\n`);

  for (const a of results) {
    console.log(`  Award ID          [results[].["Award ID"]]        = ${a["Award ID"]}`);
    console.log(`  Recipient Name    [results[].["Recipient Name"]]  = ${a["Recipient Name"]}`);
    console.log(`  Award Amount      [results[].["Award Amount"]]    = ${a["Award Amount"]}`);
    console.log(`  Start / End Date  [results[].["Start Date"/"End Date"]] = ${a["Start Date"]} → ${a["End Date"]}`);
    console.log(`  Awarding Sub Ag.  [results[].["Awarding Sub Agency"]]  = ${a["Awarding Sub Agency"]}`);
    console.log(`  Description       [results[].["Description"]]     = ${String(a["Description"] ?? "").slice(0, 70)}`);
    console.log("");
  }

  // ---- Adjudicate the lead, field by field --------------------------------------------------------------------
  const hit = results.find((a) => String(a["Award ID"]).replace(/[^A-Z0-9]/gi, "").toUpperCase().includes("W9123821P0016"));
  console.log("=== B · ADJUDICATION OF THE LEAD ===");
  if (!hit) {
    console.log("  ⚠ W9123821P0016 NOT returned by this filter set — the seat's PIID is UNCONFIRMED by this query.");
    console.log("    That is not a refutation: keyword+NAICS filters can miss. Treated as UNCONFIRMED, not false.");
  } else {
    const amt = Number(hit["Award Amount"]);
    console.log(`  PIID              CONFIRMED — ${hit["Award ID"]}`);
    console.log(`  Recipient         ${String(hit["Recipient Name"]).toUpperCase().includes("LOPEZ") ? "CONFIRMED" : "REFUTED"} — raw: ${hit["Recipient Name"]}`);
    console.log(`  Award Amount      ${amt === 96900 ? "CONFIRMED" : `DIVERGES — seat said 96900, raw says ${amt}`}`);
    console.log(`  PoP end           ${String(hit["End Date"]).startsWith("2026-06-14") ? "CONFIRMED" : `DIVERGES — seat said 2026-06-14, raw says ${hit["End Date"]}`}`);
    console.log(`  Offers received   NOT IN THIS RESPONSE — 'number of offers' is not a field of spending_by_award;`);
    console.log(`                    it requires the award-detail endpoint. Seat's "2 offers" stays UNCONFIRMED here.`);
  }

  // ---- The answer key itself ----------------------------------------------------------------------------------
  console.log("\n=== C · ANSWER KEY — engine claims settleable by the public award record ===\n");
  const key: Row[] = [
    { claim: "NAICS code for this requirement", engineField: "audits.naics_code",
      settledBy: "prior award's naics_code on the same requirement",
      verdict: "SETTLES — a mismatch against every prior award on the same PoP/office is a hard signal" },
    { claim: "Set-aside program", engineField: "audits.set_aside",
      settledBy: "prior award's type_set_aside", verdict: "CORROBORATES — programs change between cycles; agreement across 2+ cycles is strong, one cycle is weak" },
    { claim: "Awarding office / agency", engineField: "audits.office_leaf / agency",
      settledBy: "awarding_agency + awarding_sub_agency", verdict: "SETTLES — stable across cycles" },
    { claim: "Contract type (FFP)", engineField: "engine finding (type_of_contract_pricing)",
      settledBy: "prior award's type_of_contract_pricing", verdict: "CORROBORATES — the agency can change vehicle" },
    { claim: "Order of magnitude for pricing", engineField: "NOT EMITTED TODAY",
      settledBy: "prior award total_obligation over the same scope", verdict: "GAP — the engine gives a bidder no anchor; the record does" },
    { claim: "Incumbent identity + expiry", engineField: "audits.incumbent_name / incumbent_expiry (0 of 110 set)",
      settledBy: "recipient + period_of_performance_current_end_date", verdict: "SETTLES — and the lookup never runs today" },
  ];
  for (const r of key) {
    console.log(`  • ${r.claim}`);
    console.log(`      engine: ${r.engineField}`);
    console.log(`      record: ${r.settledBy}`);
    console.log(`      → ${r.verdict}\n`);
  }

  console.log("EXPLICITLY OUT OF THE KEY (Brain ruling): did OUR bidder win. No bids submitted, no customers —");
  console.log("`outcome` at 0 of 110 is a truthful empty state, not a backlog. Nothing here is evidence that the");
  console.log("product improves with use; these are third-party facts about a solicitation, checkable on day one.");
})();
