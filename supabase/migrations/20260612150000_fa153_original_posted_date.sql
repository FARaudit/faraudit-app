-- FA-153 · OHA appeal window must key off ORIGINAL issuance date.
--
-- audits.posted_date holds the LATEST SAM version's posted date — amendments
-- overwrite it. Evidence: FA460026Q0047 / audit 8aa2bab9 carried
-- posted_date=2026-06-09 (Amendment 0002) while SAM version history shows
-- original issuance 2026-06-03. The 10-calendar-day OHA NAICS-appeal clock
-- (13 CFR 121.1103(b)(1)) runs from original issuance and restarts only for
-- amendments that change the NAICS code or size standard (FAR 19.103(a)(1)),
-- so 10-day math off posted_date overstated the window by 6 days.
--
-- Additive only: posted_date semantics are untouched (it remains "latest
-- version posted"). original_posted_date is the version-1 publish date from
-- the SAM history endpoint (opps/v2 …/history, Accept: application/hal+json).
-- NULL means history was not retrievable at audit time — consumers must say
-- "verify issuance date on SAM.gov", never silently fall back to posted_date.

ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS original_posted_date date;

COMMENT ON COLUMN public.audits.original_posted_date IS
  'FA-153: SAM version-1 (original issuance) publish date from the notice history endpoint. NULL = history unavailable at audit time; consumers must not fall back to posted_date (which amendments overwrite).';
