-- Create feedback_corrections table for RAG system (without pgvector)
CREATE TABLE IF NOT EXISTS feedback_corrections (
    id SERIAL PRIMARY KEY,
    verification_id VARCHAR(255) NOT NULL,
    mapper VARCHAR(100) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    field VARCHAR(100) NOT NULL,
    ai_value TEXT,
    human_value TEXT,
    source_path TEXT,
    correct_path TEXT,
    human_reasoning TEXT,
    reviewer_id VARCHAR(100),
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    embedding TEXT,  -- Store as JSON array string instead of vector type
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_feedback_mapper ON feedback_corrections(mapper);
CREATE INDEX IF NOT EXISTS idx_feedback_provider ON feedback_corrections(provider);
CREATE INDEX IF NOT EXISTS idx_feedback_field ON feedback_corrections(field);
CREATE INDEX IF NOT EXISTS idx_feedback_mapper_provider ON feedback_corrections(mapper, provider);
CREATE INDEX IF NOT EXISTS idx_feedback_mapper_provider_field ON feedback_corrections(mapper, provider, field);
CREATE INDEX IF NOT EXISTS idx_feedback_reviewed_at ON feedback_corrections(reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_metadata ON feedback_corrections USING GIN(metadata);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_feedback_corrections_updated_at 
    BEFORE UPDATE ON feedback_corrections 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create view for easy querying with metadata
CREATE OR REPLACE VIEW feedback_corrections_enriched AS
SELECT 
    fc.*,
    fc.metadata->>'patient_name' as patient_name,
    fc.metadata->>'verification_date' as verification_date,
    fc.metadata->>'office_id' as office_id
FROM feedback_corrections fc;
