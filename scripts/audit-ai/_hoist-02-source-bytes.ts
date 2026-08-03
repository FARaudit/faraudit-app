// $0 read-only. Do we already HOLD the primary PDF's bytes (or its resource link) without going outside?
// Answering this decides whether probe 03 needs an external fetch at all.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT = "eab43ada-2baf-49e2-b224-a968df7864f3";

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db.from("audits").select("*").eq("id", AUDIT).single();
  if (error || !data) { console.error("FATAL:", error?.message); process.exit(1); }
  const row = data as Record<string, unknown>;

  console.log("=== audits columns, by type/size (VALUES REDACTED — Rule 32) ===");
  for (const k of Object.keys(row).sort()) {
    const v = row[k];
    const kind = v === null ? "null" : Array.isArray(v) ? `array[${v.length}]` : typeof v;
    const size = typeof v === "string" ? `${v.length} chars` : v && typeof v === "object" ? `${JSON.stringify(v).length} chars(json)` : "";
    console.log(`  ${k.padEnd(34)} ${kind.padEnd(12)} ${size}`);
  }

  console.log("\n=== anything that looks like a link to the primary PDF ===");
  const blob = JSON.stringify(row);
  const urls = [...new Set([...blob.matchAll(/https?:\/\/[^"\\\s]{10,200}/g)].map((m) => m[0]))];
  for (const u of urls.slice(0, 40)) console.log("  " + u);
  if (!urls.length) console.log("  (none)");

  console.log("\n=== storage buckets visible to the service key ===");
  const { data: buckets, error: bErr } = await db.storage.listBuckets();
  if (bErr) console.log("  listBuckets error:", bErr.message);
  else for (const b of buckets ?? []) console.log(`  ${b.name}  public=${b.public}`);
})();
