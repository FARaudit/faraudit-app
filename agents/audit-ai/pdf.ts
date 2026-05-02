import { readFile } from "node:fs/promises";

const SAM_API_KEY = process.env.SAM_API_KEY;

export interface PdfFetchResult {
  base64: string;
  bytes: number;
  source: "local" | "sam.gov";
}

// Magic-byte verification — defense in depth against rename attacks.
const PDF_MAGIC = Buffer.from("%PDF", "ascii");
function isPdfMagicValid(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(PDF_MAGIC);
}

export async function fetchPdfFromPath(pdfPath: string): Promise<PdfFetchResult> {
  const buf = await readFile(pdfPath);
  if (!isPdfMagicValid(buf)) {
    throw new Error(`PDF magic byte mismatch: ${pdfPath}`);
  }
  return { base64: buf.toString("base64"), bytes: buf.length, source: "local" };
}

export async function fetchPdfFromSam(url: string): Promise<PdfFetchResult> {
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
    throw new Error(`SAM.gov returned non-PDF for ${url} (first bytes: ${buf.subarray(0, 8).toString("hex")})`);
  }
  return { base64: buf.toString("base64"), bytes: buf.length, source: "sam.gov" };
}
