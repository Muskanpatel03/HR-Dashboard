// Role -> permission map.
//
// Every real job Designation is now its OWN independently-editable access
// row (e.g. "SUPERVISOR", "SR. ENGINEER") — Access Control no longer works
// at the level of 6 broad buckets. The old conceptual roles (HR Manager,
// Plant Head, Recruiter, Finance & Accounts, Plant Operations, Management)
// are kept ONLY so any pre-existing user still holding one of those exact
// values keeps working unchanged — they are not offered for new
// assignments any more (see ASSIGNABLE_ROLES below, and frontend
// config.js/ModuleView.jsx which now always sets a user's role equal to
// their designation).
//
// DEFAULT_ROLES below is the SEED / offline-fallback shape only. The live,
// authoritative permissions live in the `role_permissions` table and are
// loaded into the in-memory STATE object at server startup (see
// loadRolesFromDb, called from server.js before the app starts listening).
// An Administrator can edit any role's permissions at runtime via
// GET/PUT /api/roles (backend/src/routes/roles.js) — those writes update
// both the DB (so they persist across restarts) and STATE (so every
// canView/canEdit check reflects the change immediately, no restart needed).
const { pool } = require('../db');

const ALL_COMPANY_IDS = [
  'Automat Industries (Site 4)',
  'Automat Irrigation',
  'Smith',
  'HO',
];

// Must match frontend/src/config.js's DESIGNATIONS list exactly (case is
// normalized to upper here, same as the frontend's DESIGNATIONS_DISPLAY,
// since that's the literal string stored in users.role once a user is
// assigned a designation).
const RAW_DESIGNATIONS = [
  'A.G.M', 'AREA MANAGER', 'Area Manager (Lanscape & Automation)', 'ASSISTANT',
  'ASSISTANT MANAGER', 'Assistant Technical Manager Automation',
  'ASST. MANAGER MARKETING', 'AUTOMATION TECHNICIAN', 'BLEDER', 'COORDINATOR',
  'Deputy General Manager', 'DEPUTY MANAGER', 'DEPUTY MANAGER MARKETING',
  'DESIGN ENGINEER', 'DESIGNER', 'DIRECTOR', 'DRIVER', 'ELECTRICIAN',
  'ENGINEER', 'EXECUTIVE', 'GENERAL MANAGER', 'GUARD', 'HELPER', 'HOD',
  'INSPECTOR', 'Junior Executive', 'JUNIOR TECHNICIAN', 'LAB ASSISTANT',
  'LAB INCHARGE', 'MANAGER', 'MANAGING DIRECTOR', 'Mgt.-Trainee',
  'OFFICER SECURITY', 'OPERATOR', 'PAINTER', 'Peon', 'PLUMBER', 'PRESIDENT',
  'QUALITY INSPECTOR', 'Receptionist', 'REGIONAL MANAGER',
  'RESPONSE EXECUTIVE', 'SALES CORDINATOR', 'Sales Engineer',
  'Sales Engineer (Smart Irrigation)', 'SALES EXECUTIVE', 'Sales Head',
  'Sales Technician', 'Sales Technician (Automation)', 'Site Supervisor',
  'Site Supervisor ( Automation)', 'Sn.Supervisor', 'SR. AUTOMATION TECHNICIAN',
  'Sr. Designer', 'SR. ENGINEER', 'SR. EXECUTIVE', 'SR. MANAGER',
  'Sr. Sales Coordinator', 'Sr. Site Supervisor', 'Sr. Technician',
  'STORE ASSISTANT', 'STORE EXECUTIVE', 'SUPERVISOR', 'TEAM MEMBER -IB',
  'TECHNICIAN', 'Technician cum Driver', 'Territory Manager', 'WORKER',
  'Zonal Head', 'ZONAL MANAGER',
];
const DESIGNATIONS = RAW_DESIGNATIONS.map((d) => d.toUpperCase());

// Starting permission templates each designation is seeded from ONCE on
// first boot — after that, the DB/Access Control UI is authoritative and
// each designation is edited completely independently of the others.
const BASE_CATEGORY_PERMS = {
  Management: { modules: 'all', edit: [] },
  'Plant Head': {
    modules: ['dashboard', 'manpower', 'attendance', 'engagement', 'healthcheck', 'retirement', 'training', 'license', 'Compliances/Agreements'],
    edit: ['manpower', 'attendance', 'engagement', 'healthcheck', 'training', 'license', 'Compliances/Agreements'],
  },
  'Plant Operations': {
    modules: ['dashboard', 'electricity', 'canteen', 'attendance', 'training', 'license', 'Compliances/Agreements'],
    edit: ['electricity', 'canteen', 'attendance', 'training', 'license', 'Compliances/Agreements'],
  },
};

// Keyword → starting category, checked top to bottom, first match wins.
// The final entry matches everything, so every designation gets a sane
// starting point even if no earlier keyword applies.
const DESIGNATION_ROLE_HINTS = [
  [/^DIRECTOR$|MANAGING DIRECTOR|PRESIDENT/, 'Management'],
  [/GENERAL MANAGER|REGIONAL MANAGER|ZONAL|TERRITORY MANAGER|\bHOD\b|SALES HEAD|MANAGER|\bA\.?G\.?M\b/, 'Plant Head'],
  [/.*/, 'Plant Operations'],
];

function categoryForDesignation(designation) {
  const hit = DESIGNATION_ROLE_HINTS.find(([re]) => re.test(designation));
  return hit ? hit[1] : 'Plant Operations';
}

const DESIGNATION_ROLES = {};
DESIGNATIONS.forEach((d) => {
  const base = BASE_CATEGORY_PERMS[categoryForDesignation(d)];
  DESIGNATION_ROLES[d] = {
    modules: base.modules === 'all' ? 'all' : [...base.modules],
    create: base.edit === 'all' ? 'all' : [...base.edit],
    edit: base.edit === 'all' ? 'all' : [...base.edit],
  };
});

// Full data-entry access for the specific HR/Director role assignments used
// by the four company-scoped data-entry accounts. User-level company access
// still limits each account to its assigned company.
const COMPANY_DATA_MODULES = [
  'dashboard', 'manpower', 'recruitment', 'hiring', 'separation',
  'loanSummary', 'retirement', 'electricity', 'canteen', 'healthcheck',
  'engagement', 'training', 'attendance', 'license',
  'Compliances/Agreements', 'operationMatrix',
];

const DEFAULT_ROLES = {
  // IT / system owner — full access to every module including Audit Trail
  // and Access Control itself. Pre-created only via `npm run create-admin`.
  // Cannot be edited via the Access Control UI — see PROTECTED_ROLES below,
  // to make it impossible to lock every admin out of the system.
  Administrator: { modules: 'all', edit: 'all', delete: 'all' },

  // Legacy conceptual roles — kept ONLY for accounts that were assigned one
  // of these before the switch to per-designation access. Not offered as a
  // choice for new users any more.
  'HR Manager': {
    modules: ['dashboard', 'manpower', 'recruitment', 'hiring', 'separation', 'retirement', 'healthcheck', 'engagement', 'training', 'attendance', 'license', 'Compliances/Agreements'],
    edit: ['manpower', 'recruitment', 'hiring', 'separation', 'retirement', 'healthcheck', 'engagement', 'training', 'attendance', 'license', 'Compliances/Agreements'],
  },
  'Plant Head': BASE_CATEGORY_PERMS['Plant Head'],
  Recruiter: { modules: ['dashboard', 'recruitment', 'hiring'], edit: ['recruitment', 'hiring'] },
  'Finance & Accounts': { modules: ['dashboard', 'loanSummary', 'electricity', 'canteen'], edit: ['loanSummary', 'electricity', 'canteen'] },
  'Plant Operations': BASE_CATEGORY_PERMS['Plant Operations'],
  Management: BASE_CATEGORY_PERMS['Management'],

  // Public self-signup default. NEVER assignable by anyone — the only way
  // an account gets this role is through POST /api/auth/register, which
  // hardcodes it server-side regardless of what the client sends.
  Viewer: {
    modules: ['dashboard', 'manpower', 'recruitment', 'hiring', 'separation', 'retirement', 'electricity', 'canteen', 'healthcheck', 'engagement', 'training', 'attendance', 'license', 'Compliances/Agreements'],
    edit: [],
  },

  // One independently-editable row per real job Designation.
  ...DESIGNATION_ROLES,
};

DEFAULT_ROLES.HR = {
  modules: [...COMPANY_DATA_MODULES],
  create: [...COMPANY_DATA_MODULES],
  edit: [...COMPANY_DATA_MODULES],
  delete: [...COMPANY_DATA_MODULES],
};
DEFAULT_ROLES.DIRECTOR = {
  modules: [...COMPANY_DATA_MODULES],
  create: [...COMPANY_DATA_MODULES],
  edit: [...COMPANY_DATA_MODULES],
  delete: [...COMPANY_DATA_MODULES],
};

Object.values(DEFAULT_ROLES).forEach((permissions) => {
  if (permissions.create === undefined) {
    permissions.create = Array.isArray(permissions.edit) ? [...permissions.edit] : permissions.edit;
  }
  if (permissions.delete === undefined) permissions.delete = [];
});

// Every module key the app knows about — used to build the Access Control
// checkbox matrix and to validate PUT /api/roles payloads. Keep in sync
// with backend/src/config/modules.js + the frontend/backend nav lists.
const ALL_MODULE_KEYS = [
  'dashboard',
  'manpower',
  'recruitment',
  'hiring',
  'separation',
  'loanSummary',
  'retirement',
  'electricity',
  'canteen',
  'healthcheck',
  'engagement',
  'training',
  'attendance',
  'license',
  'Compliances/Agreements',
  'operationMatrix',
  'usersmgmt',
  'audit',
  'roles',
];

// Roles whose permissions can NEVER be edited via the Access Control UI —
// guarantees there is always at least one role with full access, so an
// Administrator can never accidentally lock themselves (or everyone) out.
const PROTECTED_ROLES = ['Administrator'];

// Only Administrator may manage login accounts (the "usersmgmt" module) or
// role permissions themselves (the "roles" module) — enforced here, not
// just hidden in the UI, regardless of what any role's stored permissions say.
const PRIVILEGED_ROLE_MANAGERS = ['Administrator'];

// Roles an Administrator is allowed to hand out via User Management. Now
// just Administrator + every Designation — the 6 legacy conceptual roles
// are excluded here (still valid, still enforced, just not offered for new
// assignments; see the comment on DEFAULT_ROLES above).
const ASSIGNABLE_ROLES = ['Administrator', ...DESIGNATIONS];

// Live, mutable permission state — seeded from DEFAULT_ROLES, overwritten by
// loadRolesFromDb() at boot, and kept in sync by setRolePermissions().
let STATE = JSON.parse(JSON.stringify(DEFAULT_ROLES));
const USER_COMPANY_ACCESS = new Map();

async function loadUserCompanyAccess() {
  const { rows } = await pool.query('SELECT id, company, company_access FROM users');
  USER_COMPANY_ACCESS.clear();
  rows.forEach(({ id, company, company_access }) => {
    const companies = Array.isArray(company_access) && company_access.length
      ? company_access
      : (company ? [company] : []);
    if (companies.length) USER_COMPANY_ACCESS.set(Number(id), companies);
  });
}

function setUserCompanyAccess(userId, companies) {
  const companyList = Array.isArray(companies) ? companies : (companies ? [companies] : []);
  if (companyList.length) USER_COMPANY_ACCESS.set(Number(userId), companyList);
  else USER_COMPANY_ACCESS.delete(Number(userId));
}

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

function canCreate(role, moduleKey) {
  if (moduleKey === 'usersmgmt' || moduleKey === 'roles') return PRIVILEGED_ROLE_MANAGERS.includes(role);
  const perm = STATE[role];
  if (!perm) return false;
  return perm.create === 'all' || (Array.isArray(perm.create) && perm.create.includes(moduleKey));
}

function canDelete(role, moduleKey) {
  if (moduleKey === 'usersmgmt' || moduleKey === 'roles' || moduleKey === 'audit') {
    return PRIVILEGED_ROLE_MANAGERS.includes(role);
  }
  const perm = STATE[role];
  if (!perm) return false;
  return perm.delete === 'all' || (Array.isArray(perm.delete) && perm.delete.includes(moduleKey));
}

function canAccessCompany(role, company) {
  const roleName = typeof role === 'object' && role ? role.role : role;
  const perm = STATE[roleName];
  return Boolean(perm && getRoleCompanies(role).includes(company));
}

function getRoleCompanies(roleOrUser) {
  const user = typeof roleOrUser === 'object' && roleOrUser ? roleOrUser : null;
  const role = user ? user.role : roleOrUser;
  const companies = STATE[role]?.companies;
  const roleCompanies = Array.isArray(companies) ? companies : [...ALL_COMPANY_IDS];
  if (!user || role === 'Administrator') return roleCompanies;
  const assignedCompany = Array.isArray(user.company_access) && user.company_access.length
    ? user.company_access
    : USER_COMPANY_ACCESS.get(Number(user.id));
  return Array.isArray(assignedCompany)
    ? assignedCompany.filter((company) => roleCompanies.includes(company))
    : (assignedCompany && roleCompanies.includes(assignedCompany) ? [assignedCompany] : []);
}

// Returns the full live permission matrix, e.g. for the Access Control page
// and for embedding a user's own effective access in login/me responses.
function getRoleMatrix() {
  return JSON.parse(JSON.stringify(STATE));
}

function getRoleAccess(roleOrUser) {
  const roleName = typeof roleOrUser === 'object' && roleOrUser ? roleOrUser.role : roleOrUser;
  const permissions = STATE[roleName] || { modules: [], create: [], edit: [], delete: [] };
  return { ...permissions, companies: getRoleCompanies(roleOrUser) };
}

// Loads persisted permissions from the DB into STATE at startup. If a role
// has no row yet (first run, or a role added to DEFAULT_ROLES later), seeds
// it from DEFAULT_ROLES so behaviour is unchanged until an admin edits it.
async function loadRolesFromDb() {
  try {
    const { rows } = await pool.query('SELECT role, modules, create_modules, edit, delete_modules, company_access FROM role_permissions');
    const fromDb = {};
    rows.forEach((r) => {
      fromDb[r.role] = {
        modules: r.modules,
        create: r.create_modules || r.edit,
        edit: r.edit,
        delete: r.delete_modules || [],
        companies: Array.isArray(r.company_access) ? r.company_access : [...ALL_COMPANY_IDS],
      };
    });

    const merged = {};
    const missing = [];
    Object.keys(DEFAULT_ROLES).forEach((role) => {
      if (fromDb[role]) {
        merged[role] = fromDb[role];
      } else {
        merged[role] = { ...DEFAULT_ROLES[role], companies: [...ALL_COMPANY_IDS] };
        missing.push(role);
      }
    });

    STATE = merged;

    // Seed any missing rows so future edits persist correctly.
    for (const role of missing) {
      await pool.query(
        `INSERT INTO role_permissions (role, modules, create_modules, edit, delete_modules, company_access) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (role) DO NOTHING`,
        [role, JSON.stringify(DEFAULT_ROLES[role].modules), JSON.stringify(DEFAULT_ROLES[role].create), JSON.stringify(DEFAULT_ROLES[role].edit), JSON.stringify(DEFAULT_ROLES[role].delete), JSON.stringify(ALL_COMPANY_IDS)]
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
async function setRolePermissions(role, { modules, create, edit, delete: deleteModules, companies }) {
  if (!DEFAULT_ROLES[role]) throw new Error(`Unknown role: ${role}`);
  if (PROTECTED_ROLES.includes(role)) throw new Error(`${role} permissions cannot be changed`);

  const cleanList = (val) => {
    if (val === 'all') return 'all';
    if (!Array.isArray(val)) throw new Error('modules/create/edit/delete must be an array or "all"');
    const invalid = val.filter((m) => !ALL_MODULE_KEYS.includes(m));
    if (invalid.length) throw new Error(`Unknown module key(s): ${invalid.join(', ')}`);
    return [...new Set(val)];
  };

  const cleanModules = cleanList(modules);
  let cleanCreate = cleanList(create === undefined ? edit : create);
  let cleanEdit = cleanList(edit);
  let cleanDelete = cleanList(deleteModules === undefined ? [] : deleteModules);
  // usersmgmt and roles are always Administrator-only, no matter what an
  // admin sets here for another role — strip them defensively.
  if (Array.isArray(cleanCreate)) cleanCreate = cleanCreate.filter((m) => m !== 'usersmgmt' && m !== 'roles');
  if (Array.isArray(cleanEdit)) cleanEdit = cleanEdit.filter((m) => m !== 'usersmgmt' && m !== 'roles');
  if (Array.isArray(cleanDelete)) cleanDelete = cleanDelete.filter((m) => !['usersmgmt', 'roles', 'audit'].includes(m));
  if (Array.isArray(cleanModules)) {
    if (Array.isArray(cleanCreate)) cleanCreate = cleanCreate.filter((m) => cleanModules.includes(m));
    if (Array.isArray(cleanEdit)) cleanEdit = cleanEdit.filter((m) => cleanModules.includes(m));
    if (Array.isArray(cleanDelete)) cleanDelete = cleanDelete.filter((m) => cleanModules.includes(m));
  }

  if (!Array.isArray(companies)) throw new Error('companies must be an array');
  const invalidCompanies = companies.filter((company) => !ALL_COMPANY_IDS.includes(company));
  if (invalidCompanies.length) throw new Error(`Unknown company access value(s): ${invalidCompanies.join(', ')}`);
  const cleanCompanies = [...new Set(companies)];

  await pool.query(
    `INSERT INTO role_permissions (role, modules, create_modules, edit, delete_modules, company_access, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (role) DO UPDATE SET modules = $2, create_modules = $3, edit = $4, delete_modules = $5, company_access = $6, updated_at = now()`,
    [role, JSON.stringify(cleanModules), JSON.stringify(cleanCreate), JSON.stringify(cleanEdit), JSON.stringify(cleanDelete), JSON.stringify(cleanCompanies)]
  );

  STATE[role] = { modules: cleanModules, create: cleanCreate, edit: cleanEdit, delete: cleanDelete, companies: cleanCompanies };
  return STATE[role];
}

// Ensures a role row exists for a custom (free-typed) designation, seeded
// from the Plant Operations defaults — used when User Management creates an
// account with a designation that is not on the master list. The new
// designation then appears in Access Control as its own editable row.
async function ensureRoleForDesignation(designation) {
  const name = String(designation || '').trim().toUpperCase();
  if (!name || DEFAULT_ROLES[name] || ASSIGNABLE_ROLES.includes(name)) return;
  const seed = BASE_CATEGORY_PERMS['Plant Operations'];
  DEFAULT_ROLES[name] = {
    modules: Array.isArray(seed.modules) ? [...seed.modules] : seed.modules,
    create: Array.isArray(seed.create) ? [...seed.create] : (seed.create || []),
    edit: Array.isArray(seed.edit) ? [...seed.edit] : (seed.edit || []),
    delete: [],
    companies: [...ALL_COMPANY_IDS],
  };
  ASSIGNABLE_ROLES.push(name);
  await pool.query(
    `INSERT INTO role_permissions (role, modules, create_modules, edit, delete_modules, company_access)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (role) DO NOTHING`,
    [name,
     JSON.stringify(DEFAULT_ROLES[name].modules),
     JSON.stringify(DEFAULT_ROLES[name].create),
     JSON.stringify(DEFAULT_ROLES[name].edit),
     JSON.stringify(DEFAULT_ROLES[name].delete),
     JSON.stringify(ALL_COMPANY_IDS)]
  ).catch(() => { /* schema not ready yet — in-memory state still works */ });
  STATE[name] = JSON.parse(JSON.stringify(DEFAULT_ROLES[name]));
}

module.exports = {
  ROLES: DEFAULT_ROLES, // kept for anything importing the static shape/fallback
  DESIGNATIONS,
  ALL_MODULE_KEYS,
  ALL_COMPANY_IDS,
  PROTECTED_ROLES,
  ASSIGNABLE_ROLES,
  ensureRoleForDesignation,
  canView,
  canCreate,
  canEdit,
  canDelete,
  canAccessCompany,
  getRoleCompanies,
  getRoleMatrix,
  getRoleAccess,
  loadUserCompanyAccess,
  setUserCompanyAccess,
  loadRolesFromDb,
  setRolePermissions,
};
