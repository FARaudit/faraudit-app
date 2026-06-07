// Burn-in fetcher — pulls 5 solicitation PDFs from SAM.gov via the same path
// used to stash SPRRA126Q0034 (fetchSolicitationByNoticeId + fetchPdfFromSamUrl).
// Stashes to test/pdfs/burn-in/<sol>.pdf or test/pdfs/burn-in/<sol>.txt for
// inline-description fallback. Reports per-notice status.

import * as fs from "node:fs";
import * as path from "node:path";
import { fetchSolicitationByNoticeId } from "../src/lib/sam";
import { fetchPdfFromSamUrl } from "../src/lib/sam-pdf";

const SOLICITATIONS = [
  "N0010426QBU16",     // Navy
  "378229-RK",         // other (likely Army-style)
  "N6833525R0392",     // Navy
  "SPRHA4-26-R-0454",  // DLA
  "SPE4A526T109C",     // DLA
  "W58RGZ-25-B-0034",  // Army — Fix 7 wrong-doc burn-in target
];

const OUT_DIR = path.join(process.cwd(), "test/pdfs/burn-in");

async function fetchOne(sol: string): Promise<{ sol: string; status: string; size?: number; resourceLinks?: number }> {
  try {
    const record = await fetchSolicitationByNoticeId(sol);
    if (!record) return { sol, status: "NOT_FOUND" };

    if (record.resourceLinks.length === 0) {
      // No PDF attachment. SAM puts large descriptions behind a follow-up URL
      // (api.sam.gov/.../noticedesc?...) — when description is just a URL,
      // follow it and stash the resolved body. Otherwise stash the inline text.
      let desc = record.description || "";
      if (/^https?:\/\/api\.sam\.gov\/.*noticedesc/.test(desc.trim())) {
        // Rewrite api.sam.gov host → sam.gov/api host (existing doctrine in
        // sam.ts: api.sam.gov path 404s, sam.gov/api/prod is the working host).
        const descUrl = desc.trim().replace(/^https?:\/\/api\.sam\.gov\//, "https://sam.gov/api/");
        try {
          const apiKey = process.env.SAM_API_KEY!;
          const sep = descUrl.includes("?") ? "&" : "?";
          const res = await fetch(`${descUrl}${sep}api_key=${apiKey}`, { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = await res.json().catch(() => null);
            // SAM returns { description: "..." } or { Description: "..." }
            desc = String((data && (data.description ?? data.Description ?? "")) || "");
          }
        } catch {
          // fall through with empty desc
        }
      }
      if (!desc) return { sol, status: "NO_PDF_NO_DESC" };
      const outPath = path.join(OUT_DIR, `${sol}.txt`);
      fs.writeFileSync(outPath, desc, "utf8");
      return { sol, status: "TEXT_ONLY (no PDF attachment, description stashed)", size: desc.length };
    }

    // Try the first PDF-shaped resource link
    let stashed = false;
    let lastErr = "";
    let size = 0;
    for (const link of record.resourceLinks.slice(0, 3)) {
      try {
        const doc = await fetchPdfFromSamUrl(link);
        if (doc.kind === "pdf" && doc.base64) {
          const buf = Buffer.from(doc.base64, "base64");
          const outPath = path.join(OUT_DIR, `${sol}.pdf`);
          fs.writeFileSync(outPath, buf);
          size = buf.length;
          stashed = true;
          break;
        }
        lastErr = `kind=${doc.kind}`;
      } catch (e) {
        lastErr = (e as Error).message.slice(0, 100);
      }
    }
    if (!stashed) return { sol, status: `FETCH_FAILED (${lastErr})`, resourceLinks: record.resourceLinks.length };
    return { sol, status: "FETCHED", size, resourceLinks: record.resourceLinks.length };
  } catch (e) {
    return { sol, status: `ERROR: ${(e as Error).message.slice(0, 120)}` };
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  BURN-IN PDF FETCH — 5 solicitations from SAM.gov");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("");
  const results: Array<{ sol: string; status: string; size?: number; resourceLinks?: number }> = [];
  for (const sol of SOLICITATIONS) {
    const r = await fetchOne(sol);
    results.push(r);
    const sz = r.size ? ` · ${r.size} bytes` : "";
    const rl = r.resourceLinks !== undefined ? ` · ${r.resourceLinks} resourceLinks` : "";
    console.log(`  ${sol.padEnd(22)} → ${r.status}${sz}${rl}`);
  }
  console.log("");
  const fetched = results.filter((r) => r.status === "FETCHED").length;
  const textOnly = results.filter((r) => r.status.startsWith("TEXT_ONLY")).length;
  const notFound = results.filter((r) => r.status === "NOT_FOUND").length;
  const failed = results.filter((r) => r.status.startsWith("FETCH_FAILED") || r.status.startsWith("ERROR") || r.status === "NO_PDF_NO_DESC").length;
  console.log(`  Summary: ${fetched} fetched · ${textOnly} text-only · ${notFound} not-found · ${failed} failed`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
