// ARC #747 · E2 — direct probe of the FOUNDING DEFECT record ($0, read-only).
// Gate 4 (PANEL-d0664ba2-GATE4.md C1) says the report printed "DFARS 215-2" where the source says
// "FAR 15.408, Table 15-2". Before designing a gate for that shape, confirm the shape is really there and in
// which field — a repair certified against a defect that does not reproduce is the invented-fixture failure.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const ID_PREFIX = process.argv[2] ?? "d0664ba2";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data, error } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Record<string, any>[];

  console.log(`rows fetched: ${rows.length}`);
  const withBoth = rows.filter((r) => (r.raw_pdf_text ?? "").length > 0 && ((r.compliance_json?.findings ?? r.compliance_json?.typed_findings ?? []).length > 0));
  console.log(`rows with source AND findings: ${withBoth.length}`);
  console.log(withBoth.map((r) => `  ${String(r.id).slice(0, 8)} ${r.solicitation_number} findings=${(r.compliance_json?.findings ?? r.compliance_json?.typed_findings ?? []).length} src=${(r.raw_pdf_text ?? "").length}`).join("\n"));

  const row = rows.find((r) => String(r.id).startsWith(ID_PREFIX));
  if (!row) { console.log(`\n!! ${ID_PREFIX} NOT among the ${rows.length} most recent rows`); return; }

  const src: string = row.raw_pdf_text ?? "";
  const cj = row.compliance_json ?? {};
  console.log(`\n${ID_PREFIX}: sol=${row.solicitation_number} src=${src.length} compliance_json keys=[${Object.keys(cj).join(", ")}]`);

  // Where does "215-2" / "15-2" / "15.408" appear, on either side?
  const probe = (label: string, hay: string, needles: string[]) => {
    for (const n of needles) {
      const idxs: number[] = []; let i = hay.indexOf(n);
      while (i >= 0 && idxs.length < 6) { idxs.push(i); i = hay.indexOf(n, i + 1); }
      console.log(`  ${label} "${n}": ${idxs.length ? idxs.length + " hit(s)" : "ABSENT"}`);
      for (const at of idxs) console.log(`      …${hay.slice(Math.max(0, at - 90), at + 90).replace(/\s+/g, " ")}…`);
    }
  };
  console.log("\nSOURCE:");
  probe("src", src, ["215-2", "15.408", "Table 15-2", "252.215-7009", "DFARS 215"]);

  const blob = JSON.stringify(cj);
  console.log("\nCOMPLIANCE_JSON (whole blob):");
  probe("cj", blob, ["215-2", "15.408", "252.215-7009", "DFARS 215"]);
})();
