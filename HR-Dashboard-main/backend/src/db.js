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
    'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash TEXT',
    'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS department TEXT',
    'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS designation TEXT',
    'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS location TEXT',
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Viewer'",
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active'",
    'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false',
    "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb",
    'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()',
    'ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()',
    `ALTER TABLE IF EXISTS role_permissions
     ADD COLUMN IF NOT EXISTS company_access JSONB NOT NULL
     DEFAULT '["Automat Industries (Site 4)", "Automat Irrigation", "Smith", "HO"]'::jsonb`,
    'ALTER TABLE IF EXISTS role_permissions ADD COLUMN IF NOT EXISTS create_modules JSONB',
    'UPDATE role_permissions SET create_modules = edit WHERE create_modules IS NULL',
    "ALTER TABLE IF EXISTS role_permissions ALTER COLUMN create_modules SET DEFAULT '[]'::jsonb",
    'ALTER TABLE IF EXISTS role_permissions ALTER COLUMN create_modules SET NOT NULL',
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
    'ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS department_type TEXT',
    `UPDATE daily_manpower
     SET department_production = CONCAT_WS(' - ', NULLIF(department, ''), NULLIF(production::TEXT, ''))
     WHERE department_production IS NULL
       AND (department IS NOT NULL OR production IS NOT NULL)`,
    `UPDATE daily_manpower
     SET department_type = CASE
       WHEN department_production IN ('QC & RD', 'Water Flow Meter', 'ACCOUNTS_DAY', 'PURCHASE DAY', 'PROJECTS/WAREHOUSE', 'HR', 'ADMIN', 'PANTRY', 'GAURAD_SBD', 'DRIVER', 'GARDENER', 'HK', 'ABSOLUTE 4 SECURITY', 'IT', 'Hadar') THEN 'Non-Production'
       ELSE 'Production'
     END
     WHERE department_type IS NULL AND department_production IS NOT NULL`,
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS opening_position TEXT',
    'ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS number_of_positions INTEGER NOT NULL DEFAULT 1',
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
    'ALTER TABLE electricity ADD COLUMN IF NOT EXISTS remarks TEXT',
    'ALTER TABLE canteen ADD COLUMN IF NOT EXISTS management_coupon INTEGER',
    'ALTER TABLE canteen ADD COLUMN IF NOT EXISTS visitors_customers INTEGER',
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
     VALUES ('Smith'), ('Automat Irrigation'), ('HO')
     ON CONFLICT (industry) DO NOTHING`,
    `UPDATE role_permissions
     SET company_access = (
       SELECT COALESCE(jsonb_agg(to_jsonb(company_name) ORDER BY ordinal), '[]'::jsonb)
       FROM (
         SELECT DISTINCT CASE WHEN value = 'Smith3' THEN 'Smith' ELSE value END AS company_name,
                min(ordinality) AS ordinal
         FROM jsonb_array_elements_text(company_access) WITH ORDINALITY AS access(value, ordinality)
         GROUP BY CASE WHEN value = 'Smith3' THEN 'Smith' ELSE value END
       ) normalized
     )
     WHERE company_access @> '["Smith3"]'::jsonb`,
    `INSERT INTO operation_matrix_by_industry (industry, data, updated_by, updated_at)
     SELECT 'Smith', data, updated_by, updated_at
     FROM operation_matrix_by_industry WHERE industry = 'Smith3'
     ON CONFLICT (industry) DO UPDATE SET
       data = CASE
         WHEN jsonb_array_length(operation_matrix_by_industry.data->'particulars') = 0
           THEN EXCLUDED.data
         ELSE jsonb_set(
           operation_matrix_by_industry.data,
           '{particulars}',
           (operation_matrix_by_industry.data->'particulars') || COALESCE((
             SELECT jsonb_agg(old_row)
             FROM jsonb_array_elements(EXCLUDED.data->'particulars') AS old_row
             WHERE NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(operation_matrix_by_industry.data->'particulars') AS current_row
               WHERE current_row->>'id' = old_row->>'id'
             )
           ), '[]'::jsonb)
         )
       END,
       updated_by = COALESCE(operation_matrix_by_industry.updated_by, EXCLUDED.updated_by),
       updated_at = GREATEST(operation_matrix_by_industry.updated_at, EXCLUDED.updated_at)`,
    `DELETE FROM operation_matrix_by_industry WHERE industry = 'Smith3'`,
  ];

  const companyTables = [
    'manpower', 'daily_manpower', 'recruitment', 'hiring', 'separation',
    'loan_summary', 'retirement', 'electricity', 'canteen', 'healthcheck',
    'engagement', 'training', 'attendance',
  ];
  companyTables.forEach((table) => {
    migrations.push(`ALTER TABLE IF EXISTS ${table} ADD COLUMN IF NOT EXISTS company TEXT`);
    // Preserve rows saved under the old company ID after the rename.
    migrations.push(`UPDATE ${table} SET company = 'Smith' WHERE company = 'Smith3'`);
  });

  for (const migration of migrations) {
    await pool.query(migration);
  }
}

module.exports = { pool, ensureCurrentSchema };
