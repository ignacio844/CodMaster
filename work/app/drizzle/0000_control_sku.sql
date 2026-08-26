CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'VIEWER',
  system TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  filename TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  matched_count INTEGER NOT NULL,
  review_count INTEGER NOT NULL,
  orphan_count INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  result_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  row_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_code TEXT NOT NULL,
  crm_code TEXT NOT NULL,
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(import_id, row_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS imports_created_idx ON imports(created_at DESC);
CREATE INDEX IF NOT EXISTS decisions_import_idx ON decisions(import_id);
