-- Realms
CREATE TABLE IF NOT EXISTS realms (
  id TEXT NOT NULL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT NOT NULL PRIMARY KEY,
  realm_id TEXT NOT NULL REFERENCES realms(id),
  provider TEXT NOT NULL,
  display_name TEXT,
  email TEXT,
  created_at INTEGER NOT NULL
);

-- Account identities
CREATE TABLE IF NOT EXISTS account_identities (
  id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Grants (OAuth tokens)
CREATE TABLE IF NOT EXISTS grants (
  id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  provider TEXT NOT NULL,
  scopes TEXT NOT NULL,
  access_token_ref TEXT,
  refresh_token_ref TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sources
CREATE TABLE IF NOT EXISTS sources (
  id TEXT NOT NULL PRIMARY KEY,
  realm_id TEXT NOT NULL REFERENCES realms(id),
  adapter_id TEXT NOT NULL,
  display_name TEXT,
  config_json TEXT,
  created_at INTEGER NOT NULL
);

-- Source sync state
CREATE TABLE IF NOT EXISTS source_sync_state (
  source_id TEXT NOT NULL PRIMARY KEY REFERENCES sources(id),
  last_status TEXT NOT NULL DEFAULT 'pending',
  last_run_id TEXT,
  cursor_json TEXT,
  updated_at INTEGER NOT NULL
);

-- Sync runs
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT NOT NULL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  realm_id TEXT NOT NULL REFERENCES realms(id),
  mode TEXT NOT NULL DEFAULT 'sync',
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  released_at INTEGER,
  items_added INTEGER NOT NULL DEFAULT 0,
  items_updated INTEGER NOT NULL DEFAULT 0,
  items_deleted INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  error_json TEXT
);

-- Sync run checkpoints
CREATE TABLE IF NOT EXISTS sync_run_checkpoints (
  id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES sync_runs(id),
  cursor_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);

-- Sync locks
CREATE TABLE IF NOT EXISTS sync_locks (
  scope TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES sync_runs(id),
  pid INTEGER,
  acquired_at INTEGER NOT NULL,
  released_at INTEGER
);

-- Items
CREATE TABLE IF NOT EXISTS items (
  id TEXT NOT NULL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  realm_id TEXT NOT NULL REFERENCES realms(id),
  adapter_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  title TEXT,
  author TEXT,
  content_hash TEXT,
  byte_size INTEGER,
  language TEXT,
  indexed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  metadata_json TEXT
);

-- External refs
CREATE TABLE IF NOT EXISTS external_refs (
  id TEXT NOT NULL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Item chunks
CREATE TABLE IF NOT EXISTS item_chunks (
  id TEXT NOT NULL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  byte_size INTEGER,
  created_at INTEGER NOT NULL
);

-- Item relations
CREATE TABLE IF NOT EXISTS item_relations (
  id TEXT NOT NULL PRIMARY KEY,
  from_item_id TEXT NOT NULL REFERENCES items(id),
  to_item_id TEXT NOT NULL REFERENCES items(id),
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Tombstones
CREATE TABLE IF NOT EXISTS tombstones (
  id TEXT NOT NULL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  deleted_at INTEGER NOT NULL,
  reason TEXT
);

-- Raw records
CREATE TABLE IF NOT EXISTS raw_records (
  id TEXT NOT NULL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

-- Mail messages
CREATE TABLE IF NOT EXISTS mail_messages (
  id TEXT NOT NULL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  message_id TEXT,
  thread_id TEXT,
  subject TEXT,
  from_address TEXT,
  to_addresses TEXT,
  cc_addresses TEXT,
  date INTEGER,
  snippet TEXT,
  label_ids TEXT,
  created_at INTEGER NOT NULL
);

-- Mail bodies
CREATE TABLE IF NOT EXISTS mail_bodies (
  id TEXT NOT NULL PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES mail_messages(id),
  mime_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Mail attachments
CREATE TABLE IF NOT EXISTS mail_attachments (
  id TEXT NOT NULL PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES mail_messages(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER,
  attachment_id TEXT,
  created_at INTEGER NOT NULL
);

-- FTS5 virtual tables
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  title,
  content,
  content=items,
  content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  content=item_chunks,
  content_rowid=rowid
);

-- FTS5 triggers for items
CREATE TRIGGER IF NOT EXISTS items_fts_insert
  AFTER INSERT ON items
BEGIN
  INSERT INTO items_fts(rowid, title, content) VALUES (new.rowid, new.title, '');
END;

CREATE TRIGGER IF NOT EXISTS items_fts_update
  AFTER UPDATE ON items
BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, '');
  INSERT INTO items_fts(rowid, title, content) VALUES (new.rowid, new.title, '');
END;

CREATE TRIGGER IF NOT EXISTS items_fts_delete
  AFTER DELETE ON items
BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, '');
END;

-- FTS5 triggers for chunks
CREATE TRIGGER IF NOT EXISTS chunks_fts_insert
  AFTER INSERT ON item_chunks
BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_update
  AFTER UPDATE ON item_chunks
BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_delete
  AFTER DELETE ON item_chunks
BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

-- Seed global realm
INSERT OR IGNORE INTO realms (id, slug, is_default, created_at)
  VALUES ('global', 'global', 1, 0);
