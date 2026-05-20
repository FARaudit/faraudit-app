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
// Amount on the Treasury response is in MILLIONS of dollars (string).
// We multiply by 1_000_000 server-side so the client receives raw USD.

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
  const url =
    "https://fiscaldata.treasury.gov/api/v1/accounting/mts/mts_table_5" +
    "?fields=classification_desc,current_fytd_net_outly_amt,record_date" +
    "&filter=classification_desc:eq:Department%20of%20Defense--Military%20Programs" +
    "&sort=-record_date&page[size]=1";
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
    const amount = Number.isFinite(num) ? num * 1_000_000 : null;
    return NextResponse.json({ amount, date: row.record_date ?? null });
  } catch (err) {
    return NextResponse.json(
      { amount: null, date: null, error: err instanceof Error ? err.message : "fetch failed" },
      { status: 200 }
    );
  }
}
