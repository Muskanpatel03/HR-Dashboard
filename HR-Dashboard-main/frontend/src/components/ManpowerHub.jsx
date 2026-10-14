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
  canCreateModule,
  canDelete,
  companyId,
  onCompanyChange,
  allowedCompanies,
  initialTab = 'total',
}) {
  const [active, setActive] = useState(() => {
    if (initialTab === 'daily') return 'daily';
    const savedTab = localStorage.getItem('automat_manpower_tab');
    return TABS.some((tab) => tab.key === savedTab) ? savedTab : initialTab;
  });
  const [dailyRecords, setDailyRecords] = useState([]);
  const [selectedDailyDate, setSelectedDailyDate] = useState('');
  const canViewManpower = visibleModuleKeys.includes('manpower');

  useEffect(() => {
    if (initialTab === 'daily') localStorage.setItem('automat_manpower_tab', 'daily');
  }, [initialTab]);

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
    const monthlySnapshots = new Map();
    const departmentField = DAILY_MANPOWER_CONFIG.fields.find((field) => field.name === 'departmentProduction');
    const productionDepartments = new Set(departmentField.optionsFor({ departmentType: 'Production' }).map((department) => department.trim().toLowerCase()));
    const nonProductionDepartments = new Set(departmentField.optionsFor({ departmentType: 'Non-Production' }).map((department) => department.trim().toLowerCase()));

    dailyRecords.forEach((record) => {
      if (!companies.includes(record.company)) return;
      const date = String(record.date || '').slice(0, 10);
      if (!date) return;
      const month = date.slice(0, 7);
      const key = `${month}:${record.company}`;
      const current = monthlySnapshots.get(key) || { month, company: record.company, recordedDates: new Set(), productionTotal: 0, nonProductionTotal: 0, total: 0 };
      const total = (Number(record.dayShift) || 0) + (Number(record.nightShift) || 0);
      const department = String(record.departmentProduction || '').trim().toLowerCase();
      const group = productionDepartments.has(department) || (!nonProductionDepartments.has(department) && record.departmentType === 'Production')
        ? 'productionTotal'
        : 'nonProductionTotal';
      current.total += total;
      current[group] += total;
      current.recordedDates.add(date);
      monthlySnapshots.set(key, current);
    });

    return [...monthlySnapshots.values()].map((snapshot) => ({
      ...snapshot,
      recordedDays: snapshot.recordedDates.size,
    })).sort((a, b) =>
      b.month.localeCompare(a.month) || a.company.localeCompare(b.company)
    );
  }, [dailyRecords, companyId, allowedCompanies]);

  const dailyCategoryTotals = useMemo(() => {
    const companies = companyId === 'all'
      ? allowedCompanies.map((company) => company.id)
      : [companyId];
    const departmentField = DAILY_MANPOWER_CONFIG.fields.find((field) => field.name === 'departmentProduction');
    const productionDepartments = new Set(departmentField.optionsFor({ departmentType: 'Production' }).map((department) => department.trim().toLowerCase()));
    const nonProductionDepartments = new Set(departmentField.optionsFor({ departmentType: 'Non-Production' }).map((department) => department.trim().toLowerCase()));
    const totalsByPeriod = new Map();

    dailyRecords.forEach((record) => {
      if (!companies.includes(record.company)) return;
      const date = String(record.date || '').slice(0, 10);
      if (!date) return;
      if (selectedDailyDate && date !== selectedDailyDate) return;
      const period = selectedDailyDate ? date : date.slice(0, 7);
      const totals = totalsByPeriod.get(period) || { period, production: 0, nonProduction: 0, total: 0 };
      const headcount = (Number(record.dayShift) || 0) + (Number(record.nightShift) || 0);
      const department = String(record.departmentProduction || '').trim().toLowerCase();
      const isProduction = productionDepartments.has(department)
        || (!nonProductionDepartments.has(department) && record.departmentType === 'Production');
      if (isProduction) totals.production += headcount;
      else totals.nonProduction += headcount;
      totals.total += headcount;
      totalsByPeriod.set(period, totals);
    });

    return [...totalsByPeriod.values()].sort((a, b) => b.period.localeCompare(a.period));
  }, [dailyRecords, companyId, allowedCompanies, selectedDailyDate]);

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
              onClick={() => {
                setActive(tab.key);
                localStorage.setItem('automat_manpower_tab', tab.key);
              }}
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
            <h2 className="text-sm font-semibold" style={{ color: C.ink }}>Monthly Sum of Daily Manpower</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: C.ink2, background: C.paper }}>
                {['Month', 'Company', 'Recorded Days', 'Production Monthly Sum', 'Non-Production Monthly Sum', 'Monthly Total'].map((label) => (
                  <th key={label} className="px-4 py-2 text-left font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlySnapshots.length ? monthlySnapshots.map((snapshot) => (
                <tr key={`${snapshot.month}:${snapshot.company}`} style={{ borderTop: `1px solid ${C.line}`, color: C.ink }}>
                  <td className="px-4 py-2">{new Date(`${snapshot.month}-01T00:00:00`).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</td>
                  <td className="px-4 py-2">{COMPANY_OPTIONS.find((company) => company.id === snapshot.company)?.label || snapshot.company}</td>
                  <td className="px-4 py-2">{snapshot.recordedDays}</td>
                  <td className="px-4 py-2">{snapshot.productionTotal.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2">{snapshot.nonProductionTotal.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 font-semibold">{snapshot.total.toLocaleString('en-IN')}</td>
                </tr>
              )) : (
                <tr><td colSpan="6" className="px-4 py-4 text-center" style={{ color: C.ink2 }}>No daily manpower records for this company yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}
      {active === 'daily' && (
        <section className="overflow-x-auto rounded" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h2 className="text-sm font-semibold" style={{ color: C.ink }}>Daily Production and Non-Production Totals</h2>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="w-full text-sm">
              <thead style={{ position: 'sticky', top: 0, background: C.paper, zIndex: 1 }}>
                <tr style={{ color: C.ink2 }}>
                  {[selectedDailyDate ? 'Date' : 'Month', 'Production Total', 'Non-Production Total', selectedDailyDate ? 'Daily Manpower Total' : 'Monthly Manpower Total'].map((label) => (
                    <th key={label} className="px-4 py-2 text-left font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyCategoryTotals.length ? dailyCategoryTotals.map((row) => (
                  <tr key={row.period} style={{ borderTop: `1px solid ${C.line}`, color: C.ink }}>
                    <td className="px-4 py-2">{selectedDailyDate ? row.period : new Date(`${row.period}-01T00:00:00`).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</td>
                    <td className="px-4 py-2">{row.production.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2">{row.nonProduction.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 font-semibold">{row.total.toLocaleString('en-IN')}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="4" className="px-4 py-4 text-center" style={{ color: C.ink2 }}>No daily manpower records for this company yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <ModuleView
        config={active === 'daily' ? DAILY_MANPOWER_CONFIG : MODULE_MAP.manpower}
        editable={canEditModule('manpower')}
        creatable={canCreateModule('manpower')}
        canDelete={canDelete}
        companyId={companyId}
        onRecordsChange={setDailyRecords}
        onSelectedDateChange={setSelectedDailyDate}
      />

    </div>
  );
}
