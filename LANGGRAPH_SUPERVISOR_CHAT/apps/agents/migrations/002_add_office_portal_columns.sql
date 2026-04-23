-- Add office_id and portal_type columns to feedback_corrections table
ALTER TABLE feedback_corrections
ADD COLUMN IF NOT EXISTS office_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS portal_type VARCHAR(50);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_feedback_office
ON feedback_corrections(office_id);

CREATE INDEX IF NOT EXISTS idx_feedback_portal
ON feedback_corrections(portal_type);

CREATE INDEX IF NOT EXISTS idx_feedback_office_provider
ON feedback_corrections(office_id, provider);

CREATE INDEX IF NOT EXISTS idx_feedback_office_portal
ON feedback_corrections(office_id, portal_type);

-- Update enriched view to include new columns
DROP VIEW IF EXISTS feedback_corrections_enriched;

CREATE OR REPLACE VIEW feedback_corrections_enriched AS
SELECT
    fc.*,
    fc.metadata->>'patient_name' as patient_name,
    fc.metadata->>'verification_date' as verification_date,
    fc.metadata->>'office_id' as metadata_office_id,
    fc.office_id as office_id,
    fc.portal_type as portal_type
FROM feedback_corrections fc;

-- Backfill office_id and portal_type from metadata JSONB for existing records
UPDATE feedback_corrections
SET
    office_id = metadata->>'office_id',
    portal_type = metadata->>'portal_type'
WHERE office_id IS NULL OR portal_type IS NULL;

COMMENT ON COLUMN feedback_corrections.office_id IS 'Office identifier for per-office training isolation';
COMMENT ON COLUMN feedback_corrections.portal_type IS 'Portal type (bcbs, delta_dental) for portal-specific learning';
