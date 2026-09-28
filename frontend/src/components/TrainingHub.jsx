import React, { useState } from 'react';
import ModuleView from './ModuleView';
import { C, MODULE_MAP } from '../config';

const SECTIONS = [
  { key: 'Behavioral', label: 'Behavioral' },
  { key: 'Technical (Site 4)', label: 'Technical (Site 4)' },
];

export default function TrainingHub({ canEditModule }) {
  const [active, setActive] = useState(SECTIONS[0].key);
  const section = SECTIONS.find((item) => item.key === active);

  return (
    <div className="space-y-4">
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
        recordFilter={(record) => record.section === section.key}
        defaultValues={{ section: section.key }}
      />
    </div>
  );
}
