// FPDS-NG (Federal Procurement Data System) — Atom feed client.
// Public, no key required. 30–90 days fresher than USAspending.
// Docs: https://www.fpds.gov/wiki/index.php/Atom_Feed_Usage_2.0

const FPDS_FEED = "https://www.fpds.gov/ezsearch/FEEDS/ATOM";

export interface FPDSAward {
  recipient_name: string | null;
  recipient_uei: string | null;
  award_amount: number | null;
  period_of_performance_start: string | null;
  period_of_performance_end: string | null;
  award_id: string | null;
  agency: string | null;
}

function pickTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function extractEntries(xml: string): string[] {
  return xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
}

// Pull awards by PIID (procurement instrument identifier — same as SAM notice number for many flows).
// Also accepts solicitation number; FPDS indexes both.
export async function findIncumbentByNoticeId(noticeId: string): Promise<FPDSAward | null> {
  if (!noticeId) return null;
  const q = encodeURIComponent(`PIID:"${noticeId}" OR SOLICITATION_ID:"${noticeId}"`);
  const url = `${FPDS_FEED}?q=${q}&rss=1&size=10`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/atom+xml,application/xml,text/xml" },
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const xml = await res.text();
  const entries = extractEntries(xml);
  if (entries.length === 0) return null;

  // Pick the most recent — FPDS Atom feed orders by signed date desc.
  const top = entries[0];
  const recipientName =
    pickTag(top, "vendorName") ||
    pickTag(top, "awardeeName") ||
    pickTag(top, "vendor:vendorName") ||
    pickTag(top, "vendorSiteAddress.companyName");
  const recipientUei =
    pickTag(top, "UEI") ||
    pickTag(top, "ueiSAM") ||
    pickTag(top, "vendor:UEI");
  const obligated = pickTag(top, "obligatedAmount");
  const baseAndAll = pickTag(top, "baseAndAllOptionsValue");
  const popStart =
    pickTag(top, "currentDate.signedDate") ||
    pickTag(top, "effectiveDate");
  const popEnd =
    pickTag(top, "currentCompletionDate") ||
    pickTag(top, "ultimateCompletionDate");
  const awardId =
    pickTag(top, "PIID") ||
    pickTag(top, "transactionInformation.PIID");
  const agency =
    pickTag(top, "contractingOfficeAgencyID") ||
    pickTag(top, "fundingDepartmentName") ||
    pickTag(top, "contractingOfficeAgencyName");

  const numeric = (s: string | null) => {
    if (!s) return null;
    const cleaned = s.replace(/[^0-9.\-]/g, "");
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  };

  return {
    recipient_name: recipientName,
    recipient_uei: recipientUei,
    award_amount: numeric(obligated) ?? numeric(baseAndAll),
    period_of_performance_start: popStart ? popStart.slice(0, 10) : null,
    period_of_performance_end: popEnd ? popEnd.slice(0, 10) : null,
    award_id: awardId,
    agency
  };
}
