// FA-153 — NAICS-appeal (OHA) window anchor from SAM notice version history.
//
// audits.posted_date holds the LATEST version's posted date — SAM amendments
// overwrite it. Evidence: FA460026Q0047 carried posted_date=2026-06-09
// (Amendment 0002) while version history shows original issuance 2026-06-03,
// so 10-day OHA math off posted_date overstated the appeal window by 6 days.
//
// Statutory frame: a NAICS-code appeal must be served and filed within 10
// calendar days after issuance of the initial solicitation (13 CFR
// 121.1103(b)(1)). An amendment restarts that clock ONLY when it changes the
// NAICS code or the applicable size standard (FAR 19.103(a)(1)) — a PWS
// re-upload or a site-visit date change does not.
//
// Host: sam.gov/api/prod, NOT api.sam.gov (the latter 404s — same convention
// as src/lib/sam.ts). The /history and per-version endpoints additionally
// require Accept: application/hal+json; plain application/json returns 406.
//
// Failure contract (Rule 64 — no confident wrong dates): any fetch/parse
// failure yields nulls. Callers must surface "verify issuance date on
// SAM.gov" and must NEVER fall back to posted_date.

const SAM_API_KEY = process.env.SAM_API_KEY;
const OPPS_V2 = "https://sam.gov/api/prod/opps/v2/opportunities";
const HAL_HEADERS = { accept: "application/hal+json" } as const;
const FETCH_TIMEOUT_MS = 15000;

export interface NoticeVersion {
  opportunityId: string;
  /** Version publish date, YYYY-MM-DD (date part of the history postedDate). */
  postedDate: string | null;
  /** Primary NAICS code on this version, when fetched; null = not retrieved. */
  naics: string | null;
}

export interface NaicsAppealAnchor {
  /** Version-1 (original issuance) publish date, YYYY-MM-DD. */
  originalPostedDate: string | null;
  /**
   * Date the 10-day appeal clock runs from: the most recent NAICS-changing
   * amendment's posted date when one exists, else originalPostedDate.
   */
  anchorDate: string | null;
  /** True when an amendment changed the primary NAICS (clock restarted). */
  naicsChangedByAmendment: boolean;
  /** Total versions seen in history (1 = never amended). */
  versionCount: number;
}

export const UNKNOWN_ANCHOR: NaicsAppealAnchor = {
  originalPostedDate: null,
  anchorDate: null,
  naicsChangedByAmendment: false,
  versionCount: 0
};

/** YYYY-MM-DD date part of a SAM timestamp like "2026-06-03T20:32:15.109+00". */
function datePart(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Pure anchor derivation — exported for the FA-153 fixture test.
 * `versions` must be in publish order (index 1 first). NAICS comparison only
 * runs between versions where BOTH sides were retrieved; an unretrievable
 * version makes the restart determination conservative (no restart claimed).
 */
export function deriveAppealAnchor(versions: NoticeVersion[]): NaicsAppealAnchor {
  if (versions.length === 0) return UNKNOWN_ANCHOR;
  const originalPostedDate = versions[0].postedDate;
  if (!originalPostedDate) return UNKNOWN_ANCHOR;

  let anchorDate = originalPostedDate;
  let naicsChangedByAmendment = false;
  for (let i = 1; i < versions.length; i++) {
    const prev = versions[i - 1].naics;
    const cur = versions[i].naics;
    if (prev && cur && prev !== cur && versions[i].postedDate) {
      anchorDate = versions[i].postedDate as string;
      naicsChangedByAmendment = true;
    }
  }
  return { originalPostedDate, anchorDate, naicsChangedByAmendment, versionCount: versions.length };
}

/**
 * Pure: the OHA appeal window close date — 10 calendar days after the anchor
 * (13 CFR 121.1103(b)(1)). anchor 2026-06-03 → closes 2026-06-13.
 */
export function appealWindowCloseDate(anchorIso: string): string | null {
  const m = anchorIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 10);
  return d.toISOString().slice(0, 10);
}

async function fetchHal(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: HAL_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Primary NAICS code on one notice version, or null when unavailable. */
async function fetchVersionNaics(opportunityId: string): Promise<string | null> {
  if (!SAM_API_KEY) return null;
  const j = await fetchHal(`${OPPS_V2}/${opportunityId}?api_key=${SAM_API_KEY}`);
  const data = (j?.data2 ?? j?.data) as { naics?: Array<{ code?: string[]; type?: string }> } | undefined;
  if (!data || !Array.isArray(data.naics)) return null;
  const primary = data.naics.find((n) => n?.type === "primary") ?? data.naics[0];
  const code = primary?.code?.[0];
  return typeof code === "string" && code.length > 0 ? code : null;
}

/**
 * Fetch the appeal anchor for a notice. Returns UNKNOWN_ANCHOR on any
 * failure. Cost: 1 history call, plus one per-version call ONLY when the
 * notice has amendments (never-amended notices need no NAICS comparison).
 */
export async function fetchNaicsAppealAnchor(noticeId: string): Promise<NaicsAppealAnchor> {
  if (!SAM_API_KEY || !noticeId || /^pdf-/i.test(noticeId)) return UNKNOWN_ANCHOR;

  const j = await fetchHal(`${OPPS_V2}/${noticeId}/history?api_key=${SAM_API_KEY}`);
  const history = Array.isArray(j?.history) ? (j!.history as Array<Record<string, unknown>>) : null;
  if (!history || history.length === 0) return UNKNOWN_ANCHOR;

  const ordered = history
    .filter((h) => h && typeof h.opportunityId === "string" && h.deleted !== "1" && h.cancelNotice !== "1")
    .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
  if (ordered.length === 0) return UNKNOWN_ANCHOR;

  const versions: NoticeVersion[] = ordered.map((h) => ({
    opportunityId: h.opportunityId as string,
    postedDate: datePart(h.postedDate),
    naics: null
  }));

  // NAICS comparison is only needed when amendments exist.
  if (versions.length > 1) {
    const codes = await Promise.all(versions.map((v) => fetchVersionNaics(v.opportunityId)));
    codes.forEach((code, i) => { versions[i].naics = code; });
  }

  return deriveAppealAnchor(versions);
}
