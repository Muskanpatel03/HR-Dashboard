// PDF / document attachments for Legal Documents (license) records.
//   GET    /api/license/documents        -> list of attached docs (no file data)
//   GET    /api/license/:id/document     -> the file itself
//   PUT    /api/license/:id/document     -> attach / replace (raw file body)
//   DELETE /api/license/:id/document     -> remove
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
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTENSIONS = /\.(pdf|jpg|jpeg|png|webp|doc|docx)$/i;

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const canTouchCompany = (user, company) =>
  (user.role === 'Administrator' && !company) ||
  (ALL_COMPANY_IDS.includes(company) && canAccessCompany(user, company));

const canAttach = (role) => canEdit(role, 'license') || canCreate(role, 'license');

async function loadRecord(id) {
  const { rows } = await pool.query(
    'SELECT id, company, license_name FROM licenses WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function audit(user, detail, company) {
  await pool.query(
    'INSERT INTO audit_log (user_name, role, module, action, detail, company) VALUES ($1,$2,$3,$4,$5,$6)',
    [user.name, user.role, 'license', 'Updated', detail, company || null]
  );
}

const cleanFileName = (raw) => {
  let name = 'document';
  try { name = decodeURIComponent(String(raw || '')) || name; } catch { /* keep default */ }
  name = name.replace(/[\\/\r\n"]/g, '_').trim().slice(0, 150) || 'document';
  return name;
};

// Detect MIME type for the Content-Type response header
function mimeForFileName(name) {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.docx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.doc$/i.test(name)) return 'application/msword';
  return 'application/octet-stream';
}

// List (no file data) so the table can show which rows have a document
router.get('/documents', authenticate, async (req, res) => {
  if (!canView(req.user.role, 'license')) return res.status(403).json({ error: 'Not permitted to view this module' });
  try {
    const companies = getRoleCompanies(req.user);
    const filtered = companies.length < ALL_COMPANY_IDS.length;
    const { rows } = await pool.query(
      `SELECT d.license_id, d.file_name, d.file_size, d.uploaded_at
       FROM license_documents d
       JOIN licenses l ON l.id = d.license_id
       ${filtered ? 'WHERE l.company = ANY($1::text[])' : ''}`,
      filtered ? [companies] : []
    );
    res.json({
      documents: rows.map((row) => ({
        recordId: row.license_id,
        fileName: row.file_name,
        fileSize: row.file_size,
        uploadedAt: row.uploaded_at,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// Open / download
router.get('/:id/document', authenticate, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid record' });
  if (!canView(req.user.role, 'license')) return res.status(403).json({ error: 'Not permitted to view this module' });
  try {
    const record = await loadRecord(id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (!canTouchCompany(req.user, record.company)) return res.status(403).json({ error: 'Not permitted to access this company' });
    const { rows } = await pool.query(
      'SELECT file_name, content FROM license_documents WHERE license_id = $1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No document attached to this record' });
    const mime = mimeForFileName(rows[0].file_name);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].file_name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(rows[0].content);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load the document' });
  }
});

// Attach or replace (body = the raw file bytes)
router.put(
  '/:id/document',
  authenticate,
  express.raw({ type: () => true, limit: '10mb' }),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid record' });
    if (!canAttach(req.user.role)) return res.status(403).json({ error: 'Not permitted to attach documents here' });
    try {
      const record = await loadRecord(id);
      if (!record) return res.status(404).json({ error: 'Record not found' });
      if (!canTouchCompany(req.user, record.company)) return res.status(403).json({ error: 'Not permitted to access this company' });

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'Choose a file to upload.' });
      if (body.length > MAX_BYTES) return res.status(413).json({ error: 'The file must be 10 MB or smaller.' });

      const fileName = cleanFileName(req.get('x-file-name'));
      if (!ALLOWED_EXTENSIONS.test(fileName)) {
        return res.status(400).json({ error: 'Allowed file types: PDF, JPG, PNG, WEBP, DOC, DOCX.' });
      }

      await pool.query(
        `INSERT INTO license_documents (license_id, file_name, file_size, content, uploaded_by, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (license_id) DO UPDATE
           SET file_name = EXCLUDED.file_name, file_size = EXCLUDED.file_size,
               content = EXCLUDED.content, uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now()`,
        [id, fileName, body.length, body, req.user.name]
      );
      await audit(req.user, `Document attached to ${record.license_name || `#${id}`}: ${fileName}`, record.company);
      res.json({ success: true, document: { recordId: id, fileName, fileSize: body.length } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to save the document' });
    }
  }
);

// Remove
router.delete('/:id/document', authenticate, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid record' });
  if (!canAttach(req.user.role)) return res.status(403).json({ error: 'Not permitted to remove documents here' });
  try {
    const record = await loadRecord(id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (!canTouchCompany(req.user, record.company)) return res.status(403).json({ error: 'Not permitted to access this company' });
    const result = await pool.query('DELETE FROM license_documents WHERE license_id = $1', [id]);
    if (result.rowCount) await audit(req.user, `Document removed from ${record.license_name || `#${id}`}`, record.company);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to remove the document' });
  }
});

module.exports = router;
