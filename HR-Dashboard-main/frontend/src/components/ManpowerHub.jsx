import React, { useEffect, useMemo, useState } from 'react';
import ModuleView from './ModuleView';
import CompanySelector from './CompanySelector';
import api from '../api';
import { C, COMPANY_OPTIONS, DAILY_MANPOWER_CONFIG, MODULE_MAP } from '../config';

const TABS = [
  { key: 'total', label: 'Total Manpower' },
  { key: 'daily', label: 'Daily Manpower' },
];

export default function ManpowerHub({
  visibleModuleKeys,
  canEditModule,
  canDelete,
  companyId,
  onCompanyChange,
  allowedCompanies,
}) {
  const [active, setActive] = useState('total');
  const [dailyRecords, setDailyRecords] = useState([]);
  const canViewManpower = visibleModuleKeys.includes('manpower');

  useEffect(() => {
    if (!canViewManpower) return undefined;
    let mounted = true;
    api.get('/dailyManpower')
      .then(({ data }) => {
        if (mounted) setDailyRecords(Array.isArray(data.records) ? data.records : []);
      })
      .catch(() => {
        if (mounted) setDailyRecords([]);
      });
    return () => { mounted = false; };
  }, [canViewManpower]);

  const monthlySnapshots = useMemo(() => {
    const companies = companyId === 'all'
      ? allowedCompanies.map((company) => company.id)
      : [companyId];
    const snapshots = new Map();

    dailyRecords.forEach((record) => {
      if (!companies.includes(record.company)) return;
      const date = String(record.date || '').slice(0, 10);
      if (!date) return;
      const month = date.slice(0, 7);
      const key = `${month}:${record.company}`;
      const current = snapshots.get(key);
      const total = (Number(record.dayShift) || 0) + (Number(record.nightShift) || 0);

      if (!current || date > current.date) {
        snapshots.set(key, { month, company: record.company, date, total });
      } else if (date === current.date) {
        current.total += total;
      }
    });

    return [...snapshots.values()].sort((a, b) =>
      b.month.localeCompare(a.month) || a.company.localeCompare(b.company)
    );
  }, [dailyRecords, companyId, allowedCompanies]);

  if (!canViewManpower) return null;

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
      {active === 'total' && (
        <section className="overflow-x-auto rounded" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h2 className="text-sm font-semibold" style={{ color: C.ink }}>Latest Daily Manpower by Month</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: C.ink2, background: C.paper }}>
                {['Month', 'Company', 'Latest Daily Date', 'Total Manpower'].map((label) => (
                  <th key={label} className="px-4 py-2 text-left font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlySnapshots.length ? monthlySnapshots.map((snapshot) => (
                <tr key={`${snapshot.month}:${snapshot.company}`} style={{ borderTop: `1px solid ${C.line}`, color: C.ink }}>
                  <td className="px-4 py-2">{new Date(`${snapshot.month}-01T00:00:00`).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</td>
                  <td className="px-4 py-2">{COMPANY_OPTIONS.find((company) => company.id === snapshot.company)?.label || snapshot.company}</td>
                  <td className="px-4 py-2">{snapshot.date}</td>
                  <td className="px-4 py-2 font-semibold">{snapshot.total.toLocaleString('en-IN')}</td>
                </tr>
              )) : (
                <tr><td colSpan="4" className="px-4 py-4 text-center" style={{ color: C.ink2 }}>No daily manpower records for this company yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}
      <ModuleView
        config={active === 'daily' ? DAILY_MANPOWER_CONFIG : MODULE_MAP.manpower}
        editable={canEditModule('manpower')}
        canDelete={canDelete}
        companyId={companyId}
        onRecordsChange={setDailyRecords}
      />

    </div>
  );
}