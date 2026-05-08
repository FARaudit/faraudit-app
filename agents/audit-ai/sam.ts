// PARITY-LOCKED VENDOR COPY of src/lib/sam.ts.
//
// Why this duplicate exists: Railway's Audit-AI service is configured with
// Root Directory = agents/audit-ai/. That means the deployed container has
// /app/index.ts but no /app/src/. Cross-folder imports like
// `../../src/lib/sam.ts` resolve to the filesystem root /src/... at runtime
// and crash with ERR_MODULE_NOT_FOUND. Locally it works because the dev tree
// has src/ alongside agents/, but Railway's image doesn't ship it.
//
// IMPORTANT: keep in sync with src/lib/sam.ts. The two files MUST stay
// byte-equivalent below this header. Any edit must be applied to both files
// in the same commit. Same parity-pattern as agents/audit-ai/pdf.ts ↔
// src/lib/sam-pdf.ts established during P0-A.

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

export async function fetchSolicitationByNoticeId(
  noticeId: string
): Promise<Solicitation | null> {
  if (!SAM_API_KEY) return null;

  // Host: sam.gov/api/prod, NOT api.sam.gov — the latter returns 404. See
  // agents/sam-ingest/sam-client.ts for the same fix applied to the cron.
  const url = `https://sam.gov/api/prod/opportunities/v2/search?api_key=${SAM_API_KEY}&noticeid=${encodeURIComponent(
    noticeId
  )}&limit=1`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    const o = data.opportunitiesData?.[0];
    if (!o) return null;

    return {
      noticeId: o.noticeId,
      solicitationNumber: o.solicitationNumber ?? null,
      title: o.title ?? "",
      department: o.department ?? null,
      subTier: o.subTier ?? null,
      fullParentPathName: o.fullParentPathName ?? null,
      naicsCode: o.naicsCode ?? null,
      type: o.type ?? null,
      typeOfSetAside: o.typeOfSetAside ?? null,
      postedDate: o.postedDate ?? null,
      responseDeadLine: o.responseDeadLine ?? null,
      description: (o.description || "").slice(0, 4000),
      resourceLinks: Array.isArray(o.resourceLinks) ? (o.resourceLinks as string[]) : []
    };
  } catch {
    return null;
  }
}
