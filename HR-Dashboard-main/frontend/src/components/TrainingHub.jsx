import React, { useState } from 'react';
import ModuleView from './ModuleView';
import CompanySelector from './CompanySelector';
import { C, MODULE_MAP } from '../config';

const SECTIONS = [
  { key: 'Behavioural', label: 'Behavioural' },
  { key: 'Technical (Site 4)', label: 'Technical (Site 4)' },
  { key: 'SME', label: 'SME' },
  { key: 'Coach In', label: 'Coach In' },
  { key: 'EHS', label: 'EHS' },
];

export default function TrainingHub({ canEditModule, canDelete, companyId, onCompanyChange, allowedCompanies }) {
  const [active, setActive] = useState(SECTIONS[0].key);
  const section = SECTIONS.find((item) => item.key === active);

  return (
    <div className="space-y-4">
      <CompanySelector value={companyId} onChange={onCompanyChange} companies={allowedCompanies} />
      <div className="flex gap-1.5">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            onClick={() => setActive(item.key)}
            className="px-3 py-1.5 text-sm rounded"
            style={{
              background: active === item.key ? C.steel : C.card,
              color: active === item.key ? '#fff' : C.ink2,
              border: `1px solid ${active === item.key ? C.steel : C.line}`,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ModuleView
        config={MODULE_MAP.training}
        editable={canEditModule('training')}
        canDelete={canDelete}
        recordFilter={(record) => record.section === section.key}
        defaultValues={{ section: section.key }}
        companyId={companyId}
      />
    </div>
  );
}
