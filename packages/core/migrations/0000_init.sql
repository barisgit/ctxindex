CREATE TABLE realms (
  id TEXT NOT NULL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE accounts (
  id TEXT NOT NULL PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT,
  external_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE account_identities (
  id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(account_id, kind, value)
);

CREATE TABLE grants (
  id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  client_id_ref TEXT,
  client_secret_ref TEXT,
  access_token_ref TEXT,
  refresh_token_ref TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sources (
  id TEXT NOT NULL PRIMARY KEY,
  realm_id TEXT NOT NULL REFERENCES realms(id),
  adapter_id TEXT NOT NULL,
  adapter_version INTEGER NOT NULL,
  grant_id TEXT REFERENCES grants(id),
  display_name TEXT,
  config_json TEXT NOT NULL,
  sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK(sync_enabled IN (0, 1)),
  search_routing TEXT CHECK(search_routing IN ('indexed', 'federated', 'hybrid')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE resources (
  id TEXT NOT NULL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL REFERENCES realms(id),
  profile_id TEXT NOT NULL,
  profile_version INTEGER NOT NULL,
  title TEXT,
  summary TEXT,
  occurred_at INTEGER,
  provider_updated_at INTEGER,
  deleted_at INTEGER,
  hydrated_at INTEGER,
  origin TEXT NOT NULL CHECK(origin IN ('synced', 'adhoc')),
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(source_id, ref)
);
CREATE INDEX resources_source_idx ON resources(source_id);
CREATE INDEX resources_realm_idx ON resources(realm_id);
CREATE INDEX resources_profile_idx ON resources(profile_id, profile_version);
CREATE INDEX resources_occurred_idx ON resources(occurred_at);
CREATE INDEX resources_deleted_idx ON resources(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE field_index (
  id TEXT NOT NULL PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  declared_type TEXT NOT NULL CHECK(declared_type IN ('string', 'string[]', 'number', 'number[]', 'boolean', 'boolean[]', 'datetime', 'datetime[]')),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  value_text TEXT,
  value_number REAL,
  value_integer INTEGER,
  UNIQUE(resource_id, field, ordinal),
  CHECK(
    (declared_type IN ('string', 'string[]') AND value_text IS NOT NULL AND value_number IS NULL AND value_integer IS NULL) OR
    (declared_type IN ('number', 'number[]') AND value_text IS NULL AND value_number IS NOT NULL AND value_integer IS NULL) OR
    (declared_type IN ('boolean', 'boolean[]', 'datetime', 'datetime[]') AND value_text IS NULL AND value_number IS NULL AND value_integer IS NOT NULL)
  ),
  CHECK(declared_type NOT IN ('boolean', 'boolean[]') OR value_integer IN (0, 1))
);
CREATE INDEX field_index_text_idx ON field_index(field, value_text) WHERE value_text IS NOT NULL;
CREATE INDEX field_index_number_idx ON field_index(field, value_number) WHERE value_number IS NOT NULL;
CREATE INDEX field_index_integer_idx ON field_index(field, value_integer) WHERE value_integer IS NOT NULL;

CREATE TABLE chunks (
  id TEXT NOT NULL PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(resource_id, chunk_index)
);

CREATE TABLE relations (
  id TEXT NOT NULL PRIMARY KEY,
  source_resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  target_ref TEXT,
  target_field TEXT,
  target_value TEXT,
  created_at INTEGER NOT NULL,
  CHECK(
    (target_ref IS NOT NULL AND target_field IS NULL AND target_value IS NULL) OR
    (target_ref IS NULL AND target_field IS NOT NULL AND target_value IS NOT NULL)
  )
);
CREATE INDEX relations_source_idx ON relations(source_resource_id, relation);
CREATE INDEX relations_ref_idx ON relations(target_ref) WHERE target_ref IS NOT NULL;
CREATE INDEX relations_natural_key_idx ON relations(target_field, target_value) WHERE target_field IS NOT NULL;

CREATE TABLE relation_resolutions (
  relation_id TEXT NOT NULL REFERENCES relations(id) ON DELETE CASCADE,
  target_resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  resolved_at INTEGER NOT NULL,
  PRIMARY KEY(relation_id, target_resource_id)
);
CREATE INDEX relation_resolutions_target_idx ON relation_resolutions(target_resource_id, relation_id);

CREATE TABLE artifacts (
  id TEXT NOT NULL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  origin_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  retention_class TEXT NOT NULL CHECK(retention_class = 'cached'),
  local_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX artifacts_content_hash_idx ON artifacts(content_hash);

CREATE TABLE source_sync_state (
  source_id TEXT NOT NULL PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
    last_status TEXT NOT NULL DEFAULT 'pending' CHECK(last_status IN ('pending', 'idle', 'needs_auth', 'failed', 'disabled')),
  last_run_id TEXT,
  cursor_json TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sync_runs (
  id TEXT NOT NULL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL REFERENCES realms(id),
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  cursor_before_json TEXT,
  cursor_after_json TEXT,
  resources_added INTEGER NOT NULL DEFAULT 0,
  resources_updated INTEGER NOT NULL DEFAULT 0,
  resources_deleted INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT
);

CREATE TABLE sync_run_checkpoints (
  id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  cursor_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE TABLE sync_locks (
  scope TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  owner_pid INTEGER,
  acquired_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE resources_fts USING fts5(
  title,
  summary,
  content=resources,
  content_rowid=rowid
);
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content=chunks,
  content_rowid=rowid
);

CREATE TRIGGER resources_fts_insert AFTER INSERT ON resources BEGIN
  INSERT INTO resources_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);
END;
CREATE TRIGGER resources_fts_update AFTER UPDATE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, title, summary)
    VALUES ('delete', old.rowid, old.title, old.summary);
  INSERT INTO resources_fts(rowid, title, summary)
    VALUES (new.rowid, new.title, new.summary);
END;
CREATE TRIGGER resources_fts_delete AFTER DELETE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, title, summary) VALUES ('delete', old.rowid, old.title, old.summary);
END;
CREATE TRIGGER chunks_fts_insert AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER chunks_fts_update AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER chunks_fts_delete AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
