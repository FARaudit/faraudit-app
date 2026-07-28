// ARC #747 · E1 — how much of the repair value needs a MULTI-LINE walk? $0, read-only.
// Review finding #2 (a widened quote absorbing a neighbouring obligation) is only reachable when the walk
// crosses a line boundary. If same-line repairs carry most of the value, refusing to cross is cheap and
// closes #2 + #3 by construction instead of by another shape rule.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  const { findHeadRepairSpan } = await import("../../src/lib/audit-excerpt-repair");

  let total = 0, sameLine = 0, crossLine = 0;
  const crossSamples: string[] = [];
  for (const row of ((data ?? []) as Record<string, any>[])) {
    const src: string = row.raw_pdf_text ?? "";
    const fs_: any[] = [...(row.compliance_json?.findings ?? []), ...(row.compliance_json?.v3?.findings ?? [])];
    if (!src || !fs_.length) continue;
    for (const f of fs_) {
      const ex = String(f.excerpt ?? "");
      if (!ex.trim()) continue;
      const span = findHeadRepairSpan(src, ex);
      if (!span) continue;
      total++;
      const head = span.slice(0, span.length - ex.trim().length);
      if (head.includes("\n")) { crossLine++; if (crossSamples.length < 8) crossSamples.push(`${row.solicitation_number}: +"${head.replace(/\n/g, "⏎").slice(0, 110)}"`); }
      else sameLine++;
    }
  }
  console.log(`repairs available: ${total}`);
  console.log(`  same-line head  : ${sameLine}  (${((sameLine / Math.max(1, total)) * 100).toFixed(0)}%)`);
  console.log(`  CROSSES a line  : ${crossLine}  (${((crossLine / Math.max(1, total)) * 100).toFixed(0)}%)  ← the only shape #2/#3 can occur in`);
  if (crossSamples.length) { console.log("\ncross-line restored heads:"); crossSamples.forEach((s) => console.log("  " + s)); }
})();
