-- Initialize pgvector extension
-- This script runs first (00_) before other migration scripts

CREATE EXTENSION IF NOT EXISTS vector;

-- Verify the extension is installed
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
