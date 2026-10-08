const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { canView, canEdit, canAccessCompany } = require('../config/roles');

const router = express.Router();
router.use(authenticate);
const INDUSTRIES = [
  'Automat Industries (Site 4)',
  'Smith3',
  'Automat Irrigation',
  'HO',
];

function validMatrix(data) {
  return data &&
    Number.isInteger(data.fiscalYearEnd) &&
    data.fiscalYearEnd >= 2000 &&
    data.fiscalYearEnd <= 2100 &&
    typeof data.reportMonth === 'string' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(data.reportMonth) &&
    Array.isArray(data.particulars) &&
    data.particulars.length <= 500 &&
    data.particulars.every((row) =>
      row &&
      typeof row.id === 'string' &&
      typeof row.particular === 'string' &&
      row.particular.trim().length > 0 &&
      row.particular.length <= 200 &&
      row.values &&
      typeof row.values === 'object' &&
      !Array.isArray(row.values) &&
      Object.values(row.values).every((value) =>
        (typeof value === 'string' && value.length <= 1000) ||
        (typeof value === 'number' && Number.isFinite(value))
      )
    );
}

router.get('/', async (req, res) => {
  if (!canView(req.user.role, 'operationMatrix') && !canView(req.user.role, 'dashboard')) {
    return res.status(403).json({ error: 'Not permitted to view the Operation Matrix' });
  }

  const { industry } = req.query;
  if (!INDUSTRIES.includes(industry)) {
    return res.status(400).json({ error: 'Invalid industry' });
  }
  if (!canAccessCompany(req.user.role, industry)) {
    return res.status(403).json({ error: 'Not permitted to access this company' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT data, updated_by, updated_at FROM operation_matrix_by_industry WHERE industry = $1',
      [industry]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load the Operation Matrix' });
  }
});

router.put('/', async (req, res) => {
  if (!canEdit(req.user.role, 'operationMatrix')) {
    return res.status(403).json({ error: 'Not permitted to edit the Operation Matrix' });
  }

  const { industry, data } = req.body || {};
  if (!INDUSTRIES.includes(industry) || !validMatrix(data)) {
    return res.status(400).json({ error: 'Invalid Operation Matrix data' });
  }
  if (!canAccessCompany(req.user.role, industry)) {
    return res.status(403).json({ error: 'Not permitted to access this company' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT data FROM operation_matrix_by_industry WHERE industry = $1 FOR UPDATE',
      [industry]
    );
    if (req.user.role !== 'Administrator') {
      const currentRows = current.rows[0]?.data?.particulars || [];
      const nextRowIds = new Set(data.particulars.map((row) => row.id));
      if (currentRows.some((row) => !nextRowIds.has(row.id))) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only an Administrator can delete Operation Matrix rows' });
      }
    }
    const result = await client.query(
      `INSERT INTO operation_matrix_by_industry (industry, data, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (industry) DO UPDATE
       SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING data, updated_by, updated_at`,
      [industry, JSON.stringify(data), req.user.name]
    );
    await client.query(
      'INSERT INTO audit_log (user_name, role, module, action, detail, company) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.name, req.user.role, 'operationMatrix', 'Updated', `Updated ${industry}: ${data.particulars.length} particulars`, industry]
    );
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Failed to save the Operation Matrix' });
  } finally {
    client.release();
  }
});

module.exports = router;