// Who is user_id 135cb5c6? Determines whether the 40 affected NHR records were internal (CEO/demo) or a real customer.
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });
(async () => {
  // Admin: list users, find the one whose id starts with 135cb5c6.
  let target: any = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error("admin listUsers ERR:", error.message); break; }
    const u = data.users.find(x => x.id.startsWith("135cb5c6"));
    if (u) { target = u; break; }
    if (data.users.length < 200) break;
  }
  if (!target) { console.log("user 135cb5c6 not found via admin API"); }
  else {
    console.log("id      :", target.id);
    console.log("email   :", target.email);
    console.log("created :", target.created_at);
    console.log("last_sign_in:", target.last_sign_in_at);
    const dom = String(target.email || "").split("@")[1] || "";
    const internal = /faraudit\.com$/i.test(String(target.email||"")) || /gmail\.com$/i.test(dom) && /woof|jar3006|jose/i.test(String(target.email||""));
    console.log("→ classification:", internal ? "INTERNAL (CEO / faraudit / woof)" : "REVIEW — not obviously internal; treat as potential external customer");
  }
  // Also: any pdf export url persisted on the affected rows (evidence of a generated/shared PDF)?
  const { data: exp } = await sb.from("audits").select("id,pdf_export_url,compliance_json")
    .eq("user_id", target ? target.id : "135cb5c6-0000-0000-0000-000000000000");
  if (exp) {
    const withPdf = exp.filter((r:any) => r.pdf_export_url);
    console.log("\naffected rows with a persisted pdf_export_url:", withPdf.length, "/", exp.length);
  }
})();
