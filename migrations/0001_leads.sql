PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL UNIQUE,
  tipo_interesse TEXT NOT NULL CHECK (tipo_interesse IN ('comprar', 'revender')),
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  whatsapp_norm TEXT NOT NULL,
  email TEXT,
  email_norm TEXT,
  pais TEXT NOT NULL,
  consentimento INTEGER NOT NULL CHECK (consentimento IN (0, 1)),
  canal_divulgacao TEXT,
  link_canal TEXT,
  observacao TEXT,
  origem TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  pagina_url TEXT,
  user_agent TEXT,
  enviado_em_local TEXT,
  payload_json TEXT NOT NULL,
  sheet_sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sheet_sync_status IN ('pending', 'synced', 'retry', 'failed')),
  sheet_sync_attempts INTEGER NOT NULL DEFAULT 0,
  sheet_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_leads_interest_whatsapp
  ON leads(tipo_interesse, whatsapp_norm);

CREATE UNIQUE INDEX IF NOT EXISTS ux_leads_interest_email
  ON leads(tipo_interesse, email_norm)
  WHERE email_norm IS NOT NULL AND email_norm <> '';

CREATE INDEX IF NOT EXISTS ix_leads_created_at
  ON leads(created_at DESC);

CREATE INDEX IF NOT EXISTS ix_leads_sheet_sync
  ON leads(sheet_sync_status, created_at);

CREATE TABLE IF NOT EXISTS system_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  submission_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ix_system_events_created_at
  ON system_events(created_at DESC);
