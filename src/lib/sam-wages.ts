// SAM.gov Wage Determinations v2 client.
// Endpoint behind SAM_API_KEY. Returns SCA + DBA wage rates per state/county.
// Docs: https://open.gsa.gov/api/wages/

const BASE = "https://api.sam.gov/wages/v2/wageTerminations"; // SAM uses this exact path despite the typo
const FALLBACK = "https://api.sam.gov/wages/v2/wageDeterminations";

export interface SamWageRow {
  wd_number: string | null;
  state: string | null;
  county: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  source_url: string | null;
  classifications: Array<{
    title: string;
    hourly_rate: number | null;
    fringe_rate: number | null;
  }>;
}

interface SamWageDoc {
  wdNumber?: string;
  revisionDate?: string;
  effectiveDate?: string;
  expirationDate?: string;
  state?: string;
  county?: string;
  url?: string;
  classifications?: Array<{
    classification?: string;
    title?: string;
    hourlyRate?: number | string;
    fringeRate?: number | string;
  }>;
}

function pickNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    return isFinite(n) ? n : null;
  }
  return null;
}

export async function searchWageDeterminations(opts: {
  state?: string | null;
  county?: string | null;
  naics?: string | null;
  limit?: number;
}): Promise<SamWageRow[]> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    api_key: apiKey,
    pageSize: String(opts.limit || 25),
    pageNumber: "0"
  });
  if (opts.state) params.set("state", opts.state);
  if (opts.county) params.set("county", opts.county);
  if (opts.naics) params.set("naics", opts.naics);

  let res: Response;
  try {
    res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    });
    // SAM has had path inconsistency historically; fall back if 404.
    if (res.status === 404) {
      res = await fetch(`${FALLBACK}?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000)
      });
    }
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data: { wageDeterminations?: SamWageDoc[]; data?: SamWageDoc[] } = {};
  try { data = await res.json(); } catch { return []; }
  const docs = data.wageDeterminations || data.data || [];

  return docs.map((d) => ({
    wd_number: d.wdNumber || null,
    state: d.state || null,
    county: d.county || null,
    effective_date: d.effectiveDate ? d.effectiveDate.slice(0, 10) : null,
    expiration_date: d.expirationDate ? d.expirationDate.slice(0, 10) : null,
    source_url: d.url || null,
    classifications: (d.classifications || []).map((c) => ({
      title: c.title || c.classification || "—",
      hourly_rate: pickNumber(c.hourlyRate),
      fringe_rate: pickNumber(c.fringeRate)
    }))
  }));
}
