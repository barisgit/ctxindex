CREATE TABLE IF NOT EXISTS local_directory_file_state (
  source_id TEXT NOT NULL REFERENCES sources(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  relative_path TEXT NOT NULL,
  content_hash TEXT,
  mtime_ms INTEGER,
  size_bytes INTEGER,
  detected_mime TEXT,
  skipped_reason TEXT,
  PRIMARY KEY (source_id, relative_path)
);
