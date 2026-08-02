// $0 PRE-FLIGHT for the next live run — is the candidate still biddable, and what will it COST?
//
// The binding-doc analysis floor (#388) is armed but has never run. The sharpest test of it is a solicitation
// whose amendments were among the 10 documents the floor newly names. This checks, for each candidate, the two
// things that decide whether firing is worth it, from LIVE SAM and from the banked ingestion record:
//
//   1. IS IT STILL OPEN — `fetchLiveSamStatus` (the production client, not an ad-hoc fetch): active flag,
//      current post-amendment response deadline, amendment count. An expired notice is not a test, it is a refund
//      request.
//   2. WILL THE EXPENSIVE STAGES FIRE — stages 0a/0b (OCR residual confirm + rate-table confirm) are paid
//      `claude-opus-5` VISION calls, live via AUDIT_WORKER_OCR + AUDIT_OCR_TABLE_CONFIRM. They fire only on
//      documents with no machine-readable text. A package with scanned attachments costs materially more than the
//      ≈$1.25-1.50 baseline, and that belongs in the decision BEFORE the spend, not the invoice after it.
//
// Reads only. Fires nothing. G2: Code never fires a paid run.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_preflight-live-candidates.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

// The census specimens — solicitations whose amendment documents the floor newly names.
const CANDIDATES = ["SPRRA2-26-R-0034", "36C24126Q0569"];

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { fetchLiveSamStatus } = await import("../../src/lib/sam");

  console.log(`\nPRE-FLIGHT — live-run candidates for the binding-doc analysis floor (#388)\n`);

  for (const sol of CANDIDATES) {
    const { data } = await admin
      .from("audits")
      .select("id,notice_id,solicitation_number,created_at,compliance_json")
      .eq("solicitation_number", sol)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as { id: string; notice_id: string | null; compliance_json: Record<string, any> | null; created_at: string } | undefined;

    console.log(`${"=".repeat(96)}`);
    console.log(`${sol}`);
    if (!row) { console.log(`  no banked audit — cannot resolve a notice id from here\n`); continue; }
    console.log(`  last audited ${row.created_at.slice(0, 19)} · audit ${row.id.slice(0, 8)} · notice ${row.notice_id ?? "(none)"}`);

    // 1 — LIVE SAM status, via the production client.
    if (!row.notice_id) {
      console.log(`  SAM: no notice id banked → cannot check live status`);
    } else {
      try {
        const live = await fetchLiveSamStatus(row.notice_id, sol);
        if (!live.fetched) {
          console.log(`  SAM: NOT FETCHED — notice not found under this id or solicitation number (withdrawn, archived, or re-keyed)`);
        } else {
          const dl = live.responseDeadline ? new Date(live.responseDeadline) : null;
          const daysLeft = dl ? Math.round((dl.getTime() - Date.parse(new Date().toISOString())) / 86_400_000) : null;
          console.log(`  SAM: active=${live.active} · deadline=${live.responseDeadline ?? "(none)"}${daysLeft !== null ? ` (${daysLeft} days from now)` : ""} · amendments=${live.amendmentCount ?? "?"}`);
          console.log(`  BIDDABLE: ${live.active === true && (daysLeft === null || daysLeft > 0) ? "YES" : "NO — expired or inactive; a run here tests the engine but is not a customer scenario"}`);
        }
      } catch (e) {
        console.log(`  SAM: ERROR — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 2 — will the paid Opus-5 vision stages fire? Keyed on the banked ingestion record's has_text.
    const files = (row.compliance_json?.ingestion?.files ?? []) as Array<{ name?: string; ingested?: boolean; has_text?: boolean; truncated?: boolean }>;
    if (!files.length) {
      console.log(`  COST: no ingestion manifest banked → cannot predict stages 0a/0b`);
    } else {
      const noText = files.filter((f) => f.ingested && f.has_text !== true);
      console.log(`  DOCS: ${files.length} ingested · ${noText.length} without machine-readable text`);
      console.log(`  COST: stages 0a/0b (Opus 5 vision) ${noText.length ? `WILL LIKELY FIRE on ${noText.length} doc(s) → above the ≈$1.25–1.50 baseline` : "should NOT fire → baseline cost expected"}`);
      for (const f of noText.slice(0, 5)) console.log(`          · ${f.name}`);
    }
    console.log();
  }
  process.exit(0);
})();
