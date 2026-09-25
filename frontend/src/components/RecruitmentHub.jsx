import React, { useEffect, useState } from 'react';
import api from '../api';
import ModuleView from './ModuleView';
import { C, MODULE_MAP } from '../config';

// Recruitment, Hiring, and Separation stay separate database tables (their
// fields are genuinely different: candidate pipeline stages vs. joining
// dates vs. exit reasons) — this just folds them into one sidebar section
// with tabs, plus a quick "hired vs separated" count at a glance.
const TABS = [
  { key: 'recruitment', label: 'Candidates' },
  { key: 'hiring', label: 'Hiring' },
  { key: 'separation', label: 'Separation' },
];

export default function RecruitmentHub({ visibleModuleKeys, canEditModule }) {
  const availableTabs = TABS.filter((t) => visibleModuleKeys.includes(t.key));
  const [active, setActive] = useState(availableTabs[0]?.key || 'recruitment');
  const [counts, setCounts] = useState({ hiring: null, separation: null });

  useEffect(() => {
    if (visibleModuleKeys.includes('hiring')) {
      api.get('/hiring').then((res) => setCounts((c) => ({ ...c, hiring: res.data.records.length }))).catch(() => {});
    }
    if (visibleModuleKeys.includes('separation')) {
      api.get('/separation').then((res) => setCounts((c) => ({ ...c, separation: res.data.records.length }))).catch(() => {});
    }
  }, [visibleModuleKeys]);

  if (availableTabs.length === 0) return null;

  return (
    <div className="space-y-4">
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

      <ModuleView config={MODULE_MAP[active]} editable={canEditModule(active)} />
    </div>
  );
}