// SAM.gov opportunities API v2 client.
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
//
// Filters: naicsCode (one per call), typeOfSetAside (one per call), postedFrom,
// postedTo, limit, offset. Date format: MM/dd/yyyy. Limit max 1000, offset max
// 9000 (so ~10K results per filter combo before pagination breaks down — fine
// for our scope).

const SAM_API_KEY = process.env.SAM_API_KEY;

export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber: string | null;
  department: string | null;
  subTier: string | null;
  naicsCode: string | null;
  type: string | null;
  typeOfSetAside: string | null;
  typeOfSetAsideDescription: string | null;
  postedDate: string | null;
  responseDeadLine: string | null;
  description: string;
  resourceLinks: string[];   // PDF download URLs (auth-protected by api_key)
  uiLink: string | null;
}

interface SamSearchParams {
  naicsCode: string;
  setAside: string;
  postedFrom: string;        // MM/dd/yyyy
  postedTo: string;          // MM/dd/yyyy
  limit: number;
  offset: number;
}

function fmtDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function dateRange(daysBack: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 86400_000);
  return { from: fmtDate(from), to: fmtDate(to) };
}

async function searchPage(p: SamSearchParams): Promise<{ items: SamOpportunity[]; total: number }> {
  if (!SAM_API_KEY) throw new Error("SAM_API_KEY not set");
  const params = new URLSearchParams({
    api_key: SAM_API_KEY,
    naicsCode: p.naicsCode,
    typeOfSetAside: p.setAside,
    postedFrom: p.postedFrom,
    postedTo: p.postedTo,
    limit: String(p.limit),
    offset: String(p.offset),
    ptype: "o,p,k,r,s"   // opportunity / pre-solicitation / combined / sources sought / special notice
  });
  const url = `https://api.sam.gov/opportunities/v2/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SAM.gov ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const opps = (data.opportunitiesData || []) as any[];
  const items: SamOpportunity[] = opps.map((o) => ({
    noticeId: o.noticeId,
    title: o.title || "",
    solicitationNumber: o.solicitationNumber ?? null,
    department: o.department ?? null,
    subTier: o.subTier ?? null,
    naicsCode: o.naicsCode ?? null,
    type: o.type ?? null,
    typeOfSetAside: o.typeOfSetAside ?? null,
    typeOfSetAsideDescription: o.typeOfSetAsideDescription ?? null,
    postedDate: o.postedDate ?? null,
    responseDeadLine: o.responseDeadLine ?? null,
    description: (o.description || "").slice(0, 4000),
    resourceLinks: Array.isArray(o.resourceLinks) ? o.resourceLinks : [],
    uiLink: o.uiLink ?? null
  }));
  return { items, total: typeof data.totalRecords === "number" ? data.totalRecords : items.length };
}

export interface SearchOptions {
  naicsCode: string;
  setAside: string;
  postedFrom: string;
  postedTo: string;
  pageLimit: number;
}

// Paginate through all results for a single (naics, set-aside) combo.
// SAM.gov caps offset at ~9000; we stop early if we hit that.
export async function searchAll(opts: SearchOptions): Promise<SamOpportunity[]> {
  const all: SamOpportunity[] = [];
  let offset = 0;
  while (true) {
    const { items, total } = await searchPage({ ...opts, limit: opts.pageLimit, offset });
    all.push(...items);
    offset += items.length;
    if (items.length === 0 || all.length >= total) break;
    if (offset >= 9000) {
      console.warn(`[sam-client] hit 9000-offset cap for ${opts.naicsCode} / ${opts.setAside} · stopping at ${all.length}/${total}`);
      break;
    }
    // gentle pacing — SAM.gov rate limit is generous but not unlimited
    await new Promise((r) => setTimeout(r, 250));
  }
  return all;
}
