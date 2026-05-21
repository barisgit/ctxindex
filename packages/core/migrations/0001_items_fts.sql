-- FTS5 virtual tables for items and chunks
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  item_id UNINDEXED,
  title,
  summary,
  path,
  metadata_text,
  content='',
  contentless_delete=1
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED,
  item_id UNINDEXED,
  content,
  content='',
  contentless_delete=1
);

-- Triggers to keep items_fts in sync with items
CREATE TRIGGER IF NOT EXISTS items_fts_insert
  AFTER INSERT ON items
BEGIN
  INSERT INTO items_fts(item_id, title, summary, path, metadata_text)
  VALUES (new.id, new.title, new.summary, NULL, NULL);
END;

CREATE TRIGGER IF NOT EXISTS items_fts_update
  AFTER UPDATE ON items
BEGIN
  INSERT INTO items_fts(items_fts, item_id, title, summary, path, metadata_text)
  VALUES ('delete', old.id, old.title, old.summary, NULL, NULL);
  INSERT INTO items_fts(item_id, title, summary, path, metadata_text)
  VALUES (new.id, new.title, new.summary, NULL, NULL);
END;

CREATE TRIGGER IF NOT EXISTS items_fts_delete
  AFTER DELETE ON items
BEGIN
  INSERT INTO items_fts(items_fts, item_id, title, summary, path, metadata_text)
  VALUES ('delete', old.id, old.title, old.summary, NULL, NULL);
END;

-- Triggers to keep chunks_fts in sync with item_chunks
CREATE TRIGGER IF NOT EXISTS chunks_fts_insert
  AFTER INSERT ON item_chunks
BEGIN
  INSERT INTO chunks_fts(chunk_id, item_id, content)
  VALUES (new.id, new.item_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_update
  AFTER UPDATE ON item_chunks
BEGIN
  INSERT INTO chunks_fts(chunks_fts, chunk_id, item_id, content)
  VALUES ('delete', old.id, old.item_id, old.content);
  INSERT INTO chunks_fts(chunk_id, item_id, content)
  VALUES (new.id, new.item_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_delete
  AFTER DELETE ON item_chunks
BEGIN
  INSERT INTO chunks_fts(chunks_fts, chunk_id, item_id, content)
  VALUES ('delete', old.id, old.item_id, old.content);
END;
