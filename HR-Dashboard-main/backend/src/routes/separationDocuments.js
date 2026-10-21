// PDF attachments for Separation records (one PDF per record).
//   GET    /api/separation/documents        -> list of attached PDFs (no file data)
//   GET    /api/separation/:id/document     -> the PDF itself
//   PUT    /api/separation/:id/document     -> attach / replace (raw PDF body)
//   DELETE /api/separation/:id/document     -> remove
const express = require('express');
const { pool } = require('../db');
const {
  canView,
  canEdit,
  canCreate,
  canAccessCompany,
  getRoleCompanies,
  ALL_COMPANY_IDS,
} = require('../config/roles');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per PDF

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// Same company rule used by the other record routes
const canTouchCompany = (user, company) =>
  (user.role === 'Administrator' && !company) ||
  (ALL_COMPANY_IDS.includes(company) && canAccessCompany(user, company));

const canAttach = (role) => canEdit(role, 'separation') || canCreate(role, 'separation');

async function loadRecord(id) {
  const { rows } = await pool.query(
    'SELECT id, company, employee_name FROM separation WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function audit(user, detail, company) {
  await pool.query(
    'INSERT INTO audit_log (user_name, role, module, action, detail, company) VALUES ($1,$2,$3,$4,$5,$6)',
    [user.name, user.role, 'separation', 'Updated', detail, company || null]
  );
}

const cleanFileName = (raw) => {
  let name = 'document.pdf';
  try { name = decodeURIComponent(String(raw || '')) || name; } catch { /* keep default */ }
  name = name.replace(/[\\/\r\n"]/g, '_').trim().slice(0, 150) || 'document.pdf';
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
};

// List (no file data) so the table can show which rows have a PDF
router.get('/documents', authenticate, async (req, res) => {
  if (!canView(req.user.role, 'separation')) return res.status(403).json({ error: 'Not permitted to view this module' });
  try {
    const companies = getRoleCompanies(req.user);
    const filtered = companies.length < ALL_COMPANY_IDS.length;
    const { rows } = await pool.query(
      `SELECT d.separation_id, d.file_name, d.file_size, d.uploaded_at
       FROM separation_documents d
       JOIN separation s ON s.id = d.separation_id
       ${filtered ? 'WHERE s.company = ANY($1::text[])' : ''}`,
      filtered ? [companies] : []
    );
    res.json({
      documents: rows.map((row) => ({
        recordId: row.separation_id,
        fileName: row.file_name,
        fileSize: row.file_size,
        uploadedAt: row.uploaded_at,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load PDFs' });
  }
});

// Open / download
router.get('/:id/document', authenticate, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid record' });
  if (!canView(req.user.role, 'separation')) return res.status(403).json({ error: 'Not permitted to view this module' });
  try {
    const record = await loadRecord(id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (!canTouchCompany(req.user, record.company)) return res.status(403).json({ error: 'Not permitted to access this company' });
    const { rows } = await pool.query(
      'SELECT file_name, content FROM separation_documents WHERE separation_id = $1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No PDF attached to this record' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].file_name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(rows[0].content);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load the PDF' });
  }
});

// Attach or replace (body = the raw PDF bytes)
router.put(
  '/:id/document',
  authenticate,
  express.raw({ type: () => true, limit: '5mb' }),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid record' });
    if (!canAttach(req.user.role)) return res.status(403).json({ error: 'Not permitted to attach PDFs here' });
    try {
      const record = await loadRecord(id);
      if (!record) return res.status(404).json({ error: 'Record not found' });
      if (!canTouchCompany(req.user, record.company)) return res.status(403).json({ error: 'Not permitted to access this company' });

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'Choose a PDF file.' });
      if (body.length > MAX_BYTES) return res.status(413).json({ error: 'The PDF must be 5 MB or smaller.' });
      if (body.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: 'This file is not a valid PDF.' });

      const fileName = cleanFileName(req.get('x-file-name'));
      await pool.query(
        `INSERT INTO separation_documents (separation_id, file_name, file_size, content, uploaded_by, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (separation_id) DO UPDATE
           SET file_name = EXCLUDED.file_name, file_size = EXCLUDED.file_size,
               content = EXCLUDED.content, uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now()`,
        [id, fileName, body.length, body, req.user.name]
      );
      await audit(req.user, `PDF attached to ${record.employee_name || `#${id}`}: ${fileName}`, record.company);
      res.json({ success: true, document: { recordId: id, fileName, fileSize: body.length } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to save the PDF' });
    }
  }
);

// Remove
router.delete('/:id/document', authenticate, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid record' });
  if (!canAttach(req.user.role)) return res.status(403).json({ error: 'Not permitted to remove PDFs here' });
  try {
    const record = await loadRecord(id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (!canTouchCompany(req.user, record.company)) return res.status(403).json({ error: 'Not permitted to access this company' });
    const result = await pool.query('DELETE FROM separation_documents WHERE separation_id = $1', [id]);
    if (result.rowCount) await audit(req.user, `PDF removed from ${record.employee_name || `#${id}`}`, record.company);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to remove the PDF' });
  }
});

module.exports = router;