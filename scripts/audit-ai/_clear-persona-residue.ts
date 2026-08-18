// ONE-OFF: strip the Apex Defense Systems persona residue from the demo company record.
// CEO-authorised 2026-08-08 in-terminal. --dry default; --apply writes.
//
// Clears four fields and puts NOTHING back — the CEO fills the record as a customer, and
// that act is the test:
//   certifications  ["Small Business (SBA)", "SDVOSB"]  → []
//   size_facts      185 employees / $28.4M "verified_import" → null   (the live defect:
//                   provenance makes the engine honour it, clearing a total-SB set-aside)
//   uei             FARAUDT00001 (placeholder)          → null
//   cage_code       8TZ42 (placeholder)                 → null
//
// NAICS, company name and address are deliberately UNTOUCHED — not in scope.
//
// A PostgREST update that matches zero rows reports success, so the write is proven by
// READ-BACK, never by the absence of an error.
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const DEMO_EMAIL = "demo@faraudit.com";

const CLEARED = { certifications: [] as string[], size_facts: null, uei: null, cage_code: null };

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
  const admin = createClient(url, key);

  // Resolve the user by EMAIL rather than trusting a user_id copied from another script.
  const { data: users, error: uErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (uErr) { console.error(`auth list failed: ${uErr.message}`); process.exit(1); }
  const user = users.users.find((u) => u.email === DEMO_EMAIL);
  if (!user) { console.error(`no auth user for ${DEMO_EMAIL}`); process.exit(1); }
  console.log(`user: ${DEMO_EMAIL} → ${user.id}`);

  const { data: before, error: rErr } = await admin
    .from("capability_statements")
    .select("id, user_id, company_name, uei, cage_code, certifications, attributes_v2, size_facts, naics_codes")
    .eq("user_id", user.id)
    .maybeSingle();
  if (rErr) { console.error(`read failed: ${rErr.message}`); process.exit(1); }
  if (!before) { console.error("no capability_statements row for that user"); process.exit(1); }

  // GUARD: refuse to write a row that is not the one this cleanup was reasoned about.
  if (before.company_name !== "FARaudit Inc.") {
    console.error(`ABORT — expected company_name "FARaudit Inc.", found ${JSON.stringify(before.company_name)}`);
    process.exit(1);
  }

  console.log("\nBEFORE:");
  console.log(`  certifications: ${JSON.stringify(before.certifications)}`);
  console.log(`  size_facts:     ${JSON.stringify(before.size_facts)}`);
  console.log(`  uei:            ${JSON.stringify(before.uei)}`);
  console.log(`  cage_code:      ${JSON.stringify(before.cage_code)}`);
  console.log(`  (untouched) naics_codes: ${JSON.stringify(before.naics_codes)} · attributes_v2: ${JSON.stringify(before.attributes_v2)}`);

  if (!APPLY) { console.log("\nDRY RUN — pass --apply to write."); return; }

  // .select("id") so a zero-row match is VISIBLE rather than reported as success.
  const { data: written, error: wErr } = await admin
    .from("capability_statements")
    .update(CLEARED)
    .eq("user_id", user.id)
    .select("id");
  if (wErr) { console.error(`update failed: ${wErr.message}`); process.exit(1); }
  if (!written || written.length !== 1) {
    console.error(`ABORT — update matched ${written ? written.length : 0} rows, expected 1 (RLS or wrong key)`);
    process.exit(1);
  }

  const { data: after } = await admin
    .from("capability_statements")
    .select("uei, cage_code, certifications, size_facts, naics_codes, company_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const emptied =
    Array.isArray(after?.certifications) && after!.certifications.length === 0 &&
    after?.size_facts === null && after?.uei === null && after?.cage_code === null;
  const preserved =
    after?.company_name === before.company_name &&
    JSON.stringify(after?.naics_codes) === JSON.stringify(before.naics_codes);

  console.log("\nAFTER (read back):");
  console.log(`  ${JSON.stringify(after)}`);
  console.log(`\ncleared: ${emptied ? "VERIFIED" : "FAILED"} · untouched fields preserved: ${preserved ? "VERIFIED" : "FAILED"}`);
  process.exit(emptied && preserved ? 0 : 1);
})();
