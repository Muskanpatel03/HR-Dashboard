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
  company_access JSONB NOT NULL DEFAULT '["Automat Industries (Site 4)", "Automat Irrigation", "Smith3", "HO"]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS company_access JSONB NOT NULL
  DEFAULT '["Automat Industries (Site 4)", "Automat Irrigation", "Smith3", "HO"]'::jsonb;

CREATE TABLE IF NOT EXISTS operation_matrix (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{"fiscalYearEnd": 2027, "reportMonth": "2026-08", "particulars": []}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO operation_matrix (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS operation_matrix_by_industry (
  industry TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{"fiscalYearEnd": 2027, "reportMonth": "2026-08", "particulars": []}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO operation_matrix_by_industry (industry, data, updated_by, updated_at)
SELECT 'Automat Industries (Site 4)', data, updated_by, updated_at
FROM operation_matrix WHERE id = 1
ON CONFLICT (industry) DO NOTHING;

INSERT INTO operation_matrix_by_industry (industry)
VALUES ('Smith3'), ('Automat Irrigation'), ('HO')
ON CONFLICT (industry) DO NOTHING;

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

CREATE TABLE IF NOT EXISTS daily_manpower (
  id SERIAL PRIMARY KEY,
  date DATE,
  location TEXT,
  department TEXT,
  direct_present INTEGER,
  indirect_present INTEGER,
  direct_absent INTEGER,
  indirect_absent INTEGER,
  production INTEGER,
  fixed_manpower INTEGER,
  day_shift INTEGER,
  night_shift INTEGER,
  absent INTEGER,
  double_shift INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS production INTEGER;
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS fixed_manpower INTEGER;
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS day_shift INTEGER;
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS night_shift INTEGER;
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS absent INTEGER;
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS double_shift INTEGER;
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS department_production TEXT;
UPDATE daily_manpower
SET department_production = CONCAT_WS(' - ', NULLIF(department, ''), NULLIF(production::TEXT, ''))
WHERE department_production IS NULL
  AND (department IS NOT NULL OR production IS NOT NULL);

CREATE TABLE IF NOT EXISTS recruitment (
  id SERIAL PRIMARY KEY,
  opening_type TEXT,
  opening_position TEXT,
  remarks TEXT,
  month TEXT,
  department TEXT,
  location TEXT,
  shortlisted INTEGER DEFAULT 0,
  offered INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hiring (
  id SERIAL PRIMARY KEY,
  month TEXT,
  department TEXT,
  location TEXT,
  joined INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS separation (
  id SERIAL PRIMARY KEY,
  month TEXT,
  department TEXT,
  reason TEXT,
  mode TEXT,
  location TEXT,
  last_working_day DATE,
  exit TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_summary (
  id SERIAL PRIMARY KEY,
  unit TEXT,
  budget_personal NUMERIC,
  budget_home NUMERIC,
  available_personal NUMERIC,
  available_home NUMERIC,
  taken_personal NUMERIC,
  taken_home NUMERIC,
  recovered_fy2526 NUMERIC,
  taken_fy2526 NUMERIC,
  taken_fy2425 NUMERIC,
  outstanding_till_jul26 NUMERIC,
  company TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS budget_personal NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS budget_home NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS available_personal NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS available_home NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS taken_personal NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS taken_home NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS recovered_fy2526 NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS taken_fy2526 NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS taken_fy2425 NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS outstanding_till_jul26 NUMERIC;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS retirement (
  id SERIAL PRIMARY KEY,
  employee_name TEXT,
  employee_id TEXT,
  designation TEXT,
  department TEXT,
  location TEXT,
  criticality TEXT,
  date_of_birth DATE,
  last_working_day DATE,
  retirement_date DATE,
  company TEXT,
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
  monthly_bill NUMERIC,
  employee_recovery NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS healthcheck (
  id SERIAL PRIMARY KEY,
  period TEXT,
  as_of_date DATE,
  employee_name TEXT,
  department TEXT,
  designation TEXT,
  date_of_usage DATE,
  total_coupons_purchased INTEGER,
  total_coupons_available INTEGER,
  coupons_available_ho INTEGER,
  coupons_available_industries INTEGER,
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
  section TEXT,
  training_name TEXT,
  training_date DATE,
  location TEXT,
  trainer TEXT,
  number_of_people INTEGER,
  average_rating NUMERIC,
  remarks TEXT,
  company TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  time TIMESTAMPTZ DEFAULT now(),
  user_name TEXT,
  role TEXT,
  module TEXT,
  action TEXT,
  detail TEXT,
  company TEXT
);

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS company TEXT;

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
ALTER TABLE manpower ADD COLUMN IF NOT EXISTS entry_date DATE;
ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS criticality TEXT;
ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS last_working_day DATE;

ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS opening_position TEXT;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS opening_type TEXT;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS month TEXT;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS shortlisted INTEGER DEFAULT 0;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS offered INTEGER DEFAULT 0;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE hiring ADD COLUMN IF NOT EXISTS month TEXT;
ALTER TABLE hiring ADD COLUMN IF NOT EXISTS joined INTEGER DEFAULT 0;
ALTER TABLE separation ADD COLUMN IF NOT EXISTS month TEXT;
ALTER TABLE separation ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE separation ADD COLUMN IF NOT EXISTS last_working_day DATE;
ALTER TABLE separation ADD COLUMN IF NOT EXISTS exit TEXT;
ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS date_of_usage DATE;
ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS as_of_date DATE;
ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS total_coupons_purchased INTEGER;
ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS total_coupons_available INTEGER;
ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS coupons_available_ho INTEGER;
ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS coupons_available_industries INTEGER;
ALTER TABLE training ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE training ADD COLUMN IF NOT EXISTS trainer TEXT;
ALTER TABLE training ADD COLUMN IF NOT EXISTS number_of_people INTEGER;
ALTER TABLE training ADD COLUMN IF NOT EXISTS average_rating NUMERIC;
ALTER TABLE training ADD COLUMN IF NOT EXISTS remarks TEXT;

ALTER TABLE IF EXISTS manpower ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS daily_manpower ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS recruitment ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS hiring ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS separation ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS loan_summary ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS electricity ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS canteen ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS healthcheck ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS engagement ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS training ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE IF EXISTS attendance ADD COLUMN IF NOT EXISTS company TEXT;