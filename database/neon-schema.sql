-- SnapDoc AI metadata-only telemetry schema for Neon PostgreSQL.
-- Never store scanned images, PDF bytes, or extracted OCR text here.
CREATE TABLE IF NOT EXISTS scan_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 250),
  filter_used VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scan_events_created_at_idx ON scan_events (created_at DESC);
