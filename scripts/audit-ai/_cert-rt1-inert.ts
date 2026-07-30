// $0 — flag-OFF inertness A/B. Renders the SHIPPED row (no `unanalyzed` key = exactly a flag-OFF run) and dumps the
// HTML so the two worktrees can be diffed line-for-line. Any difference must be provably inert.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await admin.from("audits").select("*").eq("id", "95698f91-ddeb-4ed2-b5c4-eda18495219a").single();
  const { renderV4ReportFromRow } = await import("../../src/lib/v4-report/report");
  const html = renderV4ReportFromRow(row as Record<string, unknown>);
  fs.writeFileSync(process.env.RT1_OUT || "/tmp/rt1-render.html", html);
  console.log(`RENDER_LEN=${html.length}`);
  console.log(`RENDER_SHA=${crypto.createHash("sha256").update(html).digest("hex")}`);
})();
