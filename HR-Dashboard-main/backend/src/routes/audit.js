const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { canView, getRoleCompanies, ALL_COMPANY_IDS } = require('../config/roles');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  if (!canView(req.user.role, 'audit')) {
    return res.status(403).json({ error: 'Not permitted to view the audit trail' });
  }
  try {
    const companies = getRoleCompanies(req.user.role);
    const restricted = companies.length < ALL_COMPANY_IDS.length;
    const result = await pool.query(
      `SELECT id, time, user_name, role, module, action, detail
       FROM audit_log
       ${restricted ? 'WHERE company = ANY($1::text[])' : ''}
       ORDER BY time DESC LIMIT 300`,
      restricted ? [companies] : []
    );
    
    res.json({ audit: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load audit trail' });
  }
});

module.exports = router;
