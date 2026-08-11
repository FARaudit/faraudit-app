// ━━ Recent contract actions in the customer's own NAICS codes ━━
//
// The Defense News page carried two surfaces that had never been connected to
// anything: a sidebar reading "Award feed unavailable — no live award source is
// connected" and a ticker animating that same sentence. This is the source.
//
// WHY USASPENDING AND NOT THE DoD PRESS RELEASES. The daily "Contracts For
// <date>" announcements are prose digests covering every service, with no NAICS
// on them — turning them into rows means extracting structure from paragraphs,
// and the result still would not be scoped to this customer's codes. The panel's
// own title is "your NAICS", so the source has to be the one that filters by
// NAICS. USAspending does, it is free, it needs no key, and each row already
// carries the work description and an award id that links to the public record.
//
// WHAT THESE ROWS ARE, precisely, because the panel must say it: contract
// ACTIONS — new awards and modifications alike — whose action date falls in the
// window, ranked by value. A modification on a 2016 contract is a real signal
// (money moving now on an existing vehicle) and it is not a new award, so the
// page says "contract actions", never "new awards".

import { unstable_cache } from "next/cache";

const API = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

/** Prime contract types: definitive · purchase order · delivery order · BPA
 *  call. Matches the set agents/defense-spending uses, so a figure here and a
 *  figure there cannot disagree about what counts as a contract. */
const AWARD_TYPES = ["A", "B", "C", "D"];

export const AWARDS_WINDOW_DAYS = 30;
const PAGE_LIMIT = 25;

export interface AwardRow {
  award_id: string;
  recipient: string;
  amount: number;
  agency: string | null;
  sub_agency: string | null;
  naics: string | null;
  naics_label: string | null;
  description: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  /** USAspending's own permalink id — the row links to the public record. */
  url: string | null;
}

interface RawAward {
  "Award ID"?: string;
  "Recipient Name"?: string;
  "Award Amount"?: number;
  "Awarding Agency"?: string;
  "Awarding Sub Agency"?: string;
  "Start Date"?: string;
  "End Date"?: string;
  Description?: string;
  "Place of Performance State Code"?: string;
  NAICS?: { code?: string; description?: string };
  generated_internal_id?: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function titleCase(s: string): string {
  // USAspending returns descriptions in block capitals. Left as-is they shout
  // over every other line on the page.
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Of|The|And|For|To|In|On|A|An|Ea)\b/g, (m) => m.toLowerCase())
    .replace(/^./, (m) => m.toUpperCase());
}

async function fetchAwardsUncached(codesCsv: string): Promise<AwardRow[]> {
  const codes = codesCsv.split(",").map((c) => c.trim()).filter(Boolean);
  if (codes.length === 0) return [];

  const today = new Date();
  const from = new Date(today.getTime() - AWARDS_WINDOW_DAYS * 86_400_000);

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      filters: {
        naics_codes: codes,
        award_type_codes: AWARD_TYPES,
        // action_date, not start date: a modification moving money this month on
        // a 2016 vehicle is the signal, and its start date is 2016.
        time_period: [{ start_date: ymd(from), end_date: ymd(today), date_type: "action_date" }]
      },
      fields: [
        "Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Awarding Sub Agency",
        "Start Date", "End Date", "Description", "Place of Performance State Code", "NAICS"
      ],
      limit: PAGE_LIMIT,
      page: 1,
      sort: "Award Amount",
      order: "desc"
    }),
    signal: AbortSignal.timeout(20000)
  });

  // Fail closed. A partial or empty list presented as the feed would be the
  // fabricated-award panel this replaces, wearing a different coat.
  if (!res.ok) throw new Error(`USAspending award search: HTTP ${res.status}`);

  const data = (await res.json()) as { results?: RawAward[] };
  const rows = Array.isArray(data.results) ? data.results : [];

  return rows
    .filter((r) => r["Award ID"] && r["Recipient Name"])
    .map((r) => ({
      award_id: String(r["Award ID"]),
      recipient: String(r["Recipient Name"]),
      amount: Number(r["Award Amount"] ?? 0),
      agency: r["Awarding Agency"] ?? null,
      sub_agency: r["Awarding Sub Agency"] ?? null,
      naics: r.NAICS?.code ?? null,
      naics_label: r.NAICS?.description ? titleCase(r.NAICS.description) : null,
      description: r.Description ? titleCase(String(r.Description)).slice(0, 220) : null,
      state: r["Place of Performance State Code"] ?? null,
      start_date: r["Start Date"] ?? null,
      end_date: r["End Date"] ?? null,
      url: r.generated_internal_id
        ? `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}`
        : null
    }));
}

/** Thirty minutes, keyed by the code list, so two customers with different
 *  codes never share an entry. Same shape as the SAM feed cache. */
export const fetchRecentAwardsCached = unstable_cache(
  fetchAwardsUncached,
  ["recent-awards-v1"],
  { revalidate: 1800, tags: ["recent-awards"] }
);

export { fetchAwardsUncached };
