-- Add per-grant OAuth client credentials so refresh_token exchange uses the
-- same client that obtained the grant (instead of falling back to env vars or
-- a placeholder test client). Both columns are nullable for backward compat
-- with grants created before v1.1.
ALTER TABLE grants ADD COLUMN client_id_ref TEXT;
ALTER TABLE grants ADD COLUMN client_secret_ref TEXT;
