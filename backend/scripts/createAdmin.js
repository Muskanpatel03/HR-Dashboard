// Creates (or resets) the first Administrator login.
// Usage: npm run create-admin   (reads ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD from .env)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function main() {
  const name = process.env.ADMIN_NAME || 'Avni Sharma';
  const email = (process.env.ADMIN_EMAIL || 'avvnisharma@gmail.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, department, designation, location, role, status, email_verified, permissions)
     VALUES ($1, $2, $3, 'HR', 'System Administrator', 'Head Office', 'Administrator', 'Active', true, '{}'::jsonb)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'Administrator', status = 'Active', email_verified = true`,
    [name, email, hash]
  );

  console.log(`Admin user ready -> email: ${email}  password: ${password}`);
  console.log('This account skips OTP verification and is active immediately. Log in and change the password from User Management if you want a different one.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Failed to create admin user:', e.message);
  process.exit(1);
});
