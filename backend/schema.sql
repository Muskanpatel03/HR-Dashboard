-- AUTOMAT HR MIS — PostgreSQL schema
-- Run with: psql -d automat_hr_mis -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  department TEXT,
  designation TEXT,
  location TEXT,
  role TEXT NOT NULL DEFAULT 'Viewer',
  status TEXT NOT NULL DEFAULT 'Active',
  email_verified BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Safe to re-run on a database created before these columns existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Admin-editable, role-wise read/write access control. "modules" = the JSON
-- string "all" or a JSON array of module keys this role can VIEW; "edit" =
-- the same shape for which of those the role can also CREATE/UPDATE/DELETE
-- in. Seeded from backend/src/config/roles.js on first boot; from then on
-- an Administrator edits rows here via GET/PUT /api/roles.
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT PRIMARY KEY,
  modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  edit JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_user ON email_otps (user_id);


CREATE TABLE IF NOT EXISTS manpower (
  id SERIAL PRIMARY KEY,
  month TEXT,
  location TEXT,
  department TEXT,
  employee_type TEXT,
  headcount INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruitment (
  id SERIAL PRIMARY KEY,
  candidate_name TEXT,
  position TEXT,
  department TEXT,
  location TEXT,
  recruiter TEXT,
  source TEXT,
  status TEXT,
  application_date DATE,
  joining_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hiring (
  id SERIAL PRIMARY KEY,
  employee_name TEXT,
  joining_date DATE,
  department TEXT,
  location TEXT,
  employment_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS separation (
  id SERIAL PRIMARY KEY,
  employee_name TEXT,
  separation_date DATE,
  department TEXT,
  location TEXT,
  type TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loans (
  id SERIAL PRIMARY KEY,
  employee_name TEXT,
  department TEXT,
  loan_type TEXT,
  sanctioned_amount NUMERIC,
  disbursed_amount NUMERIC,
  monthly_recovery NUMERIC,
  total_recovered NUMERIC,
  start_date DATE,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retirement (
  id SERIAL PRIMARY KEY,
  employee_name TEXT,
  employee_id TEXT,
  department TEXT,
  location TEXT,
  retirement_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS electricity (
  id SERIAL PRIMARY KEY,
  location TEXT,
  month TEXT,
  opening_reading NUMERIC,
  closing_reading NUMERIC,
  solar_generation NUMERIC,
  bill_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canteen (
  id SERIAL PRIMARY KEY,
  month TEXT,
  location TEXT,
  meals INTEGER,
  employees INTEGER,
  monthly_bill NUMERIC,
  employee_recovery NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS healthcheck (
  id SERIAL PRIMARY KEY,
  employee_name TEXT,
  department TEXT,
  coupon_issued TEXT,
  coupon_used TEXT,
  checkup_date DATE,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engagement (
  id SERIAL PRIMARY KEY,
  activity_name TEXT,
  date DATE,
  department TEXT,
  location TEXT,
  eligible_employees INTEGER,
  participants INTEGER,
  organizer TEXT,
  cost NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  month TEXT,
  department TEXT,
  location TEXT,
  total_working_days INTEGER,
  employee_strength INTEGER,
  absent_days INTEGER,
  leave_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS training (
  id SERIAL PRIMARY KEY,
  training_name TEXT,
  training_date DATE,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  time TIMESTAMPTZ DEFAULT now(),
  user_name TEXT,
  role TEXT,
  module TEXT,
  action TEXT,
  detail TEXT
);

-- Manpower: ensure the columns the app actually uses exist (safe to re-run).
-- planned_direct_count / planned_indirect_count hold the Plan vs Actual comparison
-- on the same row as the actual direct_count / indirect_count.
ALTER TABLE manpower ADD COLUMN IF NOT EXISTS direct_count INTEGER;
ALTER TABLE manpower ADD COLUMN IF NOT EXISTS indirect_count INTEGER;
ALTER TABLE manpower ADD COLUMN IF NOT EXISTS planned_direct_count INTEGER;
ALTER TABLE manpower ADD COLUMN IF NOT EXISTS planned_indirect_count INTEGER;
-- plan_actual was an earlier approach (separate Plan/Actual rows); superseded
-- by the planned_*/actual columns above. Left in place, harmless, unused.

-- Per-person cost (₹) so Planned/Actual total cost can be derived per row
-- (headcount × cost per person) and rolled up into section/period totals.
ALTER TABLE manpower ADD COLUMN IF NOT EXISTS planned_cost_per_person NUMERIC;
ALTER TABLE manpower ADD COLUMN IF NOT EXISTS actual_cost_per_person NUMERIC;

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (time DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_status ON recruitment (status);
CREATE INDEX IF NOT EXISTS idx_manpower_month ON manpower (month);
