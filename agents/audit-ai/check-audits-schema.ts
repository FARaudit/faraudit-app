import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx
const { supabase } = await import("./queue.ts");

// Use information_schema via PostgREST to introspect column constraints.
const { data, error } = await supabase.rpc("exec_sql", {});

// Fallback: try a tiny no-op insert that reveals the constraint via error.
console.log("--- attempting probe insert with user_id=null + audit_source='audit_ai' ---");
const probe = await supabase
  .from("audits")
  .insert({
    notice_id: "__probe_delete_me__",
    title: "schema probe — DO NOT KEEP",
    user_id: null,
    audit_source: "audit_ai",
    status: "probe"
  })
  .select("id")
  .single();

if (probe.error) {
  console.log("ERROR (this tells us what to fix):");
  console.log("  code:", probe.error.code);
  console.log("  message:", probe.error.message);
  console.log("  details:", probe.error.details);
  console.log("  hint:", probe.error.hint);
} else {
  console.log("INSERT SUCCEEDED — user_id nullable, audit_source exists. Cleaning up probe row.");
  await supabase.from("audits").delete().eq("id", probe.data.id);
}
