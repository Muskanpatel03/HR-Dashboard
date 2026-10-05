// Generic CRUD + audit logging for every HR MIS module.
// Columns come only from the static MODULES config (never from client input),
// so building SQL with template strings for column/table names here is safe.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { MODULES } = require('../config/modules');
const {
  canView,
  canEdit,
  canAccessCompany,
  getRoleCompanies,
  ALL_COMPANY_IDS,
  ASSIGNABLE_ROLES,
} = require('../config/roles');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function permissionModuleKey(moduleKey) {
  return moduleKey === 'dailyManpower' ? 'manpower' : moduleKey;
}

function columnsFor(moduleKey, conf) {
  return moduleKey === 'usersmgmt'
    ? conf.columns
    : [...conf.columns, { js: 'company', db: 'company', type: 'text' }];
}

function isCompanyScoped(moduleKey) {
  return moduleKey !== 'usersmgmt';
}

function canReadCompany(role, company) {
  return ALL_COMPANY_IDS.includes(company) && canAccessCompany(role, company);
}

function normalizeValue(val, type) {
  if (val === undefined || val === null || val === '') return null;
  if (type === 'number') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return val;
}
function toJsRow(dbRow, columns) {
  const out = { id: dbRow.id };

  columns.forEach((c) => {
    out[c.js] = dbRow[c.db];
  });

  if (dbRow.date_of_birth) {
    const dob = new Date(dbRow.date_of_birth);
    const today = new Date();

    let age = today.getFullYear() - dob.getFullYear();

    const monthDiff = today.getMonth() - dob.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < dob.getDate())
    ) {
      age--;
    }

    out.age = age;
    out.ageAsOnDate = today.toISOString().split('T')[0];
  } else {
    out.age = null;
    out.ageAsOnDate = null;
  }

  return out;
}

// Richer summary for Create/Delete: up to 3 non-empty fields, not just one.
function summarize(dbRow, columns) {
  const parts = [];
  for (const c of columns) {
    const val = dbRow[c.db];
    if (val !== null && val !== undefined && val !== '') {
      parts.push(`${c.js}: ${val}`);
      if (parts.length === 3) break;
    }
  }
  return parts.length ? parts.join(', ') : `#${dbRow.id}`;
}

// For Update: exactly which fields changed, old value -> new value.
function diffDetail(oldRow, newRow, columns) {
  const changes = [];
  columns.forEach((c) => {
    const oldVal = oldRow[c.db];
    const newVal = newRow[c.db];
    const oldStr = oldVal === null || oldVal === undefined || oldVal === '' ? '—' : String(oldVal);
    const newStr = newVal === null || newVal === undefined || newVal === '' ? '—' : String(newVal);
    if (oldStr !== newStr) changes.push(`${c.js}: ${oldStr} \u2192 ${newStr}`);
  });
  return changes.length ? changes.join('; ') : 'No field changes';
}

async function logAudit(client, { user, moduleKey, action, detail, company = null }) {
  await client.query(
    'INSERT INTO audit_log (user_name, role, module, action, detail, company) VALUES ($1,$2,$3,$4,$5,$6)',
    [user.name, user.role, moduleKey, action, detail, company]
  );
}

router.get('/:module', async (req, res) => {
  const { module: moduleKey } = req.params;
  const conf = MODULES[moduleKey];
  if (!conf) return res.status(404).json({ error: 'Unknown module' });
  if (!canView(req.user.role, permissionModuleKey(moduleKey))) return res.status(403).json({ error: 'Not permitted to view this module' });
  try {
    const columns = columnsFor(moduleKey, conf);
    const cols = columns.map((c) => c.db).join(', ');
    const companyFilter = isCompanyScoped(moduleKey) && getRoleCompanies(req.user.role).length < ALL_COMPANY_IDS.length;
    const sql = `SELECT id, ${cols} FROM ${conf.table}${companyFilter ? ' WHERE company = ANY($1::text[])' : ''} ORDER BY id DESC`;
    const params = companyFilter ? [getRoleCompanies(req.user.role)] : [];
    const result = await pool.query(sql, params);
    res.json({ records: result.rows.map((row) => toJsRow(row, columns)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load records' });
  }
});

router.post('/:module', async (req, res) => {
  const { module: moduleKey } = req.params;
  const conf = MODULES[moduleKey];
  if (!conf) return res.status(404).json({ error: 'Unknown module' });
  if (!canEdit(req.user.role, permissionModuleKey(moduleKey))) return res.status(403).json({ error: 'Not permitted to add records here' });
  if (moduleKey === 'usersmgmt' && !ASSIGNABLE_ROLES.includes(req.body.role)) {
    return res.status(400).json({ error: 'That role cannot be assigned. Viewer accounts are self-signup only.' });
  }
  if (isCompanyScoped(moduleKey)) {
    if (!ALL_COMPANY_IDS.includes(req.body.company)) {
      return res.status(400).json({ error: 'Select a company for this record' });
    }
    if (!canReadCompany(req.user.role, req.body.company)) {
      return res.status(403).json({ error: 'Not permitted to access this company' });
    }
  }

  const client = await pool.connect();
  try {
    const columns = columnsFor(moduleKey, conf);
    const dbCols = columns.map((c) => c.db);
    const values = columns.map((c) => normalizeValue(req.body[c.js], c.type));
    let insertCols = [...dbCols];
    let insertVals = [...values];

    if (moduleKey === 'usersmgmt' && req.body.password) {
      const hash = await bcrypt.hash(String(req.body.password), 10);
      insertCols.push('password_hash');
      insertVals.push(hash);
    }

    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO ${conf.table} (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id, ${dbCols.join(', ')}`,
      insertVals
    );
    const row = toJsRow(result.rows[0], columns);
    await logAudit(client, { user: req.user, moduleKey, action: 'Created', detail: summarize(result.rows[0], columns), company: result.rows[0].company || null });
    await client.query('COMMIT');
    res.status(201).json({ record: row });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    if (e.code === '23505') return res.status(409).json({ error: 'A record with that unique value already exists (e.g. email)' });
    res.status(500).json({ error: 'Failed to create record' });
  } finally {
    client.release();
  }
});

router.put('/:module/:id', async (req, res) => {
  const { module: moduleKey, id } = req.params;
  const conf = MODULES[moduleKey];
  if (!conf) return res.status(404).json({ error: 'Unknown module' });
  if (!canEdit(req.user.role, permissionModuleKey(moduleKey))) return res.status(403).json({ error: 'Not permitted to edit records here' });
  if (moduleKey === 'usersmgmt' && !ASSIGNABLE_ROLES.includes(req.body.role)) {
    return res.status(400).json({ error: 'That role cannot be assigned. Viewer accounts are self-signup only.' });
  }
  if (isCompanyScoped(moduleKey)) {
    if (!ALL_COMPANY_IDS.includes(req.body.company)) {
      return res.status(400).json({ error: 'Select a company for this record' });
    }
    if (!canReadCompany(req.user.role, req.body.company)) {
      return res.status(403).json({ error: 'Not permitted to access this company' });
    }
  }

  const client = await pool.connect();
  try {
    const columns = columnsFor(moduleKey, conf);
    const setParts = columns.map((c, i) => `${c.db} = $${i + 1}`);
    const values = columns.map((c) => normalizeValue(req.body[c.js], c.type));
    let setClause = `${setParts.join(', ')}, updated_at = now()`;
    let params = [...values];

    if (moduleKey === 'usersmgmt' && req.body.password) {
      const hash = await bcrypt.hash(String(req.body.password), 10);
      params.push(hash);
      setClause += `, password_hash = $${params.length}`;
    }
    params.push(id);

        await client.query('BEGIN');
    const before = await client.query(
      `SELECT id, ${columns.map((c) => c.db).join(', ')} FROM ${conf.table} WHERE id = $1`,
      [id]
    );
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Record not found' });
    }
    if (isCompanyScoped(moduleKey) && !canReadCompany(req.user.role, before.rows[0].company)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not permitted to access this company' });
    }
    if (isCompanyScoped(moduleKey)) {
      if (!ALL_COMPANY_IDS.includes(req.body.company)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Select a company for this record' });
      }
      if (!canReadCompany(req.user.role, req.body.company)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Not permitted to access this company' });
      }
    }
    const result = await client.query(
      `UPDATE ${conf.table} SET ${setClause} WHERE id = $${params.length} RETURNING id, ${columns.map((c) => c.db).join(', ')}`,
      params
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Record not found' });
    }
       const row = toJsRow(result.rows[0], columns);
    await logAudit(client, { user: req.user, moduleKey, action: 'Updated', detail: diffDetail(before.rows[0], result.rows[0], columns), company: result.rows[0].company || null });
    await client.query('COMMIT');
    res.json({ record: row });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Failed to update record' });
  } finally {
    client.release();
  }
});

router.delete('/:module/:id', async (req, res) => {
  const { module: moduleKey, id } = req.params;
  const conf = MODULES[moduleKey];
  if (!conf) return res.status(404).json({ error: 'Unknown module' });
  if (!canEdit(req.user.role, permissionModuleKey(moduleKey))) return res.status(403).json({ error: 'Not permitted to delete records here' });

  const client = await pool.connect();
  try {
    const columns = columnsFor(moduleKey, conf);
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, ${columns.map((c) => c.db).join(', ')} FROM ${conf.table} WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Record not found' });
    }
    if (isCompanyScoped(moduleKey) && !canReadCompany(req.user.role, existing.rows[0].company)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not permitted to access this company' });
    }
    await client.query(`DELETE FROM ${conf.table} WHERE id = $1`, [id]);
    await logAudit(client, { user: req.user, moduleKey, action: 'Deleted', detail: summarize(existing.rows[0], columns), company: existing.rows[0].company || null });
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Failed to delete record' });
  } finally {
    client.release();
  }
});

module.exports = router;
