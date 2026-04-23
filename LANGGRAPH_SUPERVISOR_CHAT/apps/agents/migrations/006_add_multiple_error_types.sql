-- Migration 006: Add support for multiple error types with individual explanations
-- Allows reviewers to select multiple error categories and provide explanation for each

-- Add new columns to enhanced_annotations
ALTER TABLE enhanced_annotations
  ADD COLUMN IF NOT EXISTS error_types TEXT[] DEFAULT '{}', -- Array of selected error types
  ADD COLUMN IF NOT EXISTS error_explanations JSONB DEFAULT '{}', -- {errorType: explanation} mapping
  ADD COLUMN IF NOT EXISTS violated_business_rules TEXT[] DEFAULT '{}', -- Array of business rule codes violated
  ADD COLUMN IF NOT EXISTS feedback_date DATE DEFAULT CURRENT_DATE; -- Date when feedback was submitted

-- Create error type enum for validation (optional, can also use text array with CHECK)
DO $$ BEGIN
  CREATE TYPE error_type_category AS ENUM (
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
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add check constraint to ensure error_types contains valid values
ALTER TABLE enhanced_annotations
  ADD CONSTRAINT check_error_types_valid CHECK (
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

-- Add constraint to ensure each error type in error_types has an explanation
-- Note: This is checked at application level, but we add comment for clarity
COMMENT ON COLUMN enhanced_annotations.error_explanations IS 'JSONB object where each key is an error type and value is the explanation. MUST have entry for each type in error_types array.';

-- Create function to validate error_explanations matches error_types
CREATE OR REPLACE FUNCTION validate_error_explanations()
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

-- Create trigger to validate error explanations
CREATE TRIGGER trigger_validate_error_explanations
BEFORE INSERT OR UPDATE ON enhanced_annotations
FOR EACH ROW
WHEN (array_length(NEW.error_types, 1) > 0)
EXECUTE FUNCTION validate_error_explanations();

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_error_types ON enhanced_annotations USING GIN (error_types);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_business_rules ON enhanced_annotations USING GIN (violated_business_rules);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_feedback_date ON enhanced_annotations(feedback_date);

-- Create materialized view for error type statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS error_type_statistics AS
SELECT
  mapper,
  field,
  provider,
  portal_type,
  office_id,

  -- Error type breakdown (unnest array to count)
  error_type,
  COUNT(*) as occurrence_count,

  -- Per error type stats
  AVG(ai_confidence) as avg_ai_confidence_for_error,
  AVG(human_confidence) as avg_human_confidence_for_error,

  -- Recent occurrences
  MAX(feedback_date) as last_occurrence_date,
  COUNT(*) FILTER (WHERE feedback_date >= CURRENT_DATE - INTERVAL '30 days') as occurrences_last_30_days,

  -- Common co-occurring errors
  ARRAY_AGG(DISTINCT other_errors.error) FILTER (WHERE other_errors.error != error_type) as co_occurring_errors

FROM enhanced_annotations,
     LATERAL unnest(error_types) as error_type,
     LATERAL (
       SELECT unnest(error_types) as error
       FROM enhanced_annotations e2
       WHERE e2.id = enhanced_annotations.id
     ) as other_errors

WHERE array_length(error_types, 1) > 0

GROUP BY mapper, field, provider, portal_type, office_id, error_type

ORDER BY occurrence_count DESC;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_error_type_stats_mapper ON error_type_statistics(mapper);
CREATE INDEX IF NOT EXISTS idx_error_type_stats_error_type ON error_type_statistics(error_type);
CREATE INDEX IF NOT EXISTS idx_error_type_stats_recent ON error_type_statistics(last_occurrence_date DESC);

-- Update the main stats view to include error type information
DROP MATERIALIZED VIEW IF EXISTS enhanced_annotations_stats;
CREATE MATERIALIZED VIEW enhanced_annotations_stats AS
SELECT
  mapper,
  field,
  provider,
  portal_type,
  office_id,

  -- Path quality stats
  COUNT(*) as total_annotations,
  COUNT(*) FILTER (WHERE path_quality = 'correct') as correct_paths,
  COUNT(*) FILTER (WHERE path_quality = 'incorrect') as incorrect_paths,
  COUNT(*) FILTER (WHERE path_quality = 'partial') as partial_paths,
  COUNT(*) FILTER (WHERE path_quality = 'ambiguous') as ambiguous_paths,

  -- Value quality stats
  COUNT(*) FILTER (WHERE value_quality = 'exact') as exact_values,
  COUNT(*) FILTER (WHERE value_quality = 'format_issue') as format_issues,
  COUNT(*) FILTER (WHERE value_quality = 'type_issue') as type_issues,
  COUNT(*) FILTER (WHERE value_quality = 'incorrect') as incorrect_values,

  -- Search effectiveness stats
  COUNT(*) FILTER (WHERE search_effectiveness = 'effective') as effective_searches,
  COUNT(*) FILTER (WHERE search_effectiveness = 'suboptimal') as suboptimal_searches,
  COUNT(*) FILTER (WHERE search_effectiveness = 'ineffective') as ineffective_searches,

  -- Error type stats (NEW)
  COUNT(*) FILTER (WHERE 'wrong_json_path' = ANY(error_types)) as wrong_json_path_count,
  COUNT(*) FILTER (WHERE 'missing_data' = ANY(error_types)) as missing_data_count,
  COUNT(*) FILTER (WHERE 'format_error' = ANY(error_types)) as format_error_count,
  COUNT(*) FILTER (WHERE 'business_rule_violation' = ANY(error_types)) as business_rule_violation_count,
  COUNT(*) FILTER (WHERE 'wrong_value' = ANY(error_types)) as wrong_value_count,

  -- Business rule violations (NEW)
  COUNT(*) FILTER (WHERE array_length(violated_business_rules, 1) > 0) as has_business_rule_violations,
  (
    SELECT ARRAY_AGG(DISTINCT rule)
    FROM enhanced_annotations e,
    LATERAL unnest(e.violated_business_rules) as rule
    WHERE e.mapper = enhanced_annotations.mapper
      AND e.field = enhanced_annotations.field
    LIMIT 10
  ) as most_common_rule_violations,

  -- Performance stats
  AVG(tool_calls_count) as avg_tool_calls,
  AVG(extraction_time_ms) as avg_extraction_time_ms,
  AVG(token_cost) as avg_token_cost,

  -- Confidence stats
  AVG(ai_confidence) as avg_ai_confidence,
  AVG(human_confidence) as avg_human_confidence,
  AVG(confidence_gap) as avg_confidence_gap,

  -- Edge cases
  COUNT(*) FILTER (WHERE is_edge_case = TRUE) as edge_case_count,

  -- Temporal (NEW)
  MAX(feedback_date) as last_feedback_date,
  COUNT(*) FILTER (WHERE feedback_date >= CURRENT_DATE - INTERVAL '7 days') as feedbacks_last_7_days,
  COUNT(*) FILTER (WHERE feedback_date >= CURRENT_DATE - INTERVAL '30 days') as feedbacks_last_30_days,

  -- Last updated
  MAX(created_at) as last_annotation_date

FROM enhanced_annotations
GROUP BY mapper, field, provider, portal_type, office_id;

-- Recreate index on updated materialized view
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_stats_mapper ON enhanced_annotations_stats(mapper);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_stats_portal ON enhanced_annotations_stats(office_id, portal_type);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_stats_recent ON enhanced_annotations_stats(last_feedback_date DESC);

-- Create helper view for business rule violations
CREATE OR REPLACE VIEW business_rule_violations_summary AS
SELECT
  br.rule_code,
  br.rule_name,
  br.rule_category,
  br.severity,
  br.applies_to_mapper,
  br.applies_to_field,

  COUNT(DISTINCT ea.id) as violation_count,
  COUNT(DISTINCT ea.verification_id) as affected_verifications,

  AVG(ea.ai_confidence) as avg_ai_confidence_when_violated,

  MAX(ea.feedback_date) as last_violation_date,
  COUNT(DISTINCT ea.id) FILTER (WHERE ea.feedback_date >= CURRENT_DATE - INTERVAL '30 days') as violations_last_30_days,

  -- Sample explanations
  ARRAY_AGG(DISTINCT ea.error_explanations->>(br.rule_code) ORDER BY ea.created_at DESC) FILTER (WHERE ea.error_explanations ? br.rule_code) as sample_explanations

FROM business_rules br
LEFT JOIN enhanced_annotations ea ON br.rule_code = ANY(ea.violated_business_rules)

WHERE br.is_active = TRUE

GROUP BY br.rule_code, br.rule_name, br.rule_category, br.severity, br.applies_to_mapper, br.applies_to_field

ORDER BY violation_count DESC NULLS LAST;

-- Add helpful comments
COMMENT ON COLUMN enhanced_annotations.error_types IS 'Array of error type categories selected by reviewer (e.g., ["wrong_json_path", "format_error"])';
COMMENT ON COLUMN enhanced_annotations.error_explanations IS 'JSONB mapping of each error type to its explanation: {"wrong_json_path": "AI looked at in-network instead of out-of-network", "format_error": "Should be number 100 not string 100%"}';
COMMENT ON COLUMN enhanced_annotations.violated_business_rules IS 'Array of business rule codes that were violated (e.g., ["MISSING_TOOTH_CLAUSE_BOOLEAN", "DATE_FORMAT_YYYY_MM_DD"])';
COMMENT ON COLUMN enhanced_annotations.feedback_date IS 'Date when the human review/feedback was submitted (not the extraction date)';
COMMENT ON MATERIALIZED VIEW error_type_statistics IS 'Statistics on error type occurrences and co-occurrence patterns';
COMMENT ON VIEW business_rule_violations_summary IS 'Summary of how often each business rule is violated with sample explanations';
