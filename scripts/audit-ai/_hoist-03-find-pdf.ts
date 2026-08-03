// $0 read-only. Is the primary solicitation PDF for eab43ada already in our own `audit-pdfs` bucket?
// If yes, probe 04 compares extractors on bytes we already hold and no external fetch is needed.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT = "eab43ada-2baf-49e2-b224-a968df7864f3";
const SOL = "W50S6U26QA019";

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  for (const prefix of ["", AUDIT, SOL, `${AUDIT}/`, "audits"]) {
    const { data, error } = await db.storage.from("audit-pdfs").list(prefix, { limit: 100 });
    if (error) { console.log(`  list(${JSON.stringify(prefix)}) -> ERROR ${error.message}`); continue; }
    console.log(`  list(${JSON.stringify(prefix)}) -> ${data?.length ?? 0} entries`);
    for (const e of (data ?? []).slice(0, 25)) {
      const sz = (e as any).metadata?.size;
      console.log(`      ${e.name}${e.id ? "" : "/"}  ${sz ? sz + " B" : ""}`);
    }
  }

  // Does any queued/pending record still carry the resource links for this notice?
  for (const tbl of ["pending_audits", "audit_documents", "audit_attachments"]) {
    const { data, error } = await db.from(tbl).select("*").limit(1);
    console.log(`\n  table ${tbl}: ${error ? "ABSENT/denied — " + error.message : `present, columns = ${Object.keys((data?.[0] ?? {}) as object).join(", ") || "(empty table)"}`}`);
  }
})();
