// GET/PUT /api/roles — Administrator-only Access Control API.
// Lets an admin see and change exactly which modules each role can view
// and edit, without touching code. Every other route (records.js,
// dashboard.js) already reads permissions through canView/canEdit in
// config/roles.js, so a change here takes effect everywhere immediately.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getRoleMatrix,
  setRolePermissions,
  ALL_MODULE_KEYS,
  ALL_COMPANY_IDS,
  PROTECTED_ROLES,
  ASSIGNABLE_ROLES,
} = require('../config/roles');

const router = express.Router();
router.use(authenticate);

function requireAdmin(req, res, next) {
  if (req.user.role !== 'Administrator') {
    return res.status(403).json({ error: 'Only an Administrator can manage role permissions' });
  }
  next();
}

router.get('/', requireAdmin, (req, res) => {
  res.json({
    roles: getRoleMatrix(),
    allModules: ALL_MODULE_KEYS,
    allCompanies: ALL_COMPANY_IDS,
    protectedRoles: PROTECTED_ROLES,
    assignableRoles: ASSIGNABLE_ROLES,
  });
});

function normalizeRoleName(role) {
  if (typeof role !== 'string') return '';
  return decodeURIComponent(role.trim());
}

router.put('/', requireAdmin, async (req, res) => {
  const { role, modules, create, edit, companies } = req.body || {};
  const cleanRole = normalizeRoleName(role);

  if (!cleanRole) {
    return res.status(400).json({ error: 'Role is required' });
  }

  try {
    const updated = await setRolePermissions(cleanRole, { modules, create, edit, companies });
    res.json({ role: cleanRole, ...updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:role', requireAdmin, async (req, res) => {
  const role = normalizeRoleName(req.params.role);
  const { modules, create, edit, companies } = req.body || {};

  try {
    const updated = await setRolePermissions(role, { modules, create, edit, companies });
    res.json({ role, ...updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
