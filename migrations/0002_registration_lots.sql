PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS registration_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_key TEXT NOT NULL COLLATE NOCASE,
  lot_number INTEGER NOT NULL CHECK (lot_number > 0),
  label TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0 AND claimed_count <= capacity),
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency_code TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'open', 'closed')),
  display_order INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (market_key, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_registration_lots_market_state
  ON registration_lots (market_key, state, display_order, lot_number);

CREATE TABLE IF NOT EXISTS lead_lot_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL UNIQUE,
  lot_id INTEGER NOT NULL,
  price_minor_snapshot INTEGER,
  currency_code_snapshot TEXT NOT NULL,
  allocated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (submission_id) REFERENCES leads(submission_id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES registration_lots(id)
);

CREATE INDEX IF NOT EXISTS idx_lead_lot_allocations_lot
  ON lead_lot_allocations (lot_id);

CREATE TRIGGER IF NOT EXISTS trg_lot_allocation_guard
BEFORE INSERT ON lead_lot_allocations
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM registration_lots
      WHERE id = NEW.lot_id
        AND state = 'open'
        AND claimed_count < capacity
    )
    THEN RAISE(ABORT, 'lot_not_available')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_lot_allocation_claim
AFTER INSERT ON lead_lot_allocations
FOR EACH ROW
BEGIN
  UPDATE registration_lots
  SET claimed_count = claimed_count + 1,
      state = CASE
        WHEN claimed_count + 1 >= capacity THEN 'closed'
        ELSE state
      END,
      closed_at = CASE
        WHEN claimed_count + 1 >= capacity THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ELSE closed_at
      END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.lot_id;
END;
