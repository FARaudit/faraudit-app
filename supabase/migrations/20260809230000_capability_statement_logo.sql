-- COMPANY LOGO ON THE CAPABILITY STATEMENT — the column the upload writes to.
--
-- Applied BEFORE the code that depends on it ships, per Rule 65. The letterhead has
-- carried a dashed placeholder since the surface was built; it most recently read
-- "LOGO / NOT BUILT" precisely because there was no column and no bucket behind it.
--
-- A URL, not bytes. The logo lands in the `company-logos` storage bucket and this holds
-- its public URL. It is public deliberately and that is a product requirement, not
-- laziness: the formatted copy is pasted into Word and email, so the image has to
-- resolve for the RECIPIENT — a contracting officer with no FARaudit account, opening
-- the message days later. A signed URL would expire and the document would silently
-- lose its letterhead after it had already been sent. Object paths are scoped by user
-- id and carry a random component so the bucket is not enumerable.
--
-- NULL means no logo, which is the honest default. Nothing renders a placeholder image
-- in its place: a capability statement with no logo is a capability statement with no
-- logo, and inventing a mark for the customer would put a symbol they never chose on
-- paper they send under their own name.
ALTER TABLE public.capability_statements
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.capability_statements.logo_url IS
  'Public URL of the company logo in the company-logos bucket. NULL = no logo; nothing substitutes one. Written only by POST /api/capability-statement/logo, which scopes the object path to the authenticated user. Rendered on the page, in the PDF export and in the formatted clipboard copy.';
