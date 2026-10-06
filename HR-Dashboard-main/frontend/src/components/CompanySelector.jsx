import React from 'react';
import { C, COMPANY_OPTIONS } from '../config';

export default function CompanySelector({ value, onChange, companies = COMPANY_OPTIONS, includeAll = true }) {
  const options = [
    ...(includeAll && companies.length === COMPANY_OPTIONS.length ? [{ id: 'all', shortLabel: 'All companies' }] : []),
    ...companies,
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by company">
      {options.map((company) => {
        const active = value === company.id;
        return (
          <button
            key={company.id}
            type="button"
            onClick={() => onChange(company.id)}
            className="px-3 py-1.5 text-sm rounded"
            style={{
              background: active ? C.steel : C.card,
              color: active ? '#fff' : C.ink2,
              border: `1px solid ${active ? C.steel : C.line}`,
            }}
            aria-pressed={active}
          >
            {company.shortLabel}
          </button>
        );
      })}
    </div>
  );
}