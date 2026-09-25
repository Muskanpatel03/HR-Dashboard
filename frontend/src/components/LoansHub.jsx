import React, { useState } from 'react';
import ModuleView from './ModuleView';
import { C, MODULE_MAP } from '../config';

// Employee Loans (per-employee records) and Loan Summary (per-business-unit
// budget/corpus) are different database tables by design — different
// granularity, different fields. This just groups them under one sidebar
// section with tabs, the same pattern used for Recruitment/Hiring/Separation.
const TABS = [
  { key: 'loans', label: 'Employee Loans' },
  { key: 'loanSummary', label: 'Loan Summary' },
];

export default function LoansHub({ visibleModuleKeys, canEditModule }) {
  const availableTabs = TABS.filter((t) => visibleModuleKeys.includes(t.key));
  const [active, setActive] = useState(availableTabs[0]?.key || 'loans');

  if (availableTabs.length === 0) return null;

  return (
    <div className="space-y-4">
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

      <ModuleView config={MODULE_MAP[active]} editable={canEditModule(active)} />
    </div>
  );
}