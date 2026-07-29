// U-A verification step 1 — enumerate + pull the RECENT banked run records (the live-wall cohort), $0 read-only.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
const DIR = "scripts/audit-ai/run-records/_ua-cohort";

(async () => {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const { data: sols, error } = await sb.storage.from("run-records").list("", { limit: 400 });
  if (error) { console.error(error.message); process.exit(1); }
  let pulled = 0, listed = 0;
  const index: Array<{ path: string; createdAt: string; size: number }> = [];
  for (const s of sols ?? []) {
    if (!s.name || s.name.endsWith(".json")) continue; // top-level folders are sol ids
    const { data: files } = await sb.storage.from("run-records").list(s.name, { limit: 100 });
    for (const f of files ?? []) {
      if (!f.name.endsWith(".json")) continue;
      listed++;
      index.push({ path: `${s.name}/${f.name}`, createdAt: f.created_at ?? "", size: (f.metadata as { size?: number })?.size ?? 0 });
    }
  }
  index.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  console.log(`bank holds ${listed} records; pulling the most recent 60`);
  for (const it of index.slice(0, 60)) {
    const { data: blob, error: e } = await sb.storage.from("run-records").download(it.path);
    if (e || !blob) { console.log(`  MISS ${it.path}: ${e?.message}`); continue; }
    const out = `${DIR}/${it.path.replace(/\//g, "__")}`;
    writeFileSync(out, await blob.text());
    pulled++;
  }
  console.log(`pulled ${pulled}`);
  console.log(index.slice(0, 60).map((i) => `  ${i.createdAt?.slice(0, 10)} ${i.path}`).join("\n"));
})();
