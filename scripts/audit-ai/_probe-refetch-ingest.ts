// $0 — reproduce the refetch route's ingest LOCALLY through the identical library path
// (assembleSamDocumentSet) for 36C25626Q1137, to split SAM-side failure from Vercel-runtime failure.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";

(async () => {
  const NOTICE = "53bf82c5952d47d8902dd9954a980f00";
  const t0 = Date.now();
  const set = await assembleSamDocumentSet(NOTICE, "36C25626Q1137");
  console.log(`assembled in ${Math.round((Date.now() - t0) / 1000)}s`);
  for (const d of set.docs ?? []) {
    const text = (d as any).text ?? "";
    console.log(`  ${d.name} · bytes=${(d as any).bytes?.length ?? (d as any).byteLength ?? "?"} · textChars=${text.length} · head=${JSON.stringify(text.slice(0, 80))}`);
  }
  const meta = (set as any).ingestion ?? (set as any).meta;
  if (meta) console.log("ingestion meta:", JSON.stringify(meta).slice(0, 400));
})();
