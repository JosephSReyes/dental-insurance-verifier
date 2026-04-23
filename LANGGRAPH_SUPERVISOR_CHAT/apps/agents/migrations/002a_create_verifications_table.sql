/**
 * Migration 002.5: Create verifications table
 *
 * This table stores verification attempts and their extraction results.
 * Required by the Label Studio integration (migrations 003 and 004).
 */

CREATE TABLE IF NOT EXISTS verifications (
  verification_id VARCHAR(255) PRIMARY KEY,
  mapper VARCHAR(100) NOT NULL,
  field VARCHAR(100) NOT NULL,
  extracted_value TEXT,
  confidence DECIMAL(5, 4),  -- 0.0000 to 1.0000
  portal_type VARCHAR(50),
  office_id VARCHAR(50),
  tool_calls INTEGER DEFAULT 0,
  extraction_time_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_verifications_mapper ON verifications(mapper);
CREATE INDEX IF NOT EXISTS idx_verifications_field ON verifications(field);
CREATE INDEX IF NOT EXISTS idx_verifications_portal_type ON verifications(portal_type);
CREATE INDEX IF NOT EXISTS idx_verifications_office_id ON verifications(office_id);
CREATE INDEX IF NOT EXISTS idx_verifications_created_at ON verifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifications_mapper_field ON verifications(mapper, field);
CREATE INDEX IF NOT EXISTS idx_verifications_office_portal ON verifications(office_id, portal_type);

-- Create updated_at trigger
CREATE TRIGGER update_verifications_updated_at
    BEFORE UPDATE ON verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE verifications IS 'Stores verification extraction attempts and results for Label Studio integration';
COMMENT ON COLUMN verifications.verification_id IS 'Unique identifier for this verification attempt';
COMMENT ON COLUMN verifications.mapper IS 'Name of the mapper that performed the extraction';
COMMENT ON COLUMN verifications.field IS 'Field name being extracted (e.g., patient_name, deductible)';
COMMENT ON COLUMN verifications.extracted_value IS 'Value extracted by the AI';
COMMENT ON COLUMN verifications.confidence IS 'AI confidence score (0.0-1.0)';
COMMENT ON COLUMN verifications.tool_calls IS 'Number of tool calls made during extraction';
COMMENT ON COLUMN verifications.extraction_time_ms IS 'Time taken for extraction in milliseconds';
