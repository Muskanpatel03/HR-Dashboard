import React, { useEffect, useState } from 'react';
import api from '../api';
import ModuleView from './ModuleView';
import RecruitmentAnalysis from './RecruitmentAnalysis';
import CompanySelector from './CompanySelector';
import { C, MODULE_MAP } from '../config';

// Recruitment, Hiring, and Separation stay separate database tables (their
// fields are genuinely different: candidate pipeline stages vs. joining
// dates vs. exit reasons) — this just folds them into one sidebar section
// with tabs, plus a quick "hired vs separated" count at a glance.
// Recruitment Analysis is a candidate-level view linked to Joined + Separation.
const TABS = [
  { key: 'recruitment', label: 'Open Position' },
  { key: 'hiring', label: 'Joined' },
  { key: 'separation', label: 'Separation' },
  { key: 'recruitmentAnalysis', label: 'Recruitment Analysis' },
];

// Recruitment Analysis shares the Recruitment permission.
// Remember the last tab so a page reload stays on the same tab.
const TAB_STORAGE_KEY = 'recruitment-hub-tab';
const readStoredTab = () => {
  try { return localStorage.getItem(TAB_STORAGE_KEY); } catch { return null; }
};

const permKey = (key) => (key === 'recruitmentAnalysis' ? 'recruitment' : key);

export default function RecruitmentHub({ visibleModuleKeys, canEditModule, canCreateModule, canDelete, companyId, onCompanyChange, allowedCompanies, initialTab }) {
  const availableTabs = TABS.filter((t) => visibleModuleKeys.includes(permKey(t.key)));
  // The remembered tab wins over initialTab, so a re-render/remount after
  // loading never bounces you back to the first tab.
  const [active, setActive] = useState(() => {
    const stored = readStoredTab();
    if (TABS.some((tab) => tab.key === stored)) return stored;
    if (TABS.some((tab) => tab.key === initialTab)) return initialTab;
    return 'recruitment';
  });

  // If the remembered tab isn't allowed for this user, fall back to the first allowed one.
  useEffect(() => {
    if (availableTabs.length && !availableTabs.some((tab) => tab.key === active)) {
      setActive(availableTabs[0].key);
    }
  }, [availableTabs, active]);

  useEffect(() => {
    try { localStorage.setItem(TAB_STORAGE_KEY, active); } catch { /* storage unavailable */ }
  }, [active]);
  const [counts, setCounts] = useState({ hiring: null, separation: null });

  useEffect(() => {
    const params = {
      summary: true,
      ...(companyId && companyId !== 'all' ? { company: companyId } : {}),
    };
    if (visibleModuleKeys.includes('hiring')) {
      api.get('/hiring', { params }).then((res) => setCounts((c) => ({
        ...c,
        hiring: Number(res.data.summary?.total) || 0,
      }))).catch(() => {});
    }
    if (visibleModuleKeys.includes('separation')) {
      api.get('/separation', { params }).then((res) => setCounts((c) => ({
        ...c,
        separation: Number(res.data.summary?.total) || 0,
      }))).catch(() => {});
    }
  }, [visibleModuleKeys, companyId]);

  if (availableTabs.length === 0) return null;

  const perm = permKey(active);
  const tableProps = {
    editable: canEditModule(perm),
    creatable: canCreateModule(perm),
    canDelete,
    companyId,
  };

  return (
    <div className="space-y-4">
      <CompanySelector value={companyId} onChange={onCompanyChange} companies={allowedCompanies} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {availableTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className="px-3 py-1.5 text-sm rounded"
              style={{
                background: active === t.key ? C.steel : C.card,
                color: active === t.key ? '#fff' : C.ink2,
                border: `1px solid ${active === t.key ? C.steel : C.line}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {(counts.hiring !== null || counts.separation !== null) && (
          <div className="flex gap-4" style={{ fontSize: 12.5, color: C.ink2 }}>
            {counts.hiring !== null && <span><b style={{ color: C.moss, fontSize: 14 }}>{counts.hiring}</b> hired</span>}
            {counts.separation !== null && <span><b style={{ color: C.rust, fontSize: 14 }}>{counts.separation}</b> separated</span>}
          </div>
        )}
      </div>

      {active === 'recruitmentAnalysis' ? (
        <RecruitmentAnalysis {...tableProps} />
      ) : (
        <ModuleView config={MODULE_MAP[active]} {...tableProps} />
      )}
    </div>
  );
}