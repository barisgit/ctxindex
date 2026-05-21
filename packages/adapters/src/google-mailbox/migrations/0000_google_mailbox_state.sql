-- google.mailbox adapter state (gmail-specific columns beyond core mail_messages)
CREATE TABLE IF NOT EXISTS google_mailbox_sync_state (
  source_id TEXT NOT NULL PRIMARY KEY REFERENCES sources(id),
  history_id TEXT,
  updated_at INTEGER NOT NULL
);
