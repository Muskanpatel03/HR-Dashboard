import React, { useEffect, useState, useCallback } from 'react';
import { Check, Save, AlertCircle } from 'lucide-react';
import api from '../api';
import { C, FONT_HEAD, MODULE_MAP } from '../config';

// Friendly labels for module keys that aren't in the record MODULES config.
const EXTRA_LABELS = {
  dashboard: 'Dashboard',
  audit: 'Audit Trail',
  roles: 'Access Control',
};

function labelFor(key) {
  return MODULE_MAP[key]?.label || EXTRA_LABELS[key] || key;
}

// Roles whose "edit" access to these two modules is always Administrator-only,
// no matter what the checkbox says — mirrors the server-side rule, so the UI
// doesn't lie about what a save will actually do.
const ALWAYS_ADMIN_EDIT = ['usersmgmt', 'roles'];

export default function AccessControl() {
  const [data, setData] = useState(null); // { roles, allModules, protectedRoles, assignableRoles }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingRole, setSavingRole] = useState(null);
  const [savedRole, setSavedRole] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/roles')
      .then((res) => setData(res.data))
      .catch((e) => setError(e?.response?.data?.error || 'Failed to load role permissions'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={{ color: C.ink2, fontSize: 13 }} className="py-10 text-center">Loading…</div>;
  }

  if (error || !data) {
    return (
      <div style={{ color: C.rust, fontSize: 13 }} className="flex items-center gap-2 py-6">
        <AlertCircle size={16} /> {error || 'Could not load role permissions.'}
      </div>
    );
  }

  const { roles, allModules, protectedRoles } = data;
  const roleNames = Object.keys(roles);

  function toggle(role, listKey, moduleKey) {
    if (protectedRoles.includes(role)) return;
    if (listKey === 'edit' && ALWAYS_ADMIN_EDIT.includes(moduleKey)) return;

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
        const editList = nextRole.edit === 'all' ? [...allModules] : nextRole.edit;
        nextRole.edit = editList.filter((m) => m !== moduleKey);
      }

      return { ...prev, roles: { ...prev.roles, [role]: nextRole } };
    });
  }

  function save(role) {
    const perm = data.roles[role];
    setSavingRole(role);
    setSavedRole(null);
    api.put(`/roles/${encodeURIComponent(role)}`, { modules: perm.modules, edit: perm.edit })
      .then(() => { setSavedRole(role); setTimeout(() => setSavedRole(null), 2000); })
      .catch((e) => setError(e?.response?.data?.error || `Failed to save ${role}`))
      .finally(() => setSavingRole(null));
  }

  return (
    <div className="space-y-6">
      <div style={{ color: C.ink2, fontSize: 13 }}>
        Control exactly which modules each role can <strong>view</strong> and <strong>edit</strong>.
        Changes apply immediately, app-wide, as soon as you save a role — no redeploy needed.
      </div>

      {error && (
        <div style={{ color: C.rust, fontSize: 13 }} className="flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {roleNames.map((role) => {
        const perm = roles[role];
        const isProtected = protectedRoles.includes(role);
        const viewList = perm.modules === 'all' ? allModules : perm.modules;
        const editList = perm.edit === 'all' ? allModules : perm.edit;

        return (
          <div key={role} style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }}>
                {role}
                {isProtected && (
                  <span style={{ fontSize: 11, color: C.ink2 }} className="ml-2 font-normal">
                    (full access always — not editable)
                  </span>
                )}
              </div>
              {!isProtected && (
                <button
                  onClick={() => save(role)}
                  disabled={savingRole === role}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
                  style={{ background: savedRole === role ? C.moss : C.steel, color: '#fff', opacity: savingRole === role ? 0.6 : 1 }}
                >
                  {savedRole === role ? <Check size={13} /> : <Save size={13} />}
                  {savingRole === role ? 'Saving…' : savedRole === role ? 'Saved' : 'Save'}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="text-sm" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ color: C.ink2, fontSize: 11 }} className="text-left pr-3 pb-1 font-medium">Module</th>
                    <th style={{ color: C.ink2, fontSize: 11 }} className="text-center px-3 pb-1 font-medium">View</th>
                    <th style={{ color: C.ink2, fontSize: 11 }} className="text-center px-3 pb-1 font-medium">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {allModules.map((m) => {
                    const canView = perm.modules === 'all' || viewList.includes(m);
                    const canEdit = perm.edit === 'all' || editList.includes(m);
                    const editLocked = ALWAYS_ADMIN_EDIT.includes(m);
                    return (
                      <tr key={m} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td className="pr-3 py-1.5" style={{ color: C.ink }}>{labelFor(m)}</td>
                        <td className="text-center px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={canView}
                            disabled={isProtected}
                            onChange={() => toggle(role, 'modules', m)}
                          />
                        </td>
                        <td className="text-center px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={editLocked ? isProtected : canEdit}
                            disabled={isProtected || editLocked || !canView}
                            title={editLocked ? 'Administrator-only, always' : !canView ? 'Grant View first' : ''}
                            onChange={() => toggle(role, 'edit', m)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
