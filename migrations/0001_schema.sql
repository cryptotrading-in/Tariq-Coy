PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_hint TEXT,
  user_agent_hint TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  force_no TEXT NOT NULL UNIQUE,
  rank TEXT NOT NULL CHECK (rank IN ('DD','AD','INSP','SI','ASI','SGT','CPL')),
  name TEXT NOT NULL,
  father_name TEXT NOT NULL DEFAULT '',
  date_of_birth TEXT,
  education TEXT NOT NULL DEFAULT '',
  religion TEXT NOT NULL DEFAULT '',
  caste TEXT NOT NULL DEFAULT '',
  joining_date TEXT,
  current_rank_date TEXT,
  fsd_joining_date TEXT,
  blood_group TEXT NOT NULL DEFAULT '',
  mobile_no TEXT NOT NULL DEFAULT '',
  emergency_no TEXT NOT NULL DEFAULT '',
  marital_status TEXT NOT NULL DEFAULT '',
  no_of_children INTEGER NOT NULL DEFAULT 0,
  spouse_no TEXT NOT NULL DEFAULT '',
  courses TEXT NOT NULL DEFAULT '',
  present_address TEXT NOT NULL DEFAULT '',
  permanent_address TEXT NOT NULL DEFAULT '',
  domicile TEXT NOT NULL DEFAULT '',
  cnic TEXT NOT NULL DEFAULT '',
  tariq_coy_joining_date TEXT,
  living_status TEXT NOT NULL DEFAULT 'IN' CHECK (living_status IN ('IN','OUT')),
  driving_license TEXT NOT NULL DEFAULT 'No' CHECK (driving_license IN ('Yes','No')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_employees_rank_force ON employees(rank, force_no);

CREATE TABLE IF NOT EXISTS leave_records (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('C_LEAVE','E_LEAVE','MEDICAL')),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days INTEGER NOT NULL CHECK (days >= 0),
  balance TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS idx_leave_employee_dates ON leave_records(employee_id, from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_leave_type ON leave_records(leave_type);

CREATE TABLE IF NOT EXISTS contribution_rates (
  id TEXT PRIMARY KEY,
  rank TEXT NOT NULL CHECK (rank IN ('DD','AD','INSP','SI','ASI','SGT','CPL')),
  living_status TEXT NOT NULL CHECK (living_status IN ('IN','OUT')),
  effective_from TEXT NOT NULL,
  welfare REAL NOT NULL DEFAULT 0,
  mod_amount REAL NOT NULL DEFAULT 0,
  med REAL NOT NULL DEFAULT 0,
  barber REAL NOT NULL DEFAULT 0,
  waiter REAL NOT NULL DEFAULT 0,
  wman REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(rank, living_status, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_rates_effective ON contribution_rates(rank, living_status, effective_from);

CREATE TABLE IF NOT EXISTS monthly_collections (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  month_key TEXT NOT NULL,
  welfare REAL NOT NULL DEFAULT 0,
  mod_amount REAL NOT NULL DEFAULT 0,
  med REAL NOT NULL DEFAULT 0,
  barber REAL NOT NULL DEFAULT 0,
  waiter REAL NOT NULL DEFAULT 0,
  wman REAL NOT NULL DEFAULT 0,
  contribution_total REAL NOT NULL DEFAULT 0,
  living_status_snapshot TEXT NOT NULL CHECK (living_status_snapshot IN ('IN','OUT')),
  rank_snapshot TEXT NOT NULL,
  mess_base REAL NOT NULL DEFAULT 7000,
  leave_days REAL NOT NULL DEFAULT 0 CHECK (leave_days >= 0),
  leave_deduction REAL NOT NULL DEFAULT 0 CHECK (leave_deduction >= 0),
  mess_amount REAL NOT NULL DEFAULT 0 CHECK (mess_amount >= 0),
  total_due REAL NOT NULL DEFAULT 0 CHECK (total_due >= 0),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PAID')),
  payment_date TEXT,
  payment_method TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, month_key)
);
CREATE INDEX IF NOT EXISTS idx_collections_month ON monthly_collections(month_key);
CREATE INDEX IF NOT EXISTS idx_collections_status ON monthly_collections(month_key, payment_status);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES app_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
