// Rule 35 cleanup — backfill audits.document_type from the SAM notice type.
// The upload/sol# audit path never stamped document_type, so most audit rows
// carry null and the Past Audits Type column renders "—". Deterministic:
// fetchSolicitationByNoticeId (src/lib/sam.ts library path) → classifyDocType
// (agents/sam-ingest/helpers.ts — the source of truth for these buckets).
// Never guessed from the solicitation-number letter.
//   npx dotenv -e .env.local -- npx tsx scripts/cleanup-backfill-audit-doctype.ts        (dry)
//   npx dotenv -e .env.local -- npx tsx scripts/cleanup-backfill-audit-doctype.ts --apply
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { fetchSolicitationByNoticeId } from "../src/lib/sam";
import { classifyDocType } from "../agents/sam-ingest/helpers";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing Supabase env");
const db = createClient(url, key);

async function main() {
  const { data: rows, error } = await db
    .from("audits")
    .select("id, notice_id, solicitation_number, document_type")
    .is("document_type", null)
    .not("notice_id", "is", null)
    .limit(500);
  if (error) throw error;
  console.log(`rows with null document_type + notice_id: ${rows.length} · mode: ${APPLY ? "APPLY" : "DRY"}`);
  const results: Record<string, unknown>[] = [];
  let stamped = 0, unresolved = 0;
  for (const r of rows) {
    let noticeType: string | null = null;
    try {
      const s = await fetchSolicitationByNoticeId(r.notice_id);
      noticeType = (s && (s as { type?: string }).type) || null;
    } catch { /* unresolved stays null — absent, not guessed */ }
    const dt = noticeType ? classifyDocType(noticeType) : null;
    results.push({ id: r.id, sol: r.solicitation_number, noticeType, docType: dt });
    if (!dt) { unresolved++; continue; }
    if (APPLY) {
      const { error: ue } = await db.from("audits").update({ document_type: dt }).eq("id", r.id).is("document_type", null);
      if (ue) { console.error("update failed", r.id, ue.message); continue; }
    }
    stamped++;
  }
  console.log(`${APPLY ? "stamped" : "would stamp"}: ${stamped} · unresolved (left null, honest): ${unresolved}`);
  writeFileSync(`${process.env.HOME}/faraudit-app/ceo/backfill-doctype-${APPLY ? "apply" : "dry"}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(results, null, 1));
}
main();
