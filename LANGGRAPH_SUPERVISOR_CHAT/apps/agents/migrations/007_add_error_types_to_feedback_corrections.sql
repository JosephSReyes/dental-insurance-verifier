-- Migration 007: Add multiple error types support to feedback_corrections table
-- This aligns feedback_corrections with enhanced_annotations for consistent error tracking

-- Add new columns to feedback_corrections (matching migration 006 for enhanced_annotations)
ALTER TABLE feedback_corrections
  ADD COLUMN IF NOT EXISTS error_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS error_explanations JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS violated_business_rules TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS feedback_date DATE DEFAULT CURRENT_DATE;

-- Add check constraint to ensure error_types contains valid values
ALTER TABLE feedback_corrections
  ADD CONSTRAINT check_feedback_error_types_valid CHECK (
    error_types <@ ARRAY[
      'wrong_json_path',
      'missing_data',
      'format_error',
      'business_rule_violation',
      'wrong_value',
      'logic_error',
      'portal_data_issue',
      'scraping_error',
      'incomplete_extraction',
      'confidence_mismatch',
      'other'
    ]::TEXT[]
  );

-- Create function to validate error_explanations matches error_types for feedback_corrections
CREATE OR REPLACE FUNCTION validate_feedback_error_explanations()
RETURNS TRIGGER AS $$
DECLARE
  error_type TEXT;
  explanation TEXT;
BEGIN
  -- Check that each error type has an explanation
  FOREACH error_type IN ARRAY NEW.error_types LOOP
    explanation := NEW.error_explanations->>error_type;

    IF explanation IS NULL OR LENGTH(TRIM(explanation)) < 10 THEN
      RAISE EXCEPTION 'Error type "%" must have an explanation of at least 10 characters', error_type;
    END IF;
  END LOOP;

  -- Check that error_explanations doesn't have extra keys
  FOR error_type IN SELECT jsonb_object_keys(NEW.error_explanations) LOOP
    IF NOT (error_type = ANY(NEW.error_types)) THEN
      RAISE EXCEPTION 'Explanation provided for error type "%" which is not in error_types array', error_type;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate error explanations for feedback_corrections
CREATE TRIGGER trigger_validate_feedback_error_explanations
BEFORE INSERT OR UPDATE ON feedback_corrections
FOR EACH ROW
WHEN (array_length(NEW.error_types, 1) > 0)
EXECUTE FUNCTION validate_feedback_error_explanations();

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_feedback_corrections_error_types ON feedback_corrections USING GIN (error_types);
CREATE INDEX IF NOT EXISTS idx_feedback_corrections_business_rules ON feedback_corrections USING GIN (violated_business_rules);
CREATE INDEX IF NOT EXISTS idx_feedback_corrections_feedback_date ON feedback_corrections(feedback_date);

-- Add helpful comments
COMMENT ON COLUMN feedback_corrections.error_types IS 'Array of error type categories selected by reviewer (e.g., ["wrong_json_path", "format_error"])';
COMMENT ON COLUMN feedback_corrections.error_explanations IS 'JSONB mapping of each error type to its explanation: {"wrong_json_path": "AI looked at in-network instead of out-of-network", "format_error": "Should be number 100 not string 100%"}';
COMMENT ON COLUMN feedback_corrections.violated_business_rules IS 'Array of business rule codes that were violated (e.g., ["MISSING_TOOTH_CLAUSE_BOOLEAN", "DATE_FORMAT_YYYY_MM_DD"])';
COMMENT ON COLUMN feedback_corrections.feedback_date IS 'Date when the human review/feedback was submitted (not the extraction date)';
