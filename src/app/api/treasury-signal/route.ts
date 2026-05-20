// FA-96 · GET /api/treasury-signal
// Server-side proxy for U.S. Treasury MTS Table 5 — DoD–Military Programs
// FYTD outlays. The browser cannot call fiscaldata.treasury.gov directly
// (no CORS headers on responses), so we proxy through this route. Returns a
// compact JSON shape the client can render in one banner line.
//
// Source endpoint:
//   https://fiscaldata.treasury.gov/api/v1/accounting/mts/mts_table_5
//   fields=classification_desc,current_fytd_net_outly_amt,record_date
//   filter=classification_desc:eq:Department of Defense--Military Programs
//   sort=-record_date  (newest report first)
//   limit=1
//
// Amount on the Treasury response is raw USD as a string (confirmed via probe:
// FY2026 YTD through 2026-04-30 returned $531,253,777,220.81 — Treasury's MTS
// reports already in dollars, NOT millions, despite some docs suggesting otherwise).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// 5-minute Vercel edge cache — Treasury MTS updates monthly, polling more
// often is waste. Manual refresh works because the route is force-dynamic.
export const revalidate = 300;

interface TreasuryRow {
  classification_desc?: string;
  current_fytd_net_outly_amt?: string;
  record_date?: string;
}

export async function GET() {
  // Treasury Fiscal Data API correct host + path:
  //   api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_5
  // (the bare fiscaldata.treasury.gov host is the docs SPA and returns 404 on
  // /api paths). Classification value confirmed by probing the table: the
  // DoD-Military rollup line is "Total--Department of Defense--Military Programs"
  // — double dashes, "Total--" prefix. The non-Total variants are section
  // sub-rows. page[size]=1 paginates (limit=1 is rejected as an invalid param).
  const url =
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_5" +
    "?fields=classification_desc,current_fytd_net_outly_amt,record_date" +
    "&filter=classification_desc:eq:Total--Department%20of%20Defense--Military%20Programs" +
    "&sort=-record_date&page%5Bsize%5D=1";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return NextResponse.json(
        { amount: null, date: null, error: `treasury ${res.status}` },
        { status: 200 }
      );
    }
    const j = (await res.json()) as { data?: TreasuryRow[] };
    const row = j.data?.[0];
    if (!row) {
      return NextResponse.json({ amount: null, date: null, error: "no rows" }, { status: 200 });
    }
    const raw = row.current_fytd_net_outly_amt;
    const num = raw ? Number(raw) : NaN;
    const amount = Number.isFinite(num) ? num : null;
    return NextResponse.json({ amount, date: row.record_date ?? null });
  } catch (err) {
    return NextResponse.json(
      { amount: null, date: null, error: err instanceof Error ? err.message : "fetch failed" },
      { status: 200 }
    );
  }
}
