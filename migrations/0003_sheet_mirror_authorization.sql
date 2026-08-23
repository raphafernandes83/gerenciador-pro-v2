PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sheet_mirror_authorizations (
  submission_id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (submission_id) REFERENCES leads(submission_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sheet_mirror_authorizations_created
  ON sheet_mirror_authorizations (created_at);
