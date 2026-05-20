-- FA-96b · Add sb_recipients column to defense_spending_intel
-- Stores top 10 recipients on SB set-aside awards only (ICP intelligence —
-- the actual small businesses winning in each NAICS, separate from the
-- Lockheed/Boeing-tier large primes captured in top_recipients).
--
-- Why a separate column instead of nested in top_recipients: the data has
-- different semantics. top_recipients answers "who dominates this NAICS";
-- sb_recipients answers "who am I competing with on set-aside awards".
-- Demo prospects need both views.

ALTER TABLE defense_spending_intel
  ADD COLUMN IF NOT EXISTS sb_recipients jsonb;
