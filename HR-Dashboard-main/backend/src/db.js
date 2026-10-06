require('dotenv').config();
const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting)
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

async function ensureCurrentSchema() {
  const migrations = [
    `ALTER TABLE IF EXISTS role_permissions
     ADD COLUMN IF NOT EXISTS company_access JSONB NOT NULL
     DEFAULT '["Automat Industries (Site 4)", "Automat Irrigation", "Smith3", "HO"]'::jsonb`,
    'ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS company TEXT',
    `CREATE TABLE IF NOT EXISTS daily_manpower (
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
    )`,
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()',
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()',
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS production INTEGER',
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS fixed_manpower INTEGER',
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS day_shift INTEGER',
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS night_shift INTEGER',
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS absent INTEGER',
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS double_shift INTEGER',
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS department_production TEXT',
    `UPDATE daily_manpower
     SET department_production = CONCAT_WS(' - ', NULLIF(department, ''), NULLIF(production::TEXT, ''))
     WHERE department_production IS NULL
       AND (department IS NOT NULL OR production IS NOT NULL)`,
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS opening_position TEXT',
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS opening_type TEXT',
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS remarks TEXT',
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS month TEXT',
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS shortlisted INTEGER DEFAULT 0',
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS offered INTEGER DEFAULT 0',
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS status TEXT',
    'ALTER TABLE hiring ADD COLUMN IF NOT EXISTS month TEXT',
    'ALTER TABLE hiring ADD COLUMN IF NOT EXISTS joined INTEGER DEFAULT 0',
    'ALTER TABLE separation ADD COLUMN IF NOT EXISTS month TEXT',
    'ALTER TABLE separation ADD COLUMN IF NOT EXISTS mode TEXT',
    'ALTER TABLE separation ADD COLUMN IF NOT EXISTS last_working_day DATE',
    'ALTER TABLE separation ADD COLUMN IF NOT EXISTS exit TEXT',
    'ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS designation TEXT',
    'ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS date_of_usage DATE',
    'ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS period TEXT',
    'ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS as_of_date DATE',
    'ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS total_coupons_purchased INTEGER',
    'ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS total_coupons_available INTEGER',
    'ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS coupons_available_ho INTEGER',
    'ALTER TABLE healthcheck ADD COLUMN IF NOT EXISTS coupons_available_industries INTEGER',
    'ALTER TABLE training ADD COLUMN IF NOT EXISTS section TEXT',
    'ALTER TABLE training ADD COLUMN IF NOT EXISTS trainer TEXT',
    'ALTER TABLE training ADD COLUMN IF NOT EXISTS number_of_people INTEGER',
    'ALTER TABLE training ADD COLUMN IF NOT EXISTS average_rating NUMERIC',
    'ALTER TABLE training ADD COLUMN IF NOT EXISTS remarks TEXT',
    'ALTER TABLE IF EXISTS manpower ADD COLUMN IF NOT EXISTS planned_cost_per_person NUMERIC',
    'ALTER TABLE IF EXISTS manpower ADD COLUMN IF NOT EXISTS actual_cost_per_person NUMERIC',
    'ALTER TABLE IF EXISTS manpower ADD COLUMN IF NOT EXISTS entry_date DATE',
    'ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS designation TEXT',
    'ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS criticality TEXT',
    'ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS date_of_birth DATE',
    'ALTER TABLE IF EXISTS retirement ADD COLUMN IF NOT EXISTS last_working_day DATE',
    `CREATE TABLE IF NOT EXISTS loan_summary (
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
    )`,
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS unit TEXT',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS budget_personal NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS budget_home NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS available_personal NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS available_home NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS taken_personal NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS taken_home NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS recovered_fy2526 NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS taken_fy2526 NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS taken_fy2425 NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS outstanding_till_jul26 NUMERIC',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS company TEXT',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()',
    'ALTER TABLE loan_summary ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()',
    'ALTER TABLE training ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()',
    `CREATE TABLE IF NOT EXISTS operation_matrix (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL DEFAULT '{"fiscalYearEnd": 2027, "reportMonth": "2026-08", "particulars": []}'::jsonb,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `INSERT INTO operation_matrix (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS operation_matrix_by_industry (
      industry TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{"fiscalYearEnd": 2027, "reportMonth": "2026-08", "particulars": []}'::jsonb,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `INSERT INTO operation_matrix_by_industry (industry, data, updated_by, updated_at)
     SELECT 'Automat Industries (Site 4)', data, updated_by, updated_at
     FROM operation_matrix WHERE id = 1
     ON CONFLICT (industry) DO NOTHING`,
    `INSERT INTO operation_matrix_by_industry (industry)
     VALUES ('Smith3'), ('Automat Irrigation'), ('HO')
     ON CONFLICT (industry) DO NOTHING`,
  ];

  const companyTables = [
    'manpower', 'daily_manpower', 'recruitment', 'hiring', 'separation',
    'loan_summary', 'retirement', 'electricity', 'canteen', 'healthcheck',
    'engagement', 'training', 'attendance',
  ];
  companyTables.forEach((table) => {
    migrations.push(`ALTER TABLE IF EXISTS ${table} ADD COLUMN IF NOT EXISTS company TEXT`);
  });

  for (const migration of migrations) {
    await pool.query(migration);
  }
}

module.exports = { pool, ensureCurrentSchema };