-- Migration 025: Audit quality gate
ALTER TABLE audits ADD COLUMN IF NOT EXISTS quality_score integer DEFAULT NULL;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS quality_flag text DEFAULT NULL 
  CHECK (quality_flag IN ('verified', 'review', 'failed', NULL));

-- Backfill quality scores for all 226 existing audits
UPDATE audits SET
  quality_score = (
    CASE WHEN risks_json IS NOT NULL AND length(risks_json::text) > 100 THEN 30 ELSE 0 END +
    CASE WHEN compliance_json IS NOT NULL AND length(compliance_json::text) > 100 THEN 30 ELSE 0 END +
    CASE WHEN overview_json IS NOT NULL AND length(overview_json::text) > 50 THEN 20 ELSE 0 END +
    CASE WHEN risks_json->>'severity_score' IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN risks_json->>'bid_no_bid_recommendation' IS NOT NULL THEN 10 ELSE 0 END
  ),
  quality_flag = CASE
    WHEN (
      CASE WHEN risks_json IS NOT NULL AND length(risks_json::text) > 100 THEN 30 ELSE 0 END +
      CASE WHEN compliance_json IS NOT NULL AND length(compliance_json::text) > 100 THEN 30 ELSE 0 END +
      CASE WHEN overview_json IS NOT NULL AND length(overview_json::text) > 50 THEN 20 ELSE 0 END +
      CASE WHEN risks_json->>'severity_score' IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN risks_json->>'bid_no_bid_recommendation' IS NOT NULL THEN 10 ELSE 0 END
    ) >= 70 THEN 'verified'
    WHEN (
      CASE WHEN risks_json IS NOT NULL AND length(risks_json::text) > 100 THEN 30 ELSE 0 END +
      CASE WHEN compliance_json IS NOT NULL AND length(compliance_json::text) > 100 THEN 30 ELSE 0 END +
      CASE WHEN overview_json IS NOT NULL AND length(overview_json::text) > 50 THEN 20 ELSE 0 END +
      CASE WHEN risks_json->>'severity_score' IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN risks_json->>'bid_no_bid_recommendation' IS NOT NULL THEN 10 ELSE 0 END
    ) >= 50 THEN 'review'
    ELSE 'failed'
  END
WHERE status = 'complete';

-- Index for fast quality filtering
CREATE INDEX IF NOT EXISTS idx_audits_quality_flag ON audits(quality_flag);
CREATE INDEX IF NOT EXISTS idx_audits_quality_score ON audits(quality_score);
