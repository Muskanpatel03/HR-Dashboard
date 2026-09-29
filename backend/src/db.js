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
  ];

  for (const migration of migrations) {
    await pool.query(migration);
  }
}

module.exports = { pool, ensureCurrentSchema };