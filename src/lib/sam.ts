// PARITY NOTE: agents/audit-ai/sam.ts is a byte-equivalent vendored copy of
// this file. Any edit here MUST be applied to that file in the same commit.
// The Audit-AI cron can't import from src/lib/ at runtime (Railway Root
// Directory = agents/audit-ai/ means src/ isn't in the container).

const SAM_API_KEY = process.env.SAM_API_KEY;

export interface Solicitation {
  noticeId: string;
  solicitationNumber: string | null;
  title: string;
  department: string | null;
  subTier: string | null;
  // SAM v2 returns agency hierarchy as a dotted path string here (e.g.
  // "INTERIOR, DEPARTMENT OF THE.NATIONAL PARK SERVICE.MWR MIDWEST REGION(60000)").
  // department + subTier are no longer reliably populated — fullParentPathName
  // is the canonical source. Probed 2026-05-07. resolveAgency() below uses
  // this with fallbacks to handle legacy responses.
  fullParentPathName: string | null;
  naicsCode: string | null;
  type: string | null;
  typeOfSetAside: string | null;
  postedDate: string | null;
  responseDeadLine: string | null;
  description: string;
  // SAM v2 returns resourceLinks for opportunities that have an attached PDF
  // (Solicitation, Combined Synopsis/Solicitation). Captured here so the
  // /api/audit Notice ID path can auto-download the PDF and run the full
  // 4-call audit instead of the metadata-only degraded path.
  resourceLinks: string[];
}

// SAM.gov occasionally puts a PSC code + product name into the
// solicitationNumber field on sources-sought / RFI / special notices that
// don't have a real sol#. PSC-shaped leaks always start with 4 digits
// followed by "--" (e.g. "3990--COMPACT TRACK LOADER, FULLY ENCLOSED CAB,
// 12-15K LB CLASS"). Real sol#s are alphanumeric tokens ≤25 chars with no
// internal whitespace. This sanitizer returns null for anything that doesn't
// look like a real sol#, so downstream display falls back to notice_id /
// title cleanly. Mirrors agents/sam-ingest/helpers.ts:sanitizeSolicitationNumber.
export function sanitizeSolicitationNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}--/.test(t)) return null;
  if (t.includes("--") && /\s/.test(t)) return null;
  if (/\s/.test(t)) return null;
  if (t.length > 25) return null;
  return t;
}

// Agency resolver. Mirrors agents/sam-ingest/helpers.ts:resolveAgency to keep
// the audit and SAM-ingest paths consistent. Behavior:
//   1. Pick fullParentPathName first; fall back to department / subTier for
//      legacy responses or other endpoints that still emit them.
//   2. If the value is dotted, take the first two segments (department · service).
//   3. Strip trailing parenthetical org codes from each kept segment.
//   4. Join with " · " (Unicode middle dot, surrounded by single spaces).
//   5. Returns null only when SAM truly has nothing.
export function resolveAgency(s: {
  fullParentPathName?: string | null;
  department?: string | null;
  subTier?: string | null;
}): string | null {
  const raw = s.fullParentPathName || s.department || s.subTier || null;
  if (!raw) return null;
  const stripParens = (seg: string) => seg.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const segments = raw.includes(".") ? raw.split(".").slice(0, 2) : [raw];
  const cleaned = segments.map(stripParens).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" · ") : null;
}

// FA-151 — office leaf. resolveAgency() keeps only the department · service
// top-2 of fullParentPathName; the buying-office leaf below it (e.g. "DLA
// AVIATION AT OKLAHOMA CITY, OK") is dropped. This returns that leaf so the
// masthead can show the specific office as its identity first line, with the
// top-2 hierarchy as the subnote. Returns null when there is no genuine leaf
// below the top-2 (≤2 path segments → the leaf is already in the agency line)
// or when SAM has no full path at all.
export function resolveOfficeLeaf(s: {
  fullParentPathName?: string | null;
}): string | null {
  const raw = s.fullParentPathName || null;
  if (!raw || !raw.includes(".")) return null;
  const segments = raw
    .split(".")
    .map((seg) => seg.replace(/\s*\([^)]*\)\s*$/, "").trim())
    .filter(Boolean);
  if (segments.length <= 2) return null;
  return segments[segments.length - 1] || null;
}

// Host: sam.gov/api/prod, NOT api.sam.gov — the latter returns 404. See
// agents/sam-ingest/sam-client.ts for the same fix applied to the cron.
const SAM_SEARCH = "https://sam.gov/api/prod/opportunities/v2/search";

function mapOpportunity(o: Record<string, unknown>): Solicitation {
  return {
    noticeId: (o.noticeId as string | undefined) || "",
    solicitationNumber: sanitizeSolicitationNumber(o.solicitationNumber as string | undefined),
    title: (o.title as string | undefined) ?? "",
    department: (o.department as string | undefined) ?? null,
    subTier: (o.subTier as string | undefined) ?? null,
    fullParentPathName: (o.fullParentPathName as string | undefined) ?? null,
    naicsCode: (o.naicsCode as string | undefined) ?? null,
    type: (o.type as string | undefined) ?? null,
    typeOfSetAside: (o.typeOfSetAside as string | undefined) ?? null,
    postedDate: (o.postedDate as string | undefined) ?? null,
    responseDeadLine: (o.responseDeadLine as string | undefined) ?? null,
    description: ((o.description as string | undefined) || "").slice(0, 4000),
    resourceLinks: Array.isArray(o.resourceLinks) ? (o.resourceLinks as string[]) : []
  };
}

// User-entered IDs come in two flavors: SAM UUID notice IDs (e.g.
// "0716ae8da2cd4295b38531b72032ed03") and human solicitation numbers
// (e.g. "FA301626Q0068"). The route used to query only `noticeid` and 404
// any sol# input. This now tries `noticeid` first, then `solnum` on empty
// result — covers both input styles without requiring the user to know
// the distinction.
//
// DLA hyphenation fallback (2026-06-05): DLA Aviation solicitations are
// canonically printed on the SF-1449 with hyphens (SPRRA1-26-Q-0034), but
// SAM.gov indexes the same record without hyphens (SPRRA126Q0034). Both
// noticeid and solnum return zero results on the hyphenated form. Empirical
// probe: SPRRA1-26-Q-0034 → 0 hits both params; SPRRA126Q0034 + solnum → 1
// hit (HOUSING ASSY,ACTUAT NSN:1680-01-137-3534, deadline 2026-06-25). When
// the first two attempts miss AND the input contains hyphens, try a third
// query with hyphens stripped. Output value is unchanged — SAM returns the
// canonical record with whichever format it stores.
export async function fetchSolicitationByNoticeId(
  noticeId: string
): Promise<Solicitation | null> {
  if (!SAM_API_KEY) return null;

  const tryQuery = async (paramName: "noticeid" | "solnum", value: string): Promise<Solicitation | null> => {
    const url = `${SAM_SEARCH}?api_key=${SAM_API_KEY}&${paramName}=${encodeURIComponent(value)}&limit=1`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const data = await res.json();
      const o = data.opportunitiesData?.[0];
      return o ? mapOpportunity(o) : null;
    } catch {
      return null;
    }
  };

  const direct = (await tryQuery("noticeid", noticeId)) ?? (await tryQuery("solnum", noticeId));
  if (direct) return direct;
  // Hyphen-stripped fallback for DLA-style sol#s.
  const stripped = noticeId.replace(/-/g, "");
  if (stripped !== noticeId) {
    const viaSolnum = await tryQuery("solnum", stripped);
    if (viaSolnum) return viaSolnum;
    const viaNoticeId = await tryQuery("noticeid", stripped);
    if (viaNoticeId) return viaNoticeId;
  }
  return null;
}
