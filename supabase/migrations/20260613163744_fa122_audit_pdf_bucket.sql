-- FA-122 — large-PDF client-direct upload bucket + RLS.
-- PDFs above Vercel's ~4.5MB request-body limit are uploaded by the browser
-- straight to Supabase Storage, then /api/audit downloads them server-side via
-- the service role. The "audit-pdfs" bucket already exists in production (made
-- via dashboard); this INSERT is idempotent so the migration is reproducible.
-- Idempotent — safe to re-run.

INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-pdfs', 'audit-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS on storage.objects. The server reads with the service role (which
-- bypasses RLS), so no SELECT policy is needed for the audit pipeline itself.
-- These policies exist so the BROWSER (authenticated, anon key + session) can
-- upload — and ONLY into its own "uploads/<user.id>/..." namespace, which is
-- the same prefix /api/audit enforces server-side as the IDOR guard.
DROP POLICY IF EXISTS "audit-pdfs: authenticated upload own folder" ON storage.objects;
CREATE POLICY "audit-pdfs: authenticated upload own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audit-pdfs'
    AND (storage.foldername(name))[1] = 'uploads'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "audit-pdfs: authenticated read own folder" ON storage.objects;
CREATE POLICY "audit-pdfs: authenticated read own folder"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'audit-pdfs'
    AND (storage.foldername(name))[1] = 'uploads'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
