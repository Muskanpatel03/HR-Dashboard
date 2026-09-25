// Generic CRUD + audit logging for every HR MIS module.
// Columns come only from the static MODULES config (never from client input),
// so building SQL with template strings for column/table names here is safe.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { MODULES } = require('../config/modules');
const { canView, canEdit, ASSIGNABLE_ROLES } = require('../config/roles');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

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
  columns.forEach((c) => { out[c.js] = dbRow[c.db]; });
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

async function logAudit(client, { user, moduleKey, action, detail }) {
  await client.query(
    'INSERT INTO audit_log (user_name, role, module, action, detail) VALUES ($1,$2,$3,$4,$5)',
    [user.name, user.role, moduleKey, action, detail]
  );
}

router.get('/:module', async (req, res) => {
  const { module: moduleKey } = req.params;
  const conf = MODULES[moduleKey];
  if (!conf) return res.status(404).json({ error: 'Unknown module' });
  if (!canView(req.user.role, moduleKey)) return res.status(403).json({ error: 'Not permitted to view this module' });
  try {
    const cols = conf.columns.map((c) => c.db).join(', ');
    const result = await pool.query(`SELECT id, ${cols} FROM ${conf.table} ORDER BY id DESC`);
    res.json({ records: result.rows.map((row) => toJsRow(row, conf.columns)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load records' });
  }
});

router.post('/:module', async (req, res) => {
  const { module: moduleKey } = req.params;
  const conf = MODULES[moduleKey];
  if (!conf) return res.status(404).json({ error: 'Unknown module' });
  if (!canEdit(req.user.role, moduleKey)) return res.status(403).json({ error: 'Not permitted to add records here' });
  if (moduleKey === 'usersmgmt' && !ASSIGNABLE_ROLES.includes(req.body.role)) {
    return res.status(400).json({ error: 'That role cannot be assigned. Viewer accounts are self-signup only.' });
  }

  const client = await pool.connect();
  try {
    const dbCols = conf.columns.map((c) => c.db);
    const values = conf.columns.map((c) => normalizeValue(req.body[c.js], c.type));
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
    const row = toJsRow(result.rows[0], conf.columns);
    await logAudit(client, { user: req.user, moduleKey, action: 'Created', detail: summarize(result.rows[0], conf.columns) });
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
  if (!canEdit(req.user.role, moduleKey)) return res.status(403).json({ error: 'Not permitted to edit records here' });
  if (moduleKey === 'usersmgmt' && !ASSIGNABLE_ROLES.includes(req.body.role)) {
    return res.status(400).json({ error: 'That role cannot be assigned. Viewer accounts are self-signup only.' });
  }

  const client = await pool.connect();
  try {
    const setParts = conf.columns.map((c, i) => `${c.db} = $${i + 1}`);
    const values = conf.columns.map((c) => normalizeValue(req.body[c.js], c.type));
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
      `SELECT id, ${conf.columns.map((c) => c.db).join(', ')} FROM ${conf.table} WHERE id = $1`,
      [id]
    );
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Record not found' });
    }
    const result = await client.query(
      `UPDATE ${conf.table} SET ${setClause} WHERE id = $${params.length} RETURNING id, ${conf.columns.map((c) => c.db).join(', ')}`,
      params
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Record not found' });
    }
       const row = toJsRow(result.rows[0], conf.columns);
    await logAudit(client, { user: req.user, moduleKey, action: 'Updated', detail: diffDetail(before.rows[0], result.rows[0], conf.columns) });
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
  if (!canEdit(req.user.role, moduleKey)) return res.status(403).json({ error: 'Not permitted to delete records here' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, ${conf.columns.map((c) => c.db).join(', ')} FROM ${conf.table} WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Record not found' });
    }
    await client.query(`DELETE FROM ${conf.table} WHERE id = $1`, [id]);
    await logAudit(client, { user: req.user, moduleKey, action: 'Deleted', detail: summarize(existing.rows[0], conf.columns) });
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
