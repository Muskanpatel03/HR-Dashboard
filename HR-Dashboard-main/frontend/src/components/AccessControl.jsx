import React, { useEffect, useState, useCallback } from 'react';
import { Check, Save, AlertCircle, LoaderCircle } from 'lucide-react';
import api from '../api';
import { C, COMPANY_OPTIONS, FONT_HEAD, MODULE_MAP } from '../config';

const roleDataCache = new Map();
const cacheKey = () => localStorage.getItem('automat_token') || '';
const cachedRoleData = () => roleDataCache.get(cacheKey()) || null;

// Friendly labels for module keys that aren't in the record MODULES config.
const EXTRA_LABELS = {
  dashboard: 'Dashboard',
  audit: 'Audit Trail',
  roles: 'Access Control',
  operationMatrix: 'Operation Matrix',
};

function labelFor(key) {
  return MODULE_MAP[key]?.label || EXTRA_LABELS[key] || key;
}

// Access to these modules is always Administrator-only for both create and edit.
const ALWAYS_ADMIN_MANAGE = ['usersmgmt', 'roles'];

export default function AccessControl() {
  const [data, setData] = useState(cachedRoleData); // { roles, allModules, protectedRoles, assignableRoles }
  const [loading, setLoading] = useState(() => !cachedRoleData());
  const [error, setError] = useState('');
  const [savingRole, setSavingRole] = useState(null);
  const [savedRole, setSavedRole] = useState(null);
  const [search, setSearch] = useState('');
  const [openRole, setOpenRole] = useState(null); // only one role expanded at a time

  const load = useCallback(() => {
    setError('');
    api.get('/roles')
      .then((res) => {
        roleDataCache.set(cacheKey(), res.data);
        setData(res.data);
      })
      .catch((e) => setError(e?.response?.data?.error || 'Failed to load role permissions'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data && loading) {
    return (
      <div style={{ color: C.ink2, fontSize: 13 }} className="flex items-center justify-center gap-2 py-10">
        <LoaderCircle size={16} className="animate-spin" />
        Loading access details…
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ color: C.rust, fontSize: 13 }} className="flex items-center gap-2 py-6">
        <AlertCircle size={16} /> {error || 'Could not load role permissions.'}
      </div>
    );
  }

  const { roles, allModules, protectedRoles } = data;
  const roleNames = Object.keys(roles).filter((r) =>
    r.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(role, listKey, moduleKey) {
    if (protectedRoles.includes(role)) return;
    if (['create', 'edit'].includes(listKey) && ALWAYS_ADMIN_MANAGE.includes(moduleKey)) return;

    setData((prev) => {
      const current = prev.roles[role];
      const list = current[listKey];
      const isAll = list === 'all';
      const asArray = isAll ? [...allModules] : list;
      const has = asArray.includes(moduleKey);
      let nextList = has ? asArray.filter((m) => m !== moduleKey) : [...asArray, moduleKey];

      // Viewing a module implies at least the option to be granted edit on
      // it isn't meaningful without view access — so turning view off also
      // turns edit off for that module.
      const nextRole = { ...current, [listKey]: nextList };
      if (listKey === 'modules' && has) {
        const createList = nextRole.create === 'all' ? [...allModules] : nextRole.create;
        nextRole.create = createList.filter((m) => m !== moduleKey);
        const editList = nextRole.edit === 'all' ? [...allModules] : nextRole.edit;
        nextRole.edit = editList.filter((m) => m !== moduleKey);
      }

      return { ...prev, roles: { ...prev.roles, [role]: nextRole } };
    });
  }

  function toggleCompany(role, companyId) {
    if (protectedRoles.includes(role)) return;
    setData((prev) => {
      const current = prev.roles[role];
      const companies = current.companies || prev.allCompanies;
      return {
        ...prev,
        roles: {
          ...prev.roles,
          [role]: {
            ...current,
            companies: companies.includes(companyId)
              ? companies.filter((company) => company !== companyId)
              : [...companies, companyId],
          },
        },
      };
    });
  }

  function save(role) {
    const perm = data.roles[role];
    setSavingRole(role);
    setSavedRole(null);
    api.put('/roles', {
      role,
      modules: perm.modules,
      create: perm.create,
      edit: perm.edit,
      companies: perm.companies || data.allCompanies,
    })
      .then(() => {
        const cached = roleDataCache.get(cacheKey()) || data;
        roleDataCache.set(cacheKey(), {
          ...cached,
          roles: { ...cached.roles, [role]: { ...perm } },
        });
        setSavedRole(role);
        setTimeout(() => setSavedRole(null), 2000);
      })
      .catch((e) => setError(e?.response?.data?.error || `Failed to save ${role}`))
      .finally(() => setSavingRole(null));
  }

  return (
    <div className="space-y-6" style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 12px 28px' }}>
      <div style={{ color: C.ink2, fontSize: 13, lineHeight: 1.6 }}>
        <strong>View</strong> controls who can see each module. <strong>Create</strong> controls who can add records, and <strong>Edit / Change</strong> controls who can update them. Delete is Administrator-only. Turning View off also removes Create and Edit.
        Save a role to apply its access changes across the app.
      </div>

      {error && (
        <div style={{ color: C.rust, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }} className="flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <input
        type="text"
        placeholder={`Search roles/designations… (${Object.keys(roles).length} total)`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded"
        style={{
          border: `1px solid ${C.line}`,
          background: 'rgba(17,29,42,0.85)',
          color: '#edf5ff',
          borderRadius: 10,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      />

      {roleNames.map((role) => {
        const perm = roles[role];
        const isProtected = protectedRoles.includes(role);
        const viewList = perm.modules === 'all' ? allModules : perm.modules;
        const createList = perm.create === 'all' ? allModules : perm.create;
        const editList = perm.edit === 'all' ? allModules : perm.edit;
        const companyList = perm.companies || data.allCompanies || COMPANY_OPTIONS.map((company) => company.id);

        return (
          <div
            key={role}
            style={{
              background: 'linear-gradient(180deg, rgba(17,29,42,0.96), rgba(11,19,28,0.99))',
              border: '1px solid rgba(142,197,255,0.18)',
              borderRadius: 16,
              padding: 16,
              boxShadow: '0 18px 32px rgba(2, 8, 14, 0.35)',
            }}
          >
            <div className="flex items-center justify-between mb-3 gap-3">
              <button
                type="button"
                className="access-role-toggle w-full"
                aria-expanded={openRole === role}
                onClick={() => setOpenRole(openRole === role ? null : role)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(142,197,255,0.14)',
                  background: 'rgba(13, 22, 31, 0.9)',
                  color: '#edf5ff',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ fontFamily: FONT_HEAD, fontSize: 15, color: '#edf5ff' }}>{role}</span>
                  {isProtected && (
                    <span style={{ fontSize: 11, color: '#9bb4c9' }} className="font-normal">
                      Full access (protected)
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: '#9bb4c9' }} className="font-normal">
                  {perm.modules === 'all' ? 'All modules' : `${viewList.length} modules`} · {companyList.length} companies · {openRole === role ? 'Collapse' : 'Expand'}
                </span>
              </button>
              {!isProtected && (
                <button
                  onClick={() => save(role)}
                  disabled={savingRole === role}
                  className="flex items-center justify-center gap-1.5 rounded text-xs font-medium"
                  style={{
                    background: savedRole === role ? 'linear-gradient(180deg, #2d8c63, #246b52)' : 'linear-gradient(180deg, #3e5c73, #2d4a61)',
                    color: '#fff',
                    opacity: savingRole === role ? 0.6 : 1,
                    minWidth: 96,
                    minHeight: 38,
                    padding: '0 14px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 8px 18px rgba(24, 52, 73, 0.38)',
                  }}
                >
                  {savedRole === role ? <Check size={13} /> : <Save size={13} />}
                  {savingRole === role ? 'Saving…' : savedRole === role ? 'Saved' : 'Save'}
                </button>
              )}
            </div>

            {openRole === role && (
              <div className="overflow-x-auto" style={{ borderTop: '1px solid rgba(142,197,255,0.12)', paddingTop: 14 }}>
                <fieldset className="mb-4" style={{ border: '1px solid rgba(142,197,255,0.12)', borderRadius: 12, padding: '12px 14px' }}>
                  <legend style={{ color: '#edf5ff', fontSize: 12, fontWeight: 600, padding: '0 6px' }}>Company access</legend>
                  <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
                    {COMPANY_OPTIONS.map((company) => (
                      <label key={company.id} className="flex items-center gap-1.5" style={{ color: '#cfe1f2', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={companyList.includes(company.id)}
                          disabled={isProtected}
                          aria-label={`${isProtected ? 'Allow' : companyList.includes(company.id) ? 'Allow' : 'Deny'} ${role} access to ${company.label}`}
                          onChange={() => toggleCompany(role, company.id)}
                        />
                        {company.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <table className="text-sm" style={{ minWidth: 560, width: '100%', maxWidth: 760, borderCollapse: 'collapse', tableLayout: 'fixed', textAlign: 'center' }}>
                    <thead>
                      <tr>
                        <th style={{ color: '#edf5ff', fontSize: 11, background: 'rgba(30,48,63,0.95)', padding: '10px 12px', textAlign: 'center' }} className="pb-1 font-medium">Module</th>
                        <th style={{ color: '#edf5ff', fontSize: 11, background: 'rgba(30,48,63,0.95)', padding: '10px 12px', textAlign: 'center' }} className="px-3 pb-1 font-medium">View</th>
                        <th style={{ color: '#edf5ff', fontSize: 11, background: 'rgba(30,48,63,0.95)', padding: '10px 12px', textAlign: 'center' }} className="px-3 pb-1 font-medium">Create</th>
                        <th style={{ color: '#edf5ff', fontSize: 11, background: 'rgba(30,48,63,0.95)', padding: '10px 12px', textAlign: 'center' }} className="px-3 pb-1 font-medium">Edit / Change</th>
                        <th style={{ color: '#edf5ff', fontSize: 11, background: 'rgba(30,48,63,0.95)', padding: '10px 12px', textAlign: 'center' }} className="px-3 pb-1 font-medium">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allModules.map((m) => {
                        const canView = perm.modules === 'all' || viewList.includes(m);
                        const canCreate = perm.create === 'all' || createList.includes(m);
                        const canEdit = perm.edit === 'all' || editList.includes(m);
                        const manageLocked = ALWAYS_ADMIN_MANAGE.includes(m);
                        return (
                          <tr key={m} style={{ borderTop: '1px solid rgba(142,197,255,0.12)' }}>
                            <td className="py-1.5" style={{ color: '#edf5ff', textAlign: 'center', padding: '10px 12px', verticalAlign: 'middle' }}>{labelFor(m)}</td>
                            <td className="px-3 py-1.5" style={{ textAlign: 'center', padding: '10px 12px', verticalAlign: 'middle' }}>
                              <input
                                type="checkbox"
                                checked={canView}
                                disabled={isProtected}
                                aria-label={`${canView ? 'Allow' : 'Deny'} ${role} to view ${labelFor(m)}`}
                                onChange={() => toggle(role, 'modules', m)}
                              />
                            </td>
                            <td className="px-3 py-1.5" style={{ textAlign: 'center', padding: '10px 12px', verticalAlign: 'middle' }}>
                              <input
                                type="checkbox"
                                checked={manageLocked ? isProtected : canCreate}
                                disabled={isProtected || manageLocked || !canView}
                                title={manageLocked ? 'Administrator-only, always' : !canView ? 'Grant View first' : ''}
                                aria-label={`${canCreate ? 'Allow' : 'Deny'} ${role} to create ${labelFor(m)}`}
                                onChange={() => toggle(role, 'create', m)}
                              />
                            </td>
                            <td className="px-3 py-1.5" style={{ textAlign: 'center', padding: '10px 12px', verticalAlign: 'middle' }}>
                              <input
                                type="checkbox"
                                checked={manageLocked ? isProtected : canEdit}
                                disabled={isProtected || manageLocked || !canView}
                                title={manageLocked ? 'Administrator-only, always' : !canView ? 'Grant View first' : ''}
                                aria-label={`${canEdit ? 'Allow' : 'Deny'} ${role} to edit ${labelFor(m)}`}
                                onChange={() => toggle(role, 'edit', m)}
                              />
                            </td>
                            <td className="px-3 py-1.5" style={{ color: isProtected ? '#8cd4aa' : '#9bb4c9', textAlign: 'center', padding: '10px 12px', verticalAlign: 'middle', fontSize: 11 }}>
                              {isProtected ? 'Allowed' : 'Admin only'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
