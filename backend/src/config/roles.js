// Role -> permission map.
//
// DEFAULT_ROLES below is the SEED / offline-fallback shape only. The live,
// authoritative permissions live in the `role_permissions` table and are
// loaded into the in-memory STATE object at server startup (see
// loadRolesFromDb, called from server.js before the app starts listening).
// An Administrator can edit any role's permissions at runtime via
// GET/PUT /api/roles (backend/src/routes/roles.js) — those writes update
// both the DB (so they persist across restarts) and STATE (so every
// canView/canEdit check reflects the change immediately, no restart needed).
//
// This keeps canView/canEdit synchronous and cheap (no DB round-trip per
// request) while still being fully admin-manageable.
const { pool } = require('../db');

const DEFAULT_ROLES = {
  // IT / system owner — full access to every module including Audit Trail
  // and Access Control itself. Pre-created only via `npm run create-admin`.
  // Cannot be edited via the Access Control UI — see PROTECTED_ROLES below,
  // to make it impossible to lock every admin out of the system.
  Administrator: { modules: 'all', edit: 'all' },

  'HR Manager': {
    modules: ['dashboard', 'manpower', 'recruitment', 'hiring', 'separation', 'loans', 'retirement', 'healthcheck', 'engagement', 'attendance', 'usersmgmt'],
    edit: ['manpower', 'recruitment', 'hiring', 'separation', 'loans', 'retirement', 'healthcheck', 'engagement', 'attendance'],
  },

  'Plant Head': {
    modules: ['dashboard', 'manpower', 'attendance', 'engagement', 'healthcheck', 'retirement'],
    edit: ['manpower', 'attendance', 'engagement', 'healthcheck'],
  },

  Recruiter: {
    modules: ['dashboard', 'recruitment', 'hiring'],
    edit: ['recruitment', 'hiring'],
  },

  'Finance & Accounts': {
    modules: ['dashboard', 'loans', 'loanSummary', 'electricity', 'canteen'],
    edit: ['loans', 'loanSummary', 'electricity', 'canteen'],
  },

  'Plant Operations': {
    modules: ['dashboard', 'electricity', 'canteen', 'attendance'],
    edit: ['electricity', 'canteen', 'attendance'],
  },

  // Directors / owners — see everything, change nothing.
  Management: { modules: 'all', edit: [] },

  // Public self-signup default. NEVER assignable by anyone — the only way
  // an account gets this role is through POST /api/auth/register, which
  // hardcodes it server-side regardless of what the client sends.
  // An Administrator controls exactly which modules are "public" (visible
  // to Viewer) by editing this row in Access Control — everything else in
  // the app stays private by default.
  Viewer: {
    modules: ['dashboard', 'manpower', 'recruitment', 'hiring', 'separation', 'loans', 'retirement', 'electricity', 'canteen', 'healthcheck', 'engagement', 'attendance'],
    edit: [],
  },
};

// Every module key the app knows about — used to build the Access Control
// checkbox matrix and to validate PUT /api/roles payloads. Keep in sync
// with backend/src/config/modules.js + the frontend/backend nav lists.
const ALL_MODULE_KEYS = [
  'dashboard', 'manpower', 'recruitment', 'hiring', 'separation', 'loans',
  'loanSummary', 'retirement', 'electricity', 'canteen', 'healthcheck',
  'engagement', 'attendance', 'usersmgmt', 'audit', 'roles',
];

// Roles whose permissions can NEVER be edited via the Access Control UI —
// guarantees there is always at least one role with full access, so an
// Administrator can never accidentally lock themselves (or everyone) out.
const PROTECTED_ROLES = ['Administrator'];

// Only Administrator may manage login accounts (the "usersmgmt" module) or
// role permissions themselves (the "roles" module) — enforced here, not
// just hidden in the UI, regardless of what any role's stored permissions say.
const PRIVILEGED_ROLE_MANAGERS = ['Administrator'];

// Roles an Administrator is allowed to hand out via User Management.
// "Viewer" is deliberately excluded — it is only ever granted by self-signup.
const ASSIGNABLE_ROLES = Object.keys(DEFAULT_ROLES).filter((r) => r !== 'Viewer');

// Live, mutable permission state — seeded from DEFAULT_ROLES, overwritten by
// loadRolesFromDb() at boot, and kept in sync by setRolePermissions().
let STATE = JSON.parse(JSON.stringify(DEFAULT_ROLES));

function canView(role, moduleKey) {
  if (moduleKey === 'roles') return PRIVILEGED_ROLE_MANAGERS.includes(role);
  const perm = STATE[role];
  if (!perm) return false;
  return perm.modules === 'all' || perm.modules.includes(moduleKey);
}

function canEdit(role, moduleKey) {
  if (moduleKey === 'usersmgmt' || moduleKey === 'roles') return PRIVILEGED_ROLE_MANAGERS.includes(role);
  const perm = STATE[role];
  if (!perm) return false;
  return perm.edit === 'all' || (Array.isArray(perm.edit) && perm.edit.includes(moduleKey));
}

// Returns the full live permission matrix, e.g. for the Access Control page
// and for embedding a user's own effective access in login/me responses.
function getRoleMatrix() {
  return JSON.parse(JSON.stringify(STATE));
}

function getRoleAccess(role) {
  return STATE[role] || STATE.Management || { modules: [], edit: [] };
}

// Loads persisted permissions from the DB into STATE at startup. If a role
// has no row yet (first run, or a role added to DEFAULT_ROLES later), seeds
// it from DEFAULT_ROLES so behaviour is unchanged until an admin edits it.
async function loadRolesFromDb() {
  try {
    const { rows } = await pool.query('SELECT role, modules, edit FROM role_permissions');
    const fromDb = {};
    rows.forEach((r) => { fromDb[r.role] = { modules: r.modules, edit: r.edit }; });

    const merged = {};
    const missing = [];
    Object.keys(DEFAULT_ROLES).forEach((role) => {
      if (fromDb[role]) {
        merged[role] = fromDb[role];
      } else {
        merged[role] = DEFAULT_ROLES[role];
        missing.push(role);
      }
    });

    STATE = merged;

    // Seed any missing rows so future edits persist correctly.
    for (const role of missing) {
      await pool.query(
        `INSERT INTO role_permissions (role, modules, edit) VALUES ($1, $2, $3)
         ON CONFLICT (role) DO NOTHING`,
        [role, JSON.stringify(DEFAULT_ROLES[role].modules), JSON.stringify(DEFAULT_ROLES[role].edit)]
      );
    }
  } catch (e) {
    // If the table doesn't exist yet (schema.sql not re-run) or the DB is
    // briefly unreachable, fall back to the static defaults rather than
    // crashing the server on boot.
    console.error('Could not load role_permissions from DB — using built-in defaults:', e.message);
    STATE = JSON.parse(JSON.stringify(DEFAULT_ROLES));
  }
}

// Persists + applies an edit to one role's permissions. Throws on an invalid
// role/module so the route layer can turn that into a 400.
async function setRolePermissions(role, { modules, edit }) {
  if (!DEFAULT_ROLES[role]) throw new Error(`Unknown role: ${role}`);
  if (PROTECTED_ROLES.includes(role)) throw new Error(`${role} permissions cannot be changed`);

  const cleanList = (val) => {
    if (val === 'all') return 'all';
    if (!Array.isArray(val)) throw new Error('modules/edit must be an array or "all"');
    const invalid = val.filter((m) => !ALL_MODULE_KEYS.includes(m));
    if (invalid.length) throw new Error(`Unknown module key(s): ${invalid.join(', ')}`);
    return [...new Set(val)];
  };

  const cleanModules = cleanList(modules);
  let cleanEdit = cleanList(edit);
  // usersmgmt and roles are always Administrator-only, no matter what an
  // admin sets here for another role — strip them defensively.
  if (Array.isArray(cleanEdit)) cleanEdit = cleanEdit.filter((m) => m !== 'usersmgmt' && m !== 'roles');

  await pool.query(
    `INSERT INTO role_permissions (role, modules, edit, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (role) DO UPDATE SET modules = $2, edit = $3, updated_at = now()`,
    [role, JSON.stringify(cleanModules), JSON.stringify(cleanEdit)]
  );

  STATE[role] = { modules: cleanModules, edit: cleanEdit };
  return STATE[role];
}

module.exports = {
  ROLES: DEFAULT_ROLES, // kept for anything importing the static shape/fallback
  ALL_MODULE_KEYS,
  PROTECTED_ROLES,
  ASSIGNABLE_ROLES,
  canView,
  canEdit,
  getRoleMatrix,
  getRoleAccess,
  loadRolesFromDb,
  setRolePermissions,
};
