import React, { useState } from 'react';
import ModuleView from './ModuleView';
import CompanySelector from './CompanySelector';
import { C, DAILY_MANPOWER_CONFIG, MODULE_MAP } from '../config';

const TABS = [
  { key: 'total', label: 'Total Manpower' },
  { key: 'daily', label: 'Daily Manpower' },
];

export default function ManpowerHub({
  visibleModuleKeys,
  canEditModule,
  companyId,
  onCompanyChange,
  allowedCompanies,
}) {
  const [active, setActive] = useState('total');

  if (!visibleModuleKeys.includes('manpower')) return null;

  return (
    <div className="space-y-4">
      <CompanySelector value={companyId} onChange={onCompanyChange} companies={allowedCompanies} />

      {/* Header / Tabs */}
      <div className="flex flex-wrap items-center gap-3">

        <div className="flex gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className="px-3 py-1.5 text-sm rounded"
              style={{
                background:
                  active === tab.key ? C.steel : C.card,
                color:
                  active === tab.key ? '#fff' : C.ink2,
                border:
                  `1px solid ${
                    active === tab.key ? C.steel : C.line
                  }`,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>

      {/* Manpower Content */}
      <ModuleView
        config={active === 'daily' ? DAILY_MANPOWER_CONFIG : MODULE_MAP.manpower}
        editable={canEditModule('manpower')}
        companyId={companyId}
      />

    </div>
  );
}