import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
// @ts-expect-error tsx
const { supabase } = await import("./queue.ts");
const { data, error } = await supabase.from("audits").select("id, audit_source, notice_id, recommendation").order("created_at", { ascending: false }).limit(5);
if (error) { console.error(error); process.exit(1); }
console.log("recent audits rows (newest first):");
console.table(data);
console.log("\nTYPE CHECK — id values look like UUID strings (8-4-4-4-12 hex):", data?.[0]?.id);
