const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { canView, canCreate, canEdit, canAccessCompany } = require('../config/roles');

const router = express.Router();
router.use(authenticate);
const INDUSTRIES = [
  'Automat Industries (Site 4)',
  'Smith',
  'Automat Irrigation',
  'HO',
];

function getIndianReportingPeriod() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return {
    fiscalYearEnd: year + (month >= 4 ? 1 : 0),
    reportMonth: `${year}-${String(month).padStart(2, '0')}`,
  };
}

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
    const requestedFy = Number(req.query.fiscalYearEnd);
    const requestedMonth = typeof req.query.reportMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.reportMonth)
      ? req.query.reportMonth
      : null;
    const hasPeriod = Number.isInteger(requestedFy) && requestedFy >= 2000 && requestedFy <= 2100 && requestedMonth;
    let selected;
    if (hasPeriod) {
      const periodResult = await pool.query(
        'SELECT data, updated_by, updated_at FROM operation_matrix_periods WHERE industry = $1 AND fiscal_year_end = $2 AND report_month = $3',
        [industry, requestedFy, requestedMonth]
      );
      selected = periodResult.rows[0] || {
        data: { fiscalYearEnd: requestedFy, reportMonth: requestedMonth, particulars: [] },
        updated_by: null,
        updated_at: null,
      };
    } else {
      const currentPeriod = getIndianReportingPeriod();
      const currentPeriodResult = await pool.query(
        'SELECT data, updated_by, updated_at FROM operation_matrix_periods WHERE industry = $1 AND fiscal_year_end = $2 AND report_month = $3',
        [industry, currentPeriod.fiscalYearEnd, currentPeriod.reportMonth]
      );
      selected = currentPeriodResult.rows[0] || {
        data: { ...currentPeriod, particulars: [] },
        updated_by: null,
        updated_at: null,
      };
    }
    res.json(selected || {});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load the Operation Matrix' });
  }
});

router.put('/', async (req, res) => {
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
    const currentData = current.rows[0]?.data || { fiscalYearEnd: data.fiscalYearEnd, reportMonth: data.reportMonth, particulars: [] };
    const currentRows = currentData.particulars || [];
    const currentRowsById = new Map(currentRows.map((row) => [row.id, row]));
    const nextRowsById = new Map(data.particulars.map((row) => [row.id, row]));
    const hasAddedRows = data.particulars.some((row) => !currentRowsById.has(row.id));
    const hasUpdatedRows = currentRows.some((row) => {
      const nextRow = nextRowsById.get(row.id);
      return nextRow && JSON.stringify(row) !== JSON.stringify(nextRow);
    });
    const hasDeletedRows = currentRows.some((row) => !nextRowsById.has(row.id));
    const hasUpdatedSettings = currentData.fiscalYearEnd !== data.fiscalYearEnd || currentData.reportMonth !== data.reportMonth;

    if (hasDeletedRows && req.user.role !== 'Administrator') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only an Administrator can delete Operation Matrix rows' });
    }
    if (hasAddedRows && !canCreate(req.user.role, 'operationMatrix')) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not permitted to create Operation Matrix rows' });
    }
    if ((hasUpdatedRows || hasUpdatedSettings) && !canEdit(req.user.role, 'operationMatrix')) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not permitted to edit the Operation Matrix' });
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
      `INSERT INTO operation_matrix_periods (industry, fiscal_year_end, report_month, data, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (industry, fiscal_year_end, report_month) DO UPDATE
       SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [industry, data.fiscalYearEnd, data.reportMonth, JSON.stringify(data), req.user.name]
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
