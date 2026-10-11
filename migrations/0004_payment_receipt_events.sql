-- Preserve every receipt and reversal as an append-only audit trail.
-- Existing collection and payment rows are retained.
CREATE TABLE IF NOT EXISTS payment_receipt_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('RECEIVED', 'REVERSED')),
  collection_id TEXT NOT NULL REFERENCES monthly_collections(id) ON DELETE RESTRICT,
  receipt_id TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  month_key TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  payment_date TEXT,
  payment_method TEXT CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Other')),
  reason TEXT NOT NULL DEFAULT '',
  acted_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_receipt_events_collection ON payment_receipt_events(collection_id, created_at);
CREATE INDEX IF NOT EXISTS idx_receipt_events_receipt ON payment_receipt_events(receipt_id, event_type);

-- Seed an audit event for each receipt that was already paid before this migration.
INSERT INTO payment_receipt_events
  (id, event_type, collection_id, receipt_id, employee_id, month_key, amount, payment_date, payment_method, reason, acted_by, created_at)
SELECT
  'legacy-' || p.id, 'RECEIVED', c.id, p.id, c.employee_id, c.month_key, p.amount,
  p.payment_date, p.payment_method, 'Legacy receipt recorded before reversal audit was enabled.',
  p.received_by, p.created_at
FROM payments p
JOIN monthly_collections c ON c.id = p.collection_id
WHERE c.payment_status = 'PAID'
  AND NOT EXISTS (
    SELECT 1 FROM payment_receipt_events e
    WHERE e.receipt_id = p.id AND e.event_type = 'RECEIVED'
  );
