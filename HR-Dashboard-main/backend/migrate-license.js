
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log("Updating Legal Documents table...");
await pool.query(`
  ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS document_no TEXT
`);
    await pool.query(`
      ALTER TABLE public.licenses
      ADD COLUMN IF NOT EXISTS valid_from DATE
    `);

    await pool.query(`
      ALTER TABLE public.licenses
      ADD COLUMN IF NOT EXISTS valid_till DATE
    `);

    await pool.query(`
      ALTER TABLE public.licenses
      ADD COLUMN IF NOT EXISTS time_period TEXT
    `);

    console.log("Legal Documents table updated successfully!");

    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'licenses'
      ORDER BY ordinal_position
    `);

    console.table(result.rows);

  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

migrate();
