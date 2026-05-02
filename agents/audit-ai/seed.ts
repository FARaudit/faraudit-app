// One-shot: seed pending_audits with the 3 validated fixtures used in T2-2.
// Run from faraudit-app/ root: `npx tsx agents/audit-ai/seed.ts`
//
// Idempotent — uses upsert(notice_id) so re-running won't duplicate.

import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[seed] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

// Dynamic import AFTER env load — queue.ts captures env at module init.
// @ts-expect-error tsx runtime resolves .ts; tsc strict imports forbid the extension
const queueNs: any = await import("./queue.ts");
const queue = queueNs.default ?? queueNs;
const upsertPending = queue.upsertPending;

const APP_ROOT = resolve(process.cwd());

const fixtures = [
  {
    notice_id: "FA301626Q0068",
    title: "T-38 Talon Intake Plugs and Exhaust Covers",
    agency: "Department of the Air Force",
    naics_code: "336413",
    set_aside: "Total Small Business",
    pdf_path: `${APP_ROOT}/Solicitation+-+FA301626Q0068.pdf`,
    pdf_url: null,
    source: "seed" as const,
    status: "pending" as const,
    notes: "T2-2 fixture · Lockheed-grade validated · DFARS hex-chrome + FOB conflict"
  },
  {
    notice_id: "N0017426Q1021",
    title: "Navy NSWC Indian Head — Connector Plate Anodes",
    agency: "Department of the Navy",
    naics_code: "336413",
    set_aside: null,
    pdf_path: `${APP_ROOT}/Solicitation+-+N0017426Q1021.pdf`,
    pdf_url: null,
    source: "seed" as const,
    status: "pending" as const,
    notes: "T2-2 fixture · CMMC + ITAR + FAT-before-quote schedule conflict"
  },
  {
    notice_id: "FA251726Q0024",
    title: "Peterson SFB Air Handling Unit Repair",
    agency: "Department of the Air Force",
    naics_code: null,
    set_aside: "Total Small Business",
    pdf_path: `${APP_ROOT}/Solicitation+-+FA251726Q0024.pdf`,
    pdf_url: null,
    source: "seed" as const,
    status: "pending" as const,
    notes: "T2-2 fixture · HVAC repair · SOW gaps"
  }
];

async function main() {
  console.log(`[seed] upserting ${fixtures.length} fixture rows into pending_audits`);
  const count = await upsertPending(fixtures);
  console.log(`[seed] upserted=${count}`);
}

main().catch((e) => {
  console.error("[seed] fatal", e);
  process.exit(1);
});
