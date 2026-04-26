const SAM_API_KEY = process.env.SAM_API_KEY;

export interface Solicitation {
  noticeId: string;
  solicitationNumber: string | null;
  title: string;
  department: string | null;
  subTier: string | null;
  naicsCode: string | null;
  type: string | null;
  typeOfSetAside: string | null;
  postedDate: string | null;
  responseDeadLine: string | null;
  description: string;
}

export async function fetchSolicitationByNoticeId(
  noticeId: string
): Promise<Solicitation | null> {
  if (!SAM_API_KEY) return null;

  const url = `https://api.sam.gov/opportunities/v2/search?api_key=${SAM_API_KEY}&noticeid=${encodeURIComponent(
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
      naicsCode: o.naicsCode ?? null,
      type: o.type ?? null,
      typeOfSetAside: o.typeOfSetAside ?? null,
      postedDate: o.postedDate ?? null,
      responseDeadLine: o.responseDeadLine ?? null,
      description: (o.description || "").slice(0, 4000)
    };
  } catch {
    return null;
  }
}
