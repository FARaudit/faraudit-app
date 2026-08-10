-- TWO COLUMNS THE CODE ALREADY READS AND THE DATABASE DID NOT HAVE.
--
-- Applied to production BEFORE the commit ships, per Rule 65. The migration this one follows
-- (20260810000000) carried the same header sentence and was pushed without ever being applied —
-- the readers and the profile editor shipped against columns production did not have, and the
-- gap was invisible because the resolver's NULL fallback is indistinguishable from "column
-- absent" when the query selects `*`. That is the reason both columns below are verified by
-- query after the push, not assumed from a clean exit code.
--
-- contact_title
--   `capability-statement-plate.tsx` reads `stmt.contact_title` today to build the CONTACT cell:
--   the name, then a comma and the title when one exists. Design asked for it by name in card
--   825 §1 — "a CO wants to know whether they are reading the President or the front desk" — and
--   the plate was written to use it. With no column the expression is permanently undefined, so
--   the cell has silently rendered a bare name for every profile. Customer-supplied free text,
--   settable through the record PATCH like the other contact fields.
--
-- sam_registration_status
--   The ninth cell of the ruled 3/3/3 title block. DELIBERATELY NOT CUSTOMER-SETTABLE, and it is
--   left out of ALLOWED_FIELDS in the record route on purpose: "Active" is a fact SAM owns, and a
--   firm whose registration has lapsed printing it over its own signature is the one error this
--   document cannot make. It is written by a SAM sync against the UEI, or it stays null and the
--   cell does not render under the empty-section rule. A NOT-NULL default would defeat that —
--   an unsynced profile would assert a registration state nobody checked.
--
-- Both are additive and idempotent. No existing column is altered and no data is reinterpreted.
ALTER TABLE public.capability_statements
  ADD COLUMN IF NOT EXISTS contact_title           TEXT,
  ADD COLUMN IF NOT EXISTS sam_registration_status TEXT;

COMMENT ON COLUMN public.capability_statements.contact_title IS
  'Contact job title, customer-supplied. Rendered by the card-825 plate as "Name, Title" — the comma belongs to the title, so a record without one prints a bare name rather than a trailing comma. NULL means no title on file.';

COMMENT ON COLUMN public.capability_statements.sam_registration_status IS
  'SAM registration state, WRITTEN ONLY BY A SAM SYNC — never by the customer, and deliberately excluded from the record PATCH allowlist. "Active" is SAM''s fact; a lapsed firm printing it on a document a contracting officer reads is a false statement. NULL means not synced, and the title-block cell is omitted rather than guessed.';
