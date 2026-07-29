-- U-C profile schema v2 — construction-side storage (PR #318 shipped the engine side).
-- attributes_v2: array of ProfileAttributeRecord {attr, source, verifiedAt, expiresAt}
-- size_facts:    {receiptsAvg3yrAffiliateInclusiveUsd, employeesAffiliateInclusive, source, verifiedAt}
--                Raw facts only — size status is computed PER-RUN against the solicitation's NAICS
--                standard at profile construction, never stored as a derived boolean.
-- Both nullable; rows without them build the legacy open-world profile byte-identically.
alter table capability_statements
  add column if not exists attributes_v2 jsonb,
  add column if not exists size_facts jsonb;
