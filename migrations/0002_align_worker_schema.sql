-- Compatibility migration: align the original D1 schema with the Worker API.
-- Existing personnel and collection records are retained.

ALTER TABLE app_users ADD COLUMN password_salt TEXT;
ALTER TABLE app_users ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
ALTER TABLE app_users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0);
ALTER TABLE app_users ADD COLUMN locked_until TEXT;
UPDATE app_users SET active = is_active;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent_hint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);

ALTER TABLE employees ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
UPDATE employees SET active = is_active;

-- Keep the legacy table's CHECK constraint intact; Worker maps API values to these stored values.
-- A new index supports leave lookups without changing existing leave records.
CREATE INDEX IF NOT EXISTS idx_leave_employee_from_date ON leave_records(employee_id, from_date DESC);

-- Rates need independent IN/OUT values. Copy every legacy rate to both statuses before
-- replacing the rank-only table; this preserves current rates and gives both statuses
-- the same starting values until an administrator changes them.
DROP INDEX IF EXISTS idx_contribution_rates_month;
ALTER TABLE contribution_rates RENAME TO contribution_rates_legacy;

CREATE TABLE contribution_rates (
  id TEXT PRIMARY KEY,
  rank TEXT NOT NULL CHECK (rank IN ('DD', 'AD', 'INSP', 'SI', 'ASI', 'SGT', 'CPL')),
  living_status TEXT NOT NULL CHECK (living_status IN ('IN', 'OUT')),
  effective_from TEXT NOT NULL,
  welfare REAL NOT NULL DEFAULT 0 CHECK (welfare >= 0),
  mod_amount REAL NOT NULL DEFAULT 0 CHECK (mod_amount >= 0),
  med REAL NOT NULL DEFAULT 0 CHECK (med >= 0),
  barber REAL NOT NULL DEFAULT 0 CHECK (barber >= 0),
  waiter REAL NOT NULL DEFAULT 0 CHECK (waiter >= 0),
  wman REAL NOT NULL DEFAULT 0 CHECK (wman >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(rank, living_status, effective_from)
);
INSERT INTO contribution_rates (id, rank, living_status, effective_from, welfare, mod_amount, med, barber, waiter, wman, created_at, updated_at)
SELECT lower(hex(randomblob(16))), rank, 'IN', effective_month || '-01', welfare, mod, med, barber, waiter, w_man, created_at, updated_at
FROM contribution_rates_legacy;
INSERT INTO contribution_rates (id, rank, living_status, effective_from, welfare, mod_amount, med, barber, waiter, wman, created_at, updated_at)
SELECT lower(hex(randomblob(16))), rank, 'OUT', effective_month || '-01', welfare, mod, med, barber, waiter, w_man, created_at, updated_at
FROM contribution_rates_legacy;
DROP TABLE contribution_rates_legacy;
CREATE INDEX IF NOT EXISTS idx_contribution_rates_effective ON contribution_rates(rank, living_status, effective_from);

-- Align collection fields with the API while retaining existing monthly records.
ALTER TABLE monthly_collections RENAME COLUMN collection_month TO month_key;
ALTER TABLE monthly_collections RENAME COLUMN net_mess TO mess_amount;
ALTER TABLE monthly_collections ADD COLUMN welfare REAL NOT NULL DEFAULT 0 CHECK (welfare >= 0);
ALTER TABLE monthly_collections ADD COLUMN mod_amount REAL NOT NULL DEFAULT 0 CHECK (mod_amount >= 0);
ALTER TABLE monthly_collections ADD COLUMN med REAL NOT NULL DEFAULT 0 CHECK (med >= 0);
ALTER TABLE monthly_collections ADD COLUMN barber REAL NOT NULL DEFAULT 0 CHECK (barber >= 0);
ALTER TABLE monthly_collections ADD COLUMN waiter REAL NOT NULL DEFAULT 0 CHECK (waiter >= 0);
ALTER TABLE monthly_collections ADD COLUMN wman REAL NOT NULL DEFAULT 0 CHECK (wman >= 0);
ALTER TABLE monthly_collections ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID'));
ALTER TABLE monthly_collections ADD COLUMN payment_date TEXT;
ALTER TABLE monthly_collections ADD COLUMN payment_method TEXT CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Other'));
UPDATE monthly_collections
SET payment_status = 'PAID',
    payment_date = (SELECT p.payment_date FROM payments p WHERE p.collection_id = monthly_collections.id),
    payment_method = (SELECT p.payment_method FROM payments p WHERE p.collection_id = monthly_collections.id)
WHERE EXISTS (SELECT 1 FROM payments p WHERE p.collection_id = monthly_collections.id);

CREATE INDEX IF NOT EXISTS idx_collections_month_key ON monthly_collections(month_key);
CREATE INDEX IF NOT EXISTS idx_collections_status_month ON monthly_collections(payment_status, month_key);
