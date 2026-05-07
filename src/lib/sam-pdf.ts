// SAM.gov PDF downloader for the user-facing /api/audit Notice ID path.
//
// PARITY NOTE: agents/audit-ai/pdf.ts contains an intentionally-identical
// implementation. Both must stay in sync — same api-key auth, magic-byte
// verification, redirect: "follow", and 30s timeout. The cron keeps a local
// copy because Railway's audit-ai service uses dynamic imports for cross-
// folder src/lib/ paths and a static import here would risk the daily deploy.
// 15 lines of duplication is worth the deploy safety.
//
// SAM presigned URLs (the eventual S3 redirect target) carry an X-Amz-Expires
// of ~9 seconds — fine for `redirect: "follow"` GETs in a single request, but
// any HEAD-then-GET sequence will fail. Stick to GET.

const SAM_API_KEY = process.env.SAM_API_KEY;

const PDF_MAGIC = Buffer.from("%PDF", "ascii");

export interface PdfFetchResult {
  base64: string;
  bytes: number;
  source: "sam.gov";
}

export function isPdfMagicValid(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(PDF_MAGIC);
}

export async function fetchPdfFromSamUrl(url: string): Promise<PdfFetchResult> {
  if (!SAM_API_KEY) throw new Error("SAM_API_KEY required to fetch from SAM.gov");
  const sep = url.includes("?") ? "&" : "?";
  const authedUrl = `${url}${sep}api_key=${SAM_API_KEY}`;
  const res = await fetch(authedUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`SAM PDF fetch ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!isPdfMagicValid(buf)) {
    throw new Error(
      `SAM.gov returned non-PDF for ${url} (first bytes: ${buf.subarray(0, 8).toString("hex")})`
    );
  }
  return { base64: buf.toString("base64"), bytes: buf.length, source: "sam.gov" };
}
