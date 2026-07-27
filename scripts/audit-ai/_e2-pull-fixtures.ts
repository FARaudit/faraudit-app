// ARC #747 · E2 — pull VERBATIM fixture strings from the founding record ($0, read-only).
// The E1 battery's worst finding was an INVENTED TEST FIXTURE: a hand-flattened table that "proved" a repair
// the real record refuses. Every string the E2 suite asserts on comes out of this script, not out of my head.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  const rows = (data ?? []) as Record<string, any>[];
  const row = rows.find((r) => String(r.id).startsWith(process.argv[2] ?? "d0664ba2"))!;
  const src: string = row.raw_pdf_text ?? "";
  const fs_: any[] = [...(row.compliance_json?.v3?.findings ?? []), ...(row.compliance_json?.v3?.showStoppers ?? []), ...(row.compliance_json?.findings ?? [])];

  const around = (needle: string, pad = 140) => {
    const i = src.indexOf(needle);
    return i < 0 ? null : src.slice(Math.max(0, i - pad), i + needle.length + pad).replace(/\s+/g, " ").trim();
  };
  console.log("=== SOURCE SPANS (verbatim, whitespace-collapsed) ===");
  for (const n of ["FAR 15.408, Table 15-2", "52.215-22", "DFARS 252.215-7009", "FAR 9.5", "252.204-7016"]) {
    console.log(`\n--- ${n} ---\n${around(n) ?? "ABSENT"}`);
  }
  console.log("\n=== FINDINGS CARRYING A CORPUS-PREFIXED TOKEN ===");
  for (const f of fs_) {
    for (const [k, v] of [["citation", f.citation], ["requirement", f.requirement]] as const) {
      const t = String(v ?? "");
      if (/(FAR|DFARS|AFFARS|VAAR|CFR)\s+\d/i.test(t)) console.log(`\n[${k}] ${JSON.stringify(t)}`);
    }
  }
})();
