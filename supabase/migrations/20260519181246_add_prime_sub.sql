ALTER TABLE audits ADD COLUMN IF NOT EXISTS prime_sub text CHECK (prime_sub IN ('prime','sub'));
