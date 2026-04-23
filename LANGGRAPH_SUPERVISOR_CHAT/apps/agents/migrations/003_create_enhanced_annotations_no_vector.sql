-- Migration 003: Create enhanced annotations table for Label Studio integration (NO VECTOR VERSION)
-- This is a fallback version for systems without pgvector extension

-- Create enhanced_annotations table
CREATE TABLE IF NOT EXISTS enhanced_annotations (
  id SERIAL PRIMARY KEY,

  -- Core identification
  verification_id VARCHAR(255) NOT NULL,
  mapper VARCHAR(100) NOT NULL,
  field VARCHAR(100) NOT NULL,

  -- Basic extraction data (existing fields)
  ai_value TEXT,
  human_value TEXT,
  source_path TEXT,
  correct_path TEXT,
  human_reasoning TEXT,

  -- Path extraction quality
  path_quality VARCHAR(20) NOT NULL CHECK (path_quality IN ('correct', 'incorrect', 'partial', 'ambiguous')),
  path_reasoning TEXT,
  alternative_paths TEXT[],

  -- Value extraction quality
  value_quality VARCHAR(20) NOT NULL CHECK (value_quality IN ('exact', 'format_issue', 'type_issue', 'incorrect')),
  format_correction TEXT,

  -- Search strategy evaluation
  search_terms_used TEXT[],
  search_effectiveness VARCHAR(20) CHECK (search_effectiveness IN ('effective', 'suboptimal', 'ineffective')),
  better_search_terms TEXT[],
  tool_usage_pattern TEXT[],

  -- Confidence calibration
  ai_confidence DECIMAL(3,2),
  human_confidence INTEGER CHECK (human_confidence BETWEEN 1 AND 5),
  confidence_gap DECIMAL(3,2),

  -- Portal-specific context
  portal_quirks TEXT[],
  portal_notes TEXT,
  portal_type VARCHAR(50),
  office_id VARCHAR(50),

  -- Reasoning quality assessment
  reasoning_quality VARCHAR(20) CHECK (reasoning_quality IN ('excellent', 'good', 'flawed', 'incorrect')),
  reasoning_feedback TEXT,

  -- Edge case documentation
  is_edge_case BOOLEAN DEFAULT FALSE,
  edge_case_description TEXT,

  -- Performance metrics
  tool_calls_count INTEGER,
  extraction_time_ms INTEGER,
  token_cost DECIMAL(10,6),

  -- Label Studio metadata
  label_studio_task_id VARCHAR(255),
  label_studio_annotation_id VARCHAR(255),
  annotator_id VARCHAR(255) NOT NULL,
  annotation_time_seconds INTEGER,

  -- Provider context
  provider VARCHAR(100),

  -- Embedding stored as TEXT (fallback when pgvector not available)
  embedding_text TEXT,

  -- Audit timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_annotation UNIQUE (verification_id, mapper, field, label_studio_annotation_id)
);

-- Create indexes (same as vector version, minus vector index)
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_mapper ON enhanced_annotations(mapper);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_field ON enhanced_annotations(field);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_portal ON enhanced_annotations(office_id, portal_type);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_path_quality ON enhanced_annotations(path_quality);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_search_effectiveness ON enhanced_annotations(search_effectiveness);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_provider ON enhanced_annotations(provider);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_verification ON enhanced_annotations(verification_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_edge_cases ON enhanced_annotations(is_edge_case) WHERE is_edge_case = TRUE;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_enhanced_annotations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_enhanced_annotations_updated_at
BEFORE UPDATE ON enhanced_annotations
FOR EACH ROW
EXECUTE FUNCTION update_enhanced_annotations_updated_at();

-- Create views (same as vector version)
CREATE OR REPLACE VIEW enhanced_annotations_rag AS
SELECT
  id, verification_id, mapper, field, provider, office_id, portal_type,
  path_quality, source_path, correct_path, path_reasoning, alternative_paths,
  search_effectiveness, better_search_terms,
  portal_quirks, portal_notes,
  is_edge_case, edge_case_description,
  ai_confidence, human_confidence,
  created_at, annotator_id
FROM enhanced_annotations
WHERE path_quality = 'correct'
   OR search_effectiveness = 'effective'
   OR is_edge_case = TRUE;

-- Create materialized view for analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS enhanced_annotations_stats AS
SELECT
  mapper, field, provider, portal_type, office_id,
  COUNT(*) as total_annotations,
  COUNT(*) FILTER (WHERE path_quality = 'correct') as correct_paths,
  COUNT(*) FILTER (WHERE path_quality = 'incorrect') as incorrect_paths,
  COUNT(*) FILTER (WHERE path_quality = 'partial') as partial_paths,
  COUNT(*) FILTER (WHERE path_quality = 'ambiguous') as ambiguous_paths,
  COUNT(*) FILTER (WHERE value_quality = 'exact') as exact_values,
  COUNT(*) FILTER (WHERE value_quality = 'format_issue') as format_issues,
  COUNT(*) FILTER (WHERE value_quality = 'type_issue') as type_issues,
  COUNT(*) FILTER (WHERE value_quality = 'incorrect') as incorrect_values,
  COUNT(*) FILTER (WHERE search_effectiveness = 'effective') as effective_searches,
  COUNT(*) FILTER (WHERE search_effectiveness = 'suboptimal') as suboptimal_searches,
  COUNT(*) FILTER (WHERE search_effectiveness = 'ineffective') as ineffective_searches,
  AVG(tool_calls_count) as avg_tool_calls,
  AVG(extraction_time_ms) as avg_extraction_time_ms,
  AVG(token_cost) as avg_token_cost,
  AVG(ai_confidence) as avg_ai_confidence,
  AVG(human_confidence) as avg_human_confidence,
  AVG(confidence_gap) as avg_confidence_gap,
  COUNT(*) FILTER (WHERE is_edge_case = TRUE) as edge_case_count,
  MAX(created_at) as last_annotation_date
FROM enhanced_annotations
GROUP BY mapper, field, provider, portal_type, office_id;

CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_stats_mapper ON enhanced_annotations_stats(mapper);
CREATE INDEX IF NOT EXISTS idx_enhanced_annotations_stats_portal ON enhanced_annotations_stats(office_id, portal_type);

COMMENT ON TABLE enhanced_annotations IS 'Enhanced annotation data from Label Studio for JSON path extraction quality assessment (NO VECTOR VERSION)';
