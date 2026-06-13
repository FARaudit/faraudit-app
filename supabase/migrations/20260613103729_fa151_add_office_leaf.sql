-- FA-151 — masthead office-leaf binding.
-- resolveAgency() persists only the department · service top-2 of SAM's
-- fullParentPathName into audits.agency; the buying-office leaf below it
-- (e.g. "DLA AVIATION AT OKLAHOMA CITY, OK") was dropped. Persist the leaf so
-- the audit report masthead can show the specific office as its identity
-- first line, with the top-2 hierarchy as the subnote.
-- Idempotent — safe to re-run.
ALTER TABLE audits ADD COLUMN IF NOT EXISTS office_leaf text;
