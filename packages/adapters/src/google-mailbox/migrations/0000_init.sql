CREATE TABLE IF NOT EXISTS google_mailbox_sync_state (
  id TEXT NOT NULL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  history_id TEXT,
  page_token TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(source_id)
);
