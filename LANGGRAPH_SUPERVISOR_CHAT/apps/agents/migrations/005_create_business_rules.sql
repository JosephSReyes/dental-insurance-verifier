-- Migration 005: Create business rules system for mapper validation constraints
-- This enables dynamic business rule management for different providers/offices

-- Create business_rules table
CREATE TABLE IF NOT EXISTS business_rules (
  id SERIAL PRIMARY KEY,

  -- Rule identification
  rule_code VARCHAR(100) NOT NULL UNIQUE, -- e.g., "MISSING_TOOTH_MUST_BE_BOOLEAN"
  rule_name VARCHAR(255) NOT NULL,
  rule_description TEXT NOT NULL,
  rule_category VARCHAR(50) NOT NULL, -- "data_type", "format", "business_logic", "required_field", "validation"

  -- Rule scope
  applies_to_mapper VARCHAR(100), -- NULL = all mappers
  applies_to_field VARCHAR(100),  -- NULL = all fields in mapper
  applies_to_provider VARCHAR(100), -- NULL = all providers
  applies_to_office_id VARCHAR(50), -- NULL = all offices
  applies_to_portal_type VARCHAR(50), -- NULL = all portal types

  -- Rule definition
  rule_type VARCHAR(50) NOT NULL, -- "data_type_check", "format_validation", "business_constraint", "required_reasoning"
  validation_expression JSONB, -- Flexible rule definition (regex, min/max, custom logic)
  error_message TEXT NOT NULL, -- Message to show when rule is violated
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),

  -- Examples and guidance
  correct_examples TEXT[], -- Array of correct examples
  incorrect_examples TEXT[], -- Array of incorrect examples
  remediation_guidance TEXT, -- How to fix violations

  -- Rule metadata
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 100, -- Lower number = higher priority
  created_by VARCHAR(255),
  approved_by VARCHAR(255),

  -- Audit timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CHECK (
    (applies_to_mapper IS NOT NULL AND applies_to_field IS NOT NULL) OR
    (applies_to_mapper IS NOT NULL AND applies_to_field IS NULL) OR
    (applies_to_mapper IS NULL)
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_business_rules_mapper ON business_rules(applies_to_mapper);
CREATE INDEX IF NOT EXISTS idx_business_rules_field ON business_rules(applies_to_field);
CREATE INDEX IF NOT EXISTS idx_business_rules_provider ON business_rules(applies_to_provider);
CREATE INDEX IF NOT EXISTS idx_business_rules_office ON business_rules(applies_to_office_id);
CREATE INDEX IF NOT EXISTS idx_business_rules_portal ON business_rules(applies_to_portal_type);
CREATE INDEX IF NOT EXISTS idx_business_rules_active ON business_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_business_rules_category ON business_rules(rule_category);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_business_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_business_rules_updated_at
BEFORE UPDATE ON business_rules
FOR EACH ROW
EXECUTE FUNCTION update_business_rules_updated_at();

-- Insert default business rules
INSERT INTO business_rules (rule_code, rule_name, rule_description, rule_category, applies_to_mapper, applies_to_field, rule_type, validation_expression, error_message, severity, correct_examples, incorrect_examples, remediation_guidance, priority, created_by)
VALUES
  -- Data type rules
  (
    'MISSING_TOOTH_CLAUSE_BOOLEAN',
    'Missing Tooth Clause Must Be Boolean',
    'The missingToothClause field must be a boolean value (true/false), never a text description',
    'data_type',
    'coverage_and_benefits_mapper',
    'missingToothClause',
    'data_type_check',
    '{"type": "boolean", "allowedValues": [true, false, null]}',
    'missingToothClause must be boolean (true/false), not text. Extract ONLY from planSummary.data.missingTooth field',
    'critical',
    ARRAY['true', 'false', 'null'],
    ARRAY['"Yes"', '"Has missing tooth clause"', '"Applies"', '1', '0'],
    'Extract boolean value directly from planSummary.data.missingTooth. Never generate descriptive text.',
    10,
    'system'
  ),

  (
    'COVERAGE_PERCENT_NUMBER',
    'Coverage Percent Must Be Number',
    'Coverage percentage fields must be numbers (e.g., 100), not strings with % symbol',
    'data_type',
    'procedure_details_mapper',
    'coverage_percent',
    'data_type_check',
    '{"type": "number", "min": 0, "max": 100}',
    'coverage_percent must be a NUMBER (e.g., 100), not a string (e.g., "100%")',
    'critical',
    ARRAY['100', '80', '50', '0'],
    ARRAY['"100%"', '"80%"', '100%', 'hundred'],
    'Remove % symbol and convert to number. Example: "80%" → 80',
    10,
    'system'
  ),

  -- Format rules
  (
    'DATE_FORMAT_YYYY_MM_DD',
    'Dates Must Be YYYY-MM-DD Format',
    'All date fields must use ISO 8601 date format (YYYY-MM-DD)',
    'format',
    NULL, -- Applies to all mappers
    NULL, -- Applies to all date fields
    'format_validation',
    '{"regex": "^\\d{4}-\\d{2}-\\d{2}$", "format": "YYYY-MM-DD"}',
    'Date must be in YYYY-MM-DD format (e.g., 2025-01-15)',
    'critical',
    ARRAY['2025-01-15', '1985-03-20', '2024-12-31'],
    ARRAY['01/15/2025', '15-01-2025', '2025/01/15', 'January 15, 2025'],
    'Convert all dates to YYYY-MM-DD. Common conversions: MM/DD/YYYY → YYYY-MM-DD',
    20,
    'system'
  ),

  (
    'FREQUENCY_SHARED_CODES_FORMAT',
    'Frequency Shared Codes Format',
    'frequency_shared_codes must be comma-delimited without spaces (e.g., "D0120,D0140,D0150")',
    'format',
    'procedure_details_mapper',
    'frequency_shared_codes',
    'format_validation',
    '{"regex": "^[A-Z0-9]+(,[A-Z0-9]+)*$", "delimiter": ",", "noSpaces": true}',
    'frequency_shared_codes must be comma-delimited WITHOUT spaces (e.g., "D0120,D0140,D0150")',
    'warning',
    ARRAY['D0120,D0140,D0150', 'D1110,D1120', ''],
    ARRAY['"D0120, D0140, D0150"', '"D0120 D0140"', '["D0120","D0140"]'],
    'Remove all spaces and use comma delimiter only. Join array with commas if needed.',
    30,
    'system'
  ),

  -- Required reasoning rules
  (
    'TREATMENT_HISTORY_REASONING_MIN_LENGTH',
    'Treatment History Reasoning Minimum Length',
    'Each treatment history record must have extraction_reasoning with at least 20 characters',
    'required_field',
    'treatment_history_mapper',
    'extraction_reasoning',
    'required_reasoning',
    '{"minLength": 20, "required": true}',
    'extraction_reasoning must be at least 20 characters and explain WHY this record was extracted',
    'critical',
    ARRAY[
      'Found complete procedure record with date, code, and description in procedures.history[0]',
      'Extracted D1110 prophylaxis performed on 2024-10-15 from treatment history array'
    ],
    ARRAY['Found it', 'N/A', '', 'Extracted from data'],
    'Provide detailed reasoning explaining: 1) What data was found, 2) Where it was found (JSON path), 3) Why you believe it is correct',
    10,
    'system'
  ),

  (
    'PROCEDURE_DETAILS_REASONING_MIN_LENGTH',
    'Procedure Details Reasoning Minimum Length',
    'Each procedure detail must have extraction_reasoning with at least 20 characters',
    'required_field',
    'procedure_details_mapper',
    'extraction_reasoning',
    'required_reasoning',
    '{"minLength": 20, "required": true}',
    'extraction_reasoning must be at least 20 characters and explain extraction logic',
    'critical',
    ARRAY[
      'Extracted coverage for D0120 from benefits.procedures[5] showing 100% in-network coverage',
      'Found limitation "Limited to 2 per 12 months" in procedure benefits for D1110'
    ],
    ARRAY['Found', 'Extracted', '', 'See data'],
    'Explain: 1) Procedure code and description, 2) Source JSON path, 3) Key fields extracted (coverage %, limitations)',
    10,
    'system'
  ),

  -- Required source path rules
  (
    'SOURCE_PATH_REQUIRED',
    'Source Path Required For All Extractions',
    'Every extracted field must include source_path showing exact JSON location',
    'required_field',
    NULL, -- All mappers
    'source_path',
    'required_reasoning',
    '{"required": true, "minLength": 1, "cannotBe": ["unknown", "N/A", ""]}',
    'source_path is REQUIRED and must show actual JSON path (cannot be "unknown" or empty)',
    'critical',
    ARRAY['patient.firstName', 'plan.benefits.preventive.coverage', 'procedures.history[0].date'],
    ARRAY['unknown', 'N/A', '', 'from data', 'in the JSON'],
    'Provide exact JSON path from flattened data. Use format: "parent.child.field" or "array[index].field"',
    10,
    'system'
  ),

  -- Business logic rules
  (
    'DENTAL_CODE_FORMAT',
    'Dental Procedure Codes Must Match D#### Format',
    'Dental procedure codes must be in format D#### (e.g., D0120, D1110)',
    'business_logic',
    'procedure_details_mapper',
    'code',
    'format_validation',
    '{"regex": "^D\\d{4}$", "normalize": true}',
    'Dental codes must match format D####. Normalize codes like "120" to "D0120"',
    'warning',
    ARRAY['D0120', 'D1110', 'D2740'],
    ARRAY['120', '0120', 'd0120', 'CDT-120'],
    'Normalize codes: Add "D" prefix if missing, pad with zeros to 4 digits (e.g., 120 → D0120)',
    40,
    'system'
  )
ON CONFLICT (rule_code) DO NOTHING;

-- Create a view for active rules by context
CREATE OR REPLACE VIEW active_business_rules AS
SELECT
  id,
  rule_code,
  rule_name,
  rule_description,
  rule_category,
  applies_to_mapper,
  applies_to_field,
  rule_type,
  validation_expression,
  error_message,
  severity,
  correct_examples,
  incorrect_examples,
  remediation_guidance,
  priority
FROM business_rules
WHERE is_active = TRUE
ORDER BY priority ASC, created_at DESC;

COMMENT ON TABLE business_rules IS 'Dynamic business rules for mapper validation and LLM guidance';
COMMENT ON COLUMN business_rules.rule_code IS 'Unique identifier for the rule (e.g., MISSING_TOOTH_CLAUSE_BOOLEAN)';
COMMENT ON COLUMN business_rules.validation_expression IS 'JSONB definition of validation logic (regex, type, min/max, etc.)';
COMMENT ON COLUMN business_rules.severity IS 'Impact level: critical (must fix), warning (should fix), info (nice to have)';
