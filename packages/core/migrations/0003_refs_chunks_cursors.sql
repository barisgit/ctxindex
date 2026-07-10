-- SPEC conformance: external-ref scoping, chunk uniqueness, source-scoped
-- relations, and sync-run cursor history. All changes use ADD COLUMN /
-- CREATE INDEX so the existing FTS5 external-content tables and their triggers
-- are left intact (a table rebuild would orphan items_fts / chunks_fts).

-- SPEC §4: (item_id, chunk_index) MUST be unique.
CREATE UNIQUE INDEX IF NOT EXISTS item_chunks_item_chunk_uniq
  ON item_chunks(item_id, chunk_index);

-- SPEC §4: external identity uniqueness MUST be scoped by source + kind + value.
-- Backfill source_id from the owning item for any pre-existing rows.
ALTER TABLE external_refs ADD COLUMN source_id TEXT REFERENCES sources(id);
UPDATE external_refs
  SET source_id = (SELECT items.source_id FROM items WHERE items.id = external_refs.item_id)
  WHERE source_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS external_refs_source_kind_value_uniq
  ON external_refs(source_id, kind, value);

-- SPEC §4: item relations are scoped within a source context.
ALTER TABLE item_relations ADD COLUMN source_id TEXT REFERENCES sources(id);

-- SPEC §8: a sync run MUST record cursor-before and cursor-after.
ALTER TABLE sync_runs ADD COLUMN cursor_before_json TEXT;
ALTER TABLE sync_runs ADD COLUMN cursor_after_json TEXT;
