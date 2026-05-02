import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx
const { supabase } = await import("./queue.ts");

const { data: counts, error: countErr } = await supabase
  .from("pending_audits")
  .select("status,source", { count: "exact" });

if (countErr) { console.error(countErr); process.exit(1); }

const byStatus: Record<string, number> = {};
const bySource: Record<string, number> = {};
for (const r of (counts as any[]) || []) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  bySource[r.source] = (bySource[r.source] || 0) + 1;
}

console.log("pending_audits — totals by status:");
console.table(byStatus);
console.log("pending_audits — totals by source:");
console.table(bySource);

console.log("\n10 most-recent rows:");
const { data: recent, error: recentErr } = await supabase
  .from("pending_audits")
  .select("notice_id,status,source,set_aside,naics_code,created_at")
  .order("created_at", { ascending: false })
  .limit(10);
if (recentErr) { console.error(recentErr); process.exit(1); }
console.table(recent);
