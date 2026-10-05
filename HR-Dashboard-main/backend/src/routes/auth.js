const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { getRoleAccess } = require('../config/roles');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Email configuration
|--------------------------------------------------------------------------
*/

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE) === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/*
|--------------------------------------------------------------------------
| JWT
|--------------------------------------------------------------------------
| No expiresIn is used.
| Therefore the JWT does not automatically expire.
|--------------------------------------------------------------------------
*/

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET
  );
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(otp) {
  return crypto
    .createHash('sha256')
    .update(String(otp))
    .digest('hex');
}

async function sendOtpEmail(email, name, otp) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'AUTOMAT HR MIS - Email Verification OTP',
    text:
`Hello ${name},

Your AUTOMAT HR MIS verification OTP is:

${otp}

This OTP is valid for 10 minutes.

If you did not create an account, you can ignore this email.

Regards,
AUTOMAT HR MIS`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2>AUTOMAT HR MIS</h2>

        <p>Hello ${escapeHtml(name)},</p>

        <p>Your email verification OTP is:</p>

        <div style="
          font-size:32px;
          font-weight:bold;
          letter-spacing:8px;
          padding:20px;
          background:#f5f3ee;
          text-align:center;
          margin:20px 0;
        ">
          ${otp}
        </div>

        <p>This OTP is valid for <strong>10 minutes</strong>.</p>

        <p>
          If you did not create an account, you can ignore this email.
        </p>

        <p>Regards,<br>AUTOMAT HR MIS</p>
      </div>
    `
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/*
|--------------------------------------------------------------------------
| POST /api/auth/register
|--------------------------------------------------------------------------
| Creates an account that's immediately usable — as soon as the OTP is
| verified, the user can log in. No administrator-approval step exists
| anywhere in this flow.
|
| New users:
|   role   = Viewer
|   status = Active
|   email_verified = false (until OTP is verified; login is blocked till then)
|--------------------------------------------------------------------------
*/

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({
      error: 'Name, email and password are required'
    });
  }

  const cleanName = String(name).trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password);

  if (cleanName.length < 2) {
    return res.status(400).json({
      error: 'Please enter a valid name'
    });
  }

  if (cleanPassword.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters'
    });
  }

  try {
    /*
     * Check whether this email already exists.
     */
    const existing = await pool.query(
      `SELECT id, email_verified, status
       FROM users
       WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];

      /*
       * Allow an unverified account to request another OTP
       * instead of creating duplicates.
       */
      if (existingUser.email_verified === false) {
        return res.status(409).json({
          error: 'An unverified account already exists for this email. Please verify the OTP or request a new OTP.'
        });
      }

      return res.status(409).json({
        error: 'An account with that email already exists'
      });
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 12);

    /*
     * New accounts are ALWAYS Viewer + Active. Email verification (OTP)
     * is the only gate before login — no administrator approval step.
     * No role is accepted from the frontend.
     */
    const result = await pool.query(
      `INSERT INTO users
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
        ($1, $2, $3, 'Viewer', 'Active', false, '{}'::jsonb, now(), now())
       RETURNING
        id,
        name,
        email,
        role,
        status,
        email_verified`,
      [
        cleanName,
        cleanEmail,
        passwordHash
      ]
    );

    const user = result.rows[0];

    /*
     * Generate OTP.
     */
    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    /*
     * OTP expires after 10 minutes.
     */
    await pool.query(
      `INSERT INTO email_otps
        (user_id, otp_hash, expires_at)
       VALUES
        ($1, $2, now() + interval '10 minutes')`,
      [user.id, otpHash]
    );

    /*
     * Send OTP.
     */
    try {
      await sendOtpEmail(
        user.email,
        user.name,
        otp
      );
    } catch (mailError) {
      console.error('OTP email failed:', mailError);

      /*
       * Remove user if email could not be sent.
       * This allows the person to try registration again.
       */
      await pool.query(
        'DELETE FROM users WHERE id = $1',
        [user.id]
      );

      return res.status(500).json({
        error: 'Unable to send verification email. Please try again.'
      });
    }

    /*
     * Audit entry.
     */
    try {
      await pool.query(
        `INSERT INTO audit_log
          (user_name, role, module, action, detail)
         VALUES
          ($1, $2, $3, $4, $5)`,
        [
          user.name,
          user.role,
          'usersmgmt',
          'Registered',
          `New account registered: ${user.email}`
        ]
      );
    } catch (auditError) {
      console.error('Audit log failed:', auditError);
    }

    return res.status(201).json({
      message: 'Account created. A verification OTP has been sent to your email.',
      requiresOtp: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        email_verified: user.email_verified
      }
    });

  } catch (e) {
    console.error('Registration failed:', e);

    return res.status(500).json({
      error: 'Registration failed'
    });
  }
});

/*
|--------------------------------------------------------------------------
| POST /api/auth/verify-otp
|--------------------------------------------------------------------------
*/

router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body || {};

  if (!email || !otp) {
    return res.status(400).json({
      error: 'Email and OTP are required'
    });
  }

  const cleanEmail = normalizeEmail(email);
  const cleanOtp = String(otp).trim();

  if (!/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({
      error: 'OTP must be 6 digits'
    });
  }

  try {
    const userResult = await pool.query(
      `SELECT *
       FROM users
       WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        error: 'Account not found'
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        error: 'Email is already verified'
      });
    }

    /*
     * Get latest unused OTP.
     */
    const otpResult = await pool.query(
      `SELECT *
       FROM email_otps
       WHERE user_id = $1
         AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    const otpRecord = otpResult.rows[0];

    if (!otpRecord) {
      return res.status(400).json({
        error: 'No active OTP found. Please request a new OTP.'
      });
    }

    /*
     * Maximum 5 attempts.
     */
    if (otpRecord.attempts >= 5) {
      return res.status(429).json({
        error: 'Too many incorrect OTP attempts. Please request a new OTP.'
      });
    }

    /*
     * Check expiry.
     */
    if (new Date(otpRecord.expires_at) <= new Date()) {
      return res.status(400).json({
        error: 'OTP has expired. Please request a new OTP.'
      });
    }

    const suppliedHash = hashOtp(cleanOtp);

    if (suppliedHash !== otpRecord.otp_hash) {
      await pool.query(
        `UPDATE email_otps
         SET attempts = attempts + 1
         WHERE id = $1`,
        [otpRecord.id]
      );

      return res.status(400).json({
        error: 'Invalid OTP'
      });
    }

    /*
     * Mark OTP as used.
     */
    await pool.query(
      `UPDATE email_otps
       SET used_at = now()
       WHERE id = $1`,
      [otpRecord.id]
    );

    /*
     * Mark the email as verified. The account was already created as
     * Active at registration — there is no separate admin-approval
     * step. Once this flips to true, the user can log in immediately.
     */
    const updated = await pool.query(
      `UPDATE users
       SET
         email_verified = true,
         updated_at = now()
       WHERE id = $1
       RETURNING
         id,
         name,
         email,
         role,
         status,
         email_verified`,
      [user.id]
    );

    const verifiedUser = updated.rows[0];

    try {
      await pool.query(
        `INSERT INTO audit_log
          (user_name, role, module, action, detail)
         VALUES
          ($1, $2, $3, $4, $5)`,
        [
          verifiedUser.name,
          verifiedUser.role,
          'usersmgmt',
          'Email verified',
          `Email verified: ${verifiedUser.email}`
        ]
      );
    } catch (auditError) {
      console.error('Audit log failed:', auditError);
    }

    return res.json({
      message: 'Email verified successfully. You can now sign in.',
      user: verifiedUser
    });

  } catch (e) {
    console.error('OTP verification failed:', e);

    return res.status(500).json({
      error: 'OTP verification failed'
    });
  }
});

/*
|--------------------------------------------------------------------------
| POST /api/auth/resend-otp
|--------------------------------------------------------------------------
*/

router.post('/resend-otp', async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({
      error: 'Email is required'
    });
  }

  const cleanEmail = normalizeEmail(email);

  try {
    const userResult = await pool.query(
      `SELECT *
       FROM users
       WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        error: 'Account not found'
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        error: 'Email is already verified'
      });
    }

    /*
     * Invalidate previous OTPs.
     */
    await pool.query(
      `UPDATE email_otps
       SET used_at = now()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [user.id]
    );

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    await pool.query(
      `INSERT INTO email_otps
        (user_id, otp_hash, expires_at)
       VALUES
        ($1, $2, now() + interval '10 minutes')`,
      [user.id, otpHash]
    );

    await sendOtpEmail(
      user.email,
      user.name,
      otp
    );

    return res.json({
      message: 'A new OTP has been sent to your email.'
    });

  } catch (e) {
    console.error('Resend OTP failed:', e);

    return res.status(500).json({
      error: 'Unable to resend OTP'
    });
  }
});

/*
|--------------------------------------------------------------------------
| POST /api/auth/login
|--------------------------------------------------------------------------
*/

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required'
    });
  }

  const cleanEmail = normalizeEmail(email);

  try {
    const result = await pool.query(
      `SELECT *
       FROM users
       WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    /*
     * Email must be verified before login.
     */
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email with the OTP before logging in.',
        requiresVerification: true
      });
    }

    /*
     * Account must be active. There is no approval gate for new
     * self-signups — an Administrator can only deactivate an account
     * afterwards from User Management (status = 'Inactive').
     */
    if (user.status !== 'Active') {
      return res.status(403).json({
        error: 'Your account has been deactivated. Please contact the administrator.'
      });
    }

    const passwordOk = await bcrypt.compare(
      String(password),
      user.password_hash
    );

    if (!passwordOk) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    const token = signToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        designation: user.designation,
        location: user.location,
        status: user.status,
        email_verified: user.email_verified,
        permissions: user.permissions || {},
        // Live, admin-editable role permissions — see config/roles.js.
        // The frontend prefers this over its static fallback copy.
        roleAccess: getRoleAccess(user.role)
      }
    });

  } catch (e) {
    console.error('Login failed:', e);

    return res.status(500).json({
      error: 'Login failed'
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/auth/me
|--------------------------------------------------------------------------
*/

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        email,
        department,
        designation,
        location,
        role,
        status,
        email_verified,
        permissions
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        error: 'User account no longer exists'
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({
        error: 'Your account is not active'
      });
    }

    return res.json({
      user: { ...user, roleAccess: getRoleAccess(user.role) }
    });

  } catch (e) {
    console.error('Get current user failed:', e);

    return res.status(500).json({
      error: 'Unable to load user'
    });
  }
});
module.exports = router;
