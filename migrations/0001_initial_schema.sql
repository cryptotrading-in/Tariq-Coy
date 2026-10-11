PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  force_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  rank TEXT NOT NULL CHECK (rank IN ('DD', 'AD', 'INSP', 'SI', 'ASI', 'SGT', 'CPL')),
  name TEXT NOT NULL,
  father_name TEXT,
  date_of_birth TEXT,
  education TEXT,
  religion TEXT,
  caste TEXT,
  joining_date TEXT,
  current_rank_date TEXT,
  fsd_joining_date TEXT,
  blood_group TEXT,
  mobile_no TEXT,
  emergency_no TEXT,
  marital_status TEXT,
  no_of_children INTEGER CHECK (no_of_children IS NULL OR no_of_children >= 0),
  spouse_no TEXT,
  courses TEXT,
  present_address TEXT,
  permanent_address TEXT,
  domicile TEXT,
  cnic TEXT,
  tariq_coy_joining_date TEXT,
  living_status TEXT NOT NULL DEFAULT 'UNSET' CHECK (living_status IN ('IN', 'OUT', 'UNSET')),
  driving_license TEXT NOT NULL DEFAULT 'No' CHECK (driving_license IN ('Yes', 'No')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_employees_rank_force ON employees(rank, force_no);
CREATE INDEX IF NOT EXISTS idx_employees_living_status ON employees(living_status);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active);

CREATE TABLE IF NOT EXISTS leave_records (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('C/Leave', 'E/Leave', 'Medical')),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 0 CHECK (days >= 0),
  balance TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS idx_leave_employee_dates ON leave_records(employee_id, from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_leave_type_dates ON leave_records(leave_type, from_date, to_date);

CREATE TABLE IF NOT EXISTS contribution_rates (
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(rank, living_status, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_contribution_rates_effective ON contribution_rates(effective_from, rank, living_status);

CREATE TABLE IF NOT EXISTS monthly_collections (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  month_key TEXT NOT NULL,
  welfare REAL NOT NULL DEFAULT 0 CHECK (welfare >= 0),
  mod_amount REAL NOT NULL DEFAULT 0 CHECK (mod_amount >= 0),
  med REAL NOT NULL DEFAULT 0 CHECK (med >= 0),
  barber REAL NOT NULL DEFAULT 0 CHECK (barber >= 0),
  waiter REAL NOT NULL DEFAULT 0 CHECK (waiter >= 0),
  wman REAL NOT NULL DEFAULT 0 CHECK (wman >= 0),
  contribution_total REAL NOT NULL DEFAULT 0 CHECK (contribution_total >= 0),
  living_status_snapshot TEXT NOT NULL CHECK (living_status_snapshot IN ('IN', 'OUT')),
  rank_snapshot TEXT NOT NULL CHECK (rank_snapshot IN ('DD', 'AD', 'INSP', 'SI', 'ASI', 'SGT', 'CPL')),
  mess_base REAL NOT NULL DEFAULT 7000 CHECK (mess_base >= 0),
  leave_days REAL NOT NULL DEFAULT 0 CHECK (leave_days >= 0),
  leave_deduction REAL NOT NULL DEFAULT 0 CHECK (leave_deduction >= 0),
  leave_deduction_mode TEXT NOT NULL DEFAULT 'automatic' CHECK (leave_deduction_mode IN ('automatic', 'manual')),
  mess_amount REAL NOT NULL DEFAULT 0 CHECK (mess_amount >= 0),
  total_due REAL NOT NULL DEFAULT 0 CHECK (total_due >= 0),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID')),
  payment_date TEXT,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('Cash', 'Bank Transfer', 'Other')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(employee_id, month_key)
);
CREATE INDEX IF NOT EXISTS idx_collections_month ON monthly_collections(month_key);
CREATE INDEX IF NOT EXISTS idx_collections_employee_month ON monthly_collections(employee_id, month_key);
CREATE INDEX IF NOT EXISTS idx_collections_status_month ON monthly_collections(payment_status, month_key);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL UNIQUE REFERENCES monthly_collections(id) ON DELETE RESTRICT,
  amount REAL NOT NULL CHECK (amount >= 0),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Other')),
  received_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
