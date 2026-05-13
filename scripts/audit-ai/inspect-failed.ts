import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // 1. Total failed count
  const { count: totalFailed } = await supabase
    .from("pending_audits")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed");
  console.log("=== Total failed audits ===");
  console.log(totalFailed);
  console.log("");

  // 2. Last 10 failed rows — sample inspection
  const { data: sample } = await supabase
    .from("pending_audits")
    .select("notice_id, pdf_url, error_message, processed_at")
    .eq("status", "failed")
    .order("processed_at", { ascending: false })
    .limit(10);

  console.log("=== Last 10 failed audits ===");
  sample?.forEach((r, i) => {
    console.log(`\n[${i + 1}] notice_id: ${r.notice_id}`);
    console.log(`    pdf_url: ${(r.pdf_url || "").slice(0, 80)}`);
    console.log(`    error:   ${(r.error_message || "").slice(0, 200)}`);
  });

  // 3. Error message prefix distribution (first 60 chars)
  const { data: allFailed } = await supabase
    .from("pending_audits")
    .select("error_message")
    .eq("status", "failed");

  const buckets: Record<string, number> = {};
  allFailed?.forEach((r) => {
    const prefix = (r.error_message || "(empty)").slice(0, 60);
    buckets[prefix] = (buckets[prefix] || 0) + 1;
  });

  console.log("\n=== Error message distribution (top 10 buckets) ===");
  Object.entries(buckets)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([prefix, count]) => {
      console.log(`  ${count.toString().padStart(3)} × ${prefix}`);
    });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
