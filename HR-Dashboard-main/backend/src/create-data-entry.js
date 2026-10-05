require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function createDataEntry() {
  const name = process.env.DATA_ENTRY_NAME || 'Data Entry';
  const email = String(process.env.DATA_ENTRY_EMAIL || '').trim().toLowerCase();
  const password = process.env.DATA_ENTRY_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'DATA_ENTRY_EMAIL and DATA_ENTRY_PASSWORD must be set in .env'
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `
    INSERT INTO users
      (
        name,
        email,
        password_hash,
        role,
        status,
        email_verified,
        permissions,
        created_at,
        updated_at
      )
    VALUES
      ($1, $2, $3, 'DataEntry', 'Active', true, '{}'::jsonb, now(), now())
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      role = 'DataEntry',
      status = 'Active',
      email_verified = true,
      updated_at = now()
    RETURNING id, name, email, role, status, email_verified
    `,
    [name, email, passwordHash]
  );

  console.log('Data Entry account ready:');
  console.log(result.rows[0]);

  await pool.end();
}

createDataEntry().catch(async (error) => {
  console.error('Failed to create Data Entry account:', error);
  await pool.end();
  process.exit(1);
});