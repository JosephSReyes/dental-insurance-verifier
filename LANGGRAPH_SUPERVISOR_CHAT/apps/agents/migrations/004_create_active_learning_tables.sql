/**
 * Migration: Active Learning Tables
 *
 * Tables to support active learning and auto-sync functionality
 */

-- Table to track Label Studio sync status
CREATE TABLE IF NOT EXISTS label_studio_tasks (
  id SERIAL PRIMARY KEY,
  verification_id VARCHAR(255) NOT NULL UNIQUE,
  task_id INTEGER,
  synced_at TIMESTAMP DEFAULT NOW(),
  sync_reason VARCHAR(50) DEFAULT 'manual',  -- 'manual', 'active_learning', 'batch'
  priority VARCHAR(20),                       -- 'critical', 'high', 'medium', 'low'
  uncertainty_score DECIMAL(5, 2),
  annotation_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'completed', 'skipped'
  completed_at TIMESTAMP,
  annotator_id VARCHAR(255),
  CONSTRAINT fk_verification
    FOREIGN KEY (verification_id)
    REFERENCES verifications(verification_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_label_studio_tasks_verification_id ON label_studio_tasks(verification_id);
CREATE INDEX idx_label_studio_tasks_sync_reason ON label_studio_tasks(sync_reason);
CREATE INDEX idx_label_studio_tasks_priority ON label_studio_tasks(priority);
CREATE INDEX idx_label_studio_tasks_annotation_status ON label_studio_tasks(annotation_status);

-- Table to track disagreement between different extraction strategies
CREATE TABLE IF NOT EXISTS extraction_disagreements (
  id SERIAL PRIMARY KEY,
  verification_id VARCHAR(255) NOT NULL,
  field VARCHAR(100) NOT NULL,
  mapper VARCHAR(100) NOT NULL,
  strategy_a_value TEXT,
  strategy_b_value TEXT,
  strategy_a_confidence DECIMAL(5, 4),
  strategy_b_confidence DECIMAL(5, 4),
  disagreement_score DECIMAL(5, 4),  -- 0-1: How different are they
  resolution_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'resolved', 'ignored'
  resolved_value TEXT,
  resolved_by VARCHAR(255),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(verification_id, field, mapper)
);

CREATE INDEX idx_extraction_disagreements_verification_id ON extraction_disagreements(verification_id);
CREATE INDEX idx_extraction_disagreements_resolution_status ON extraction_disagreements(resolution_status);

-- Table to track active learning performance over time
CREATE TABLE IF NOT EXISTS active_learning_metrics (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  verifications_scored INTEGER DEFAULT 0,
  high_priority_count INTEGER DEFAULT 0,
  auto_synced_count INTEGER DEFAULT 0,
  annotations_completed INTEGER DEFAULT 0,
  avg_uncertainty_score DECIMAL(5, 2),
  accuracy_improvement DECIMAL(5, 4),  -- Change in accuracy from baseline
  annotation_efficiency DECIMAL(5, 4), -- Learning per annotation
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date)
);

CREATE INDEX idx_active_learning_metrics_date ON active_learning_metrics(date);

-- Table to store auto-sync configuration
CREATE TABLE IF NOT EXISTS active_learning_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(255)
);

-- Insert default configuration
INSERT INTO active_learning_config (config_key, config_value, updated_by)
VALUES
  ('enabled', 'true', 'system'),
  ('min_score', '60', 'system'),
  ('max_per_run', '10', 'system'),
  ('priority_threshold', 'high', 'system'),
  ('sync_interval_minutes', '30', 'system')
ON CONFLICT (config_key) DO NOTHING;

-- View to get priority queue with verification details
CREATE OR REPLACE VIEW priority_queue_view AS
SELECT
  v.verification_id,
  v.mapper,
  v.field,
  v.extracted_value,
  v.confidence,
  v.portal_type,
  v.office_id,
  v.created_at,
  lst.synced_at,
  lst.priority,
  lst.uncertainty_score,
  lst.annotation_status,
  COALESCE(lst.annotation_status, 'not_synced') as current_status
FROM verifications v
LEFT JOIN label_studio_tasks lst
  ON v.verification_id = lst.verification_id
WHERE v.created_at >= NOW() - INTERVAL '30 days'
ORDER BY lst.uncertainty_score DESC NULLS LAST, v.created_at DESC;

COMMENT ON TABLE label_studio_tasks IS 'Tracks which verifications have been synced to Label Studio';
COMMENT ON TABLE extraction_disagreements IS 'Records when different extraction strategies produce conflicting results';
COMMENT ON TABLE active_learning_metrics IS 'Daily metrics for active learning performance';
COMMENT ON TABLE active_learning_config IS 'Configuration settings for active learning auto-sync';
