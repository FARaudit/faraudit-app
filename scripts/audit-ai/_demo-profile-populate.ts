// Populate the demo firm's V2 profile columns (Apex Defense Systems LLC, demo@ account).
// Runs AFTER migration 20260729180000 is applied (columns must exist). --dry default; --apply writes.
// Values are the demo persona's authoritative-source records: SBA VetCert SDVOSB (3-year cycle),
// SAM registration (annual), and affiliate-inclusive size facts (verified_import). Size status is
// NOT stored — the builder computes it per-run vs each solicitation's NAICS (PR #319).
// NOTE: only the dominant production-emitter spelling "registration:SAM-active" is stored; the
// registration: namespace has no canonicalizer, so model spelling variants stay unknown → caution
// (honest). Normalization of that namespace is a follow-up, not a data patch.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const DEMO_USER = "135cb5c6-f391-4c8b-a5f2-0088004ac797";
const APPLY = process.argv.includes("--apply");

const attributes_v2 = [
  { attr: "se:sdvosb", source: "sba_api", verifiedAt: "2026-07-15", expiresAt: "2029-07-15" },
  { attr: "registration:SAM-active", source: "sam_api", verifiedAt: "2026-07-15", expiresAt: "2027-05-01" },
];
const size_facts = {
  receiptsAvg3yrAffiliateInclusiveUsd: 28_400_000,
  employeesAffiliateInclusive: 185,
  source: "verified_import",
  verifiedAt: "2026-07-15",
};

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: before, error: readErr } = await admin
    .from("capability_statements")
    .select("id, company_name, certifications, attributes_v2, size_facts")
    .eq("user_id", DEMO_USER)
    .maybeSingle();
  if (readErr) { console.error(`read failed: ${readErr.message} — migration applied yet?`); process.exit(1); }
  if (!before) { console.error("no capability row for the demo user"); process.exit(1); }
  console.log(`row: ${before.company_name} (${before.id})`);
  console.log(`current attributes_v2: ${JSON.stringify(before.attributes_v2)} · size_facts: ${JSON.stringify(before.size_facts)}`);
  console.log(`writing: ${JSON.stringify({ attributes_v2, size_facts }, null, 1)}`);
  if (!APPLY) { console.log("\nDRY RUN — pass --apply to write."); return; }
  const { error } = await admin
    .from("capability_statements")
    .update({ attributes_v2, size_facts })
    .eq("user_id", DEMO_USER);
  if (error) { console.error(`update failed: ${error.message}`); process.exit(1); }
  const { data: after } = await admin
    .from("capability_statements")
    .select("attributes_v2, size_facts")
    .eq("user_id", DEMO_USER)
    .maybeSingle();
  // jsonb normalizes key order — compare with sorted keys, or a correct write reads as MISMATCH (ruler bug, hit live 2026-07-29)
  const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys)
    : v !== null && typeof v === "object"
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]))
      : v;
  const canon = (v: unknown): string => JSON.stringify(sortKeys(v));
  const ok = canon(after?.attributes_v2) === canon(attributes_v2) && canon(after?.size_facts) === canon(size_facts);
  console.log(`\nread-back ${ok ? "VERIFIED" : "MISMATCH"}: ${JSON.stringify(after)}`);
  process.exit(ok ? 0 : 1);
})();
