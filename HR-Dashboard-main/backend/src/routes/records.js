// Generic CRUD + audit logging for every HR MIS module.
// Columns come only from the static MODULES config (never from client input),
// so building SQL with template strings for column/table names here is safe.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { MODULES } = require('../config/modules');
const {
  canView,
  canCreate,
  canEdit,
  canAccessCompany,
  getRoleCompanies,
  setUserCompanyAccess,
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

function canReadCompany(user, company) {
  return ALL_COMPANY_IDS.includes(company) && canAccessCompany(user, company);
}

function canManageRecordCompany(user, company) {
  return (user.role === 'Administrator' && (company === null || company === undefined || company === '')) ||
    canReadCompany(user, company);
}

function normalizeValue(val, type) {
  if (val === undefined || val === null || val === '') return null;
  if (type === 'number') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return val;
}

function bodyForModule(moduleKey, body) {
  if (moduleKey !== 'usersmgmt') return body;
  return { ...body, role: body.designation || body.role };
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
    const requestedCompany = typeof req.query.company === 'string' ? req.query.company : '';
    if (requestedCompany && !ALL_COMPANY_IDS.includes(requestedCompany)) {
      return res.status(400).json({ error: 'Invalid company' });
    }
    if (requestedCompany && !canAccessCompany(req.user, requestedCompany)) {
      return res.status(403).json({ error: 'Not permitted to access this company' });
    }
    const accessibleCompanies = getRoleCompanies(req.user);
    const companyIds = requestedCompany ? [requestedCompany] : accessibleCompanies;
    const companyFilter = isCompanyScoped(moduleKey) &&
      (Boolean(requestedCompany) || accessibleCompanies.length < ALL_COMPANY_IDS.length);
    const where = companyFilter ? ' WHERE company = ANY($1::text[])' : '';
    const queryValues = companyFilter ? [companyIds] : [];

    if (req.query.summary === 'true' && (moduleKey === 'hiring' || moduleKey === 'separation')) {
      const expression = moduleKey === 'hiring' ? 'COALESCE(SUM(joined), 0)' : 'COUNT(*)';
      const { rows: [summary] } = await pool.query(
        `SELECT ${expression} AS total FROM ${conf.table}${where}`,
        queryValues
      );
      return res.json({ summary: { total: Number(summary.total) || 0 } });
    }

    const columns = columnsFor(moduleKey, conf);
    const cols = columns.map((c) => c.db).join(', ');
    const result = await pool.query(`SELECT id, ${cols} FROM ${conf.table}${where} ORDER BY id DESC`, queryValues);
    res.json({ records: result.rows.map((row) => toJsRow(row, columns)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load records' });
  }
});

router.post('/:module/import-batch', async (req, res) => {
  const { module: moduleKey } = req.params;
  const conf = MODULES[moduleKey];
  const records = req.body?.records;
  if (!conf) return res.status(404).json({ error: 'Unknown module' });
  if (!Array.isArray(records) || records.length > 200) return res.status(400).json({ error: 'Send up to 200 records per import batch.' });
  if (!canCreate(req.user.role, permissionModuleKey(moduleKey))) return res.status(403).json({ error: 'Not permitted to add records here' });
  const columns = columnsFor(moduleKey, conf);
  const dbCols = columns.map((column) => column.db);
  const client = await pool.connect();
  const failures = [];
  let imported = 0;
  try {
    await client.query('BEGIN');
    for (let index = 0; index < records.length; index += 1) {
      const body = bodyForModule(moduleKey, records[index] || {});
      if (moduleKey === 'usersmgmt' && !ASSIGNABLE_ROLES.includes(body.role)) {
        failures.push({ index, message: 'Select a valid designation for this user.' });
        continue;
      }
      if (isCompanyScoped(moduleKey) && !ALL_COMPANY_IDS.includes(body.company)) {
        failures.push({ index, message: 'Select a company for this record' });
        continue;
      }
      if (isCompanyScoped(moduleKey) && !canReadCompany(req.user.role, body.company)) {
        failures.push({ index, message: 'Not permitted to access this company' });
        continue;
      }
      const values = columns.map((column) => normalizeValue(body[column.js], column.type));
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(`SAVEPOINT import_row`);
      try {
        let insertCols = [...dbCols];
        let insertVals = [...values];
        if (moduleKey === 'usersmgmt' && body.password) {
          insertCols.push('password_hash');
          insertVals.push(await bcrypt.hash(String(body.password), 10));
        }
        const insertPlaceholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
        const result = await client.query(
          `INSERT INTO ${conf.table} (${insertCols.join(', ')}) VALUES (${insertPlaceholders}) RETURNING id, ${dbCols.join(', ')}`,
          insertVals
        );
        await logAudit(client, { user: req.user, moduleKey, action: 'Created', detail: summarize(result.rows[0], columns), company: result.rows[0].company || null });
        await client.query('RELEASE SAVEPOINT import_row');
        imported += 1;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT import_row');
        failures.push({ index, message: error.code === '23505' ? 'A record with that unique value already exists.' : 'Import failed for this row.' });
      }
    }
    await client.query('COMMIT');
    res.status(200).json({ imported, failures });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Failed to import batch' });
  } finally {
    client.release();
  }
});

router.post('/:module', async (req, res) => {
  const { module: moduleKey } = req.params;
  const conf = MODULES[moduleKey];
  if (!conf) return res.status(404).json({ error: 'Unknown module' });
  if (!canCreate(req.user.role, permissionModuleKey(moduleKey))) return res.status(403).json({ error: 'Not permitted to add records here' });
  const body = bodyForModule(moduleKey, req.body);
  if (moduleKey === 'usersmgmt' && !ASSIGNABLE_ROLES.includes(body.role)) {
    return res.status(400).json({ error: 'Select a valid designation for this user.' });
  }
  if (moduleKey === 'usersmgmt' && !ALL_COMPANY_IDS.includes(body.company)) {
    return res.status(400).json({ error: 'Assign this user to one company' });
  }
  if (isCompanyScoped(moduleKey)) {
    if (!ALL_COMPANY_IDS.includes(body.company)) {
      return res.status(400).json({ error: 'Select a company for this record' });
    }
    if (!canReadCompany(req.user, body.company)) {
      return res.status(403).json({ error: 'Not permitted to access this company' });
    }
  }

  const client = await pool.connect();
  try {
    const columns = columnsFor(moduleKey, conf);
    const dbCols = columns.map((c) => c.db);
    const values = columns.map((c) => normalizeValue(body[c.js], c.type));
    let insertCols = [...dbCols];
    let insertVals = [...values];

    if (moduleKey === 'usersmgmt' && body.password) {
      const hash = await bcrypt.hash(String(body.password), 10);
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
    if (moduleKey === 'usersmgmt') setUserCompanyAccess(row.id, row.company);
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
  const body = bodyForModule(moduleKey, req.body);
  if (moduleKey === 'usersmgmt' && !ASSIGNABLE_ROLES.includes(body.role)) {
    return res.status(400).json({ error: 'Select a valid designation for this user.' });
  }
  if (moduleKey === 'usersmgmt' && !ALL_COMPANY_IDS.includes(body.company)) {
    return res.status(400).json({ error: 'Assign this user to one company' });
  }
  if (isCompanyScoped(moduleKey)) {
    if (!ALL_COMPANY_IDS.includes(body.company)) {
      return res.status(400).json({ error: 'Select a company for this record' });
    }
    if (!canReadCompany(req.user, body.company)) {
      return res.status(403).json({ error: 'Not permitted to access this company' });
    }
  }

  const client = await pool.connect();
  try {
    const columns = columnsFor(moduleKey, conf);
    const setParts = columns.map((c, i) => `${c.db} = $${i + 1}`);
    const values = columns.map((c) => normalizeValue(body[c.js], c.type));
    let setClause = `${setParts.join(', ')}, updated_at = now()`;
    let params = [...values];

    if (moduleKey === 'usersmgmt' && body.password) {
      const hash = await bcrypt.hash(String(body.password), 10);
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
    if (isCompanyScoped(moduleKey) && !canManageRecordCompany(req.user, before.rows[0].company)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not permitted to access this company' });
    }
    if (isCompanyScoped(moduleKey)) {
      if (!ALL_COMPANY_IDS.includes(body.company)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Select a company for this record' });
      }
      if (!canReadCompany(req.user, body.company)) {
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
    if (moduleKey === 'usersmgmt') setUserCompanyAccess(row.id, row.company);
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
  if (req.user.role !== 'Administrator') return res.status(403).json({ error: 'Only an Administrator can delete records' });

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
    if (isCompanyScoped(moduleKey) && !canManageRecordCompany(req.user.role, existing.rows[0].company)) {
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
