import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownAZ, ArrowUpAZ, Check, FileSpreadsheet, Plus, Save, Search, Trash2 } from 'lucide-react';
import api from '../api';
import { C, FONT_HEAD } from '../config';

const OperationMatrixExcelImport = lazy(() => import('./OperationMatrixExcelImport'));

function getIndianReportingPeriod() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return {
    fiscalYearEnd: year + (month >= 4 ? 1 : 0),
    reportMonth: `${year}-${String(month).padStart(2, '0')}`,
  };
}

function fiscalYearEndForMonth(reportMonth) {
  const [year, month] = String(reportMonth).split('-').map(Number);
  return year + (month >= 4 ? 1 : 0);
}

const INITIAL_PERIOD = getIndianReportingPeriod();
const INITIAL_DATA = {
  ...INITIAL_PERIOD,
  particulars: [],
};
const HR_SECTION_PARTICULARS = [
  'Manpower', 'Daily Manpower', 'Open Position Recruitment',
  'Hiring', 'Separation', 'Attendance', 'Retirement', 'Loan Summary',
  'Electricity', 'Canteen', 'Health Check', 'Engagement', 'Training',
];

// The separate "Recruitment" row was removed (Open Position Recruitment, Hiring and
// Separation already cover it); drop it from periods that were saved with it.
const REMOVED_PARTICULARS = new Set(['recruitment']);

function includeHrSectionRows(matrixData) {
  const allRows = Array.isArray(matrixData.particulars) ? matrixData.particulars : [];
  const rows = allRows.filter((row) => !REMOVED_PARTICULARS.has(String(row.particular || '').trim().toLocaleLowerCase()));
  const existing = new Set(rows.map((row) => String(row.particular || '').trim().toLocaleLowerCase()));
  const missing = HR_SECTION_PARTICULARS
    .filter((name) => !existing.has(name.toLocaleLowerCase()))
    .map((name) => ({ id: `hr-section-${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`, particular: name, values: {} }));
  return { ...matrixData, particulars: [...rows, ...missing] };
}

function isHrSectionRow(row) {
  const particular = String(row.particular || '').trim().toLocaleLowerCase();
  return HR_SECTION_PARTICULARS.some((name) => name.toLocaleLowerCase() === particular);
}

function linkedSectionValue(particular, summary) {
  const definitions = {
    'manpower': ['manpower', summary.kpis?.totalManpower],
    'daily manpower': ['manpower', summary.dailyManpowerPeriodTotal],
    'open position recruitment': ['recruitment', summary.kpis?.openPositions],
    'hiring': ['hiring', summary.kpis?.newJoiners],
    'separation': ['separation', summary.kpis?.separations],
    'attendance': ['attendance', summary.kpis?.absenteeism],
    'retirement': ['retirement', summary.kpis?.retirementsInPeriod],
    'loan summary': ['loanSummary', (summary.loanByUnit || []).reduce((total, unit) => total + (Number(unit.outstanding) || 0), 0)],
    'electricity': ['electricity', summary.kpis?.electricityCost],
    'canteen': ['canteen', summary.kpis?.canteenCost],
    'health check': ['healthcheck', summary.kpis?.healthcheckUsed],
    'engagement': ['engagement', summary.kpis?.engagementCount],
    'training': ['training', summary.kpis?.trainingsCount],
  };
  const [permission, value] = definitions[String(particular || '').trim().toLocaleLowerCase()] || [];
  return permission && summary.permissions?.[permission] ? Number(value) || 0 : null;
}
const matrixCache = new Map();

export function preloadOperationMatrix(industry) {
  if (!matrixCache.has(industry)) {
    const request = api.get('/operation-matrix', { params: { industry } })
      .then((response) => {
        matrixCache.set(industry, response.data);
        return response.data;
      })
      .catch((error) => { matrixCache.delete(industry); throw error; });
    matrixCache.set(industry, request);
  }
  return Promise.resolve(matrixCache.get(industry));
}

function fiscalYearLabel(fiscalYearEnd) {
  const end = Number(fiscalYearEnd);
  if (!Number.isFinite(end)) return String(fiscalYearEnd);
  return `FY ${String(end - 1).slice(-2)}-${String(end).slice(-2)}`;
}

function fiscalYearOptions(selectedFiscalYearEnd) {
  const currentFiscalYearEnd = getIndianReportingPeriod().fiscalYearEnd;
  const firstYear = Math.min(currentFiscalYearEnd - 100, Number(selectedFiscalYearEnd));
  const lastYear = Math.max(currentFiscalYearEnd + 10, Number(selectedFiscalYearEnd));
  return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index);
}

function makeColumns(fiscalYearEnd, reportMonth, periodView) {
  const monthDate = new Date(`${reportMonth}-01T12:00:00`);
  const monthLabel = Number.isNaN(monthDate.getTime())
    ? reportMonth
    : monthDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }).replace(' ', '-');
  const [, monthNumber] = reportMonth.split('-').map(Number);
  const monthSuffix = String(monthNumber).padStart(2, '0');
  const currentYearLabel = fiscalYearLabel(fiscalYearEnd);
  const currentYearGroup = periodView === 'year'
    ? currentYearLabel
    : `${currentYearLabel}`;

  return [
    ...[fiscalYearEnd - 1].map((priorFiscalYearEnd) => {
      const priorCalendarYear = monthNumber >= 4 ? priorFiscalYearEnd - 1 : priorFiscalYearEnd;
      const priorMonth = `${priorCalendarYear}-${monthSuffix}`;
      return {
        key: periodView === 'month' ? `month-${priorMonth}` : `fy-${priorFiscalYearEnd}`,
        label: fiscalYearLabel(priorFiscalYearEnd),
        linkedPeriod: 'previous',
      };
    }),
    { key: `actual Target-${fiscalYearEnd}`, label: 'Actual Target', group: currentYearGroup },
    { key: `revised Target-${fiscalYearEnd}`, label: 'Revised Target', group: currentYearGroup },
    periodView === 'month'
      ? { key: `month-${reportMonth}`, label: monthLabel, linkedPeriod: 'month' }
      : { key: `ytd-${reportMonth}`, label: 'FY Total', group: currentYearGroup, linkedPeriod: 'year' },
  ];
}

function newRow() {
  return {
    id: globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    particular: '',
    values: {},
  };
}

export default function OperationMatrix({ industry, label = industry, editable, creatable = editable, canDelete = false }) {
  const [data, setData] = useState(() => {
    const cached = matrixCache.get(industry);
    const matchesCurrentPeriod = cached && typeof cached.then !== 'function' &&
      cached.data?.reportMonth === INITIAL_DATA.reportMonth &&
      cached.data?.fiscalYearEnd === INITIAL_DATA.fiscalYearEnd;
    return matchesCurrentPeriod ? includeHrSectionRows(cached.data) : includeHrSectionRows(INITIAL_DATA);
  });
  const [search, setSearch] = useState('');
  const [sortDirection, setSortDirection] = useState(null);
  const [periodView, setPeriodView] = useState('month');
  const [loading, setLoading] = useState(() => {
    const cached = matrixCache.get(industry);
    return !cached || Boolean(cached.then) || cached.data?.reportMonth !== INITIAL_DATA.reportMonth || cached.data?.fiscalYearEnd !== INITIAL_DATA.fiscalYearEnd;
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [lastSaved, setLastSaved] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [periodSelection, setPeriodSelection] = useState(INITIAL_PERIOD);
  const [followsCurrentPeriod, setFollowsCurrentPeriod] = useState(true);
  const [linkedMetrics, setLinkedMetrics] = useState({ month: null, year: null, previousPeriods: {} });
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadMatrix = async () => {
      const cached = matrixCache.get(industry);
      if (cached) {
        try {
          const cachedData = await Promise.resolve(cached);
          if (cachedData?.data?.fiscalYearEnd === INITIAL_DATA.fiscalYearEnd &&
              cachedData?.data?.reportMonth === INITIAL_DATA.reportMonth) return cachedData;
        } catch {
          matrixCache.delete(industry);
        }
      }
      const response = await api.get('/operation-matrix', { params: {
        industry,
        fiscalYearEnd: INITIAL_DATA.fiscalYearEnd,
        reportMonth: INITIAL_DATA.reportMonth,
      } });
      return response.data;
    };

    loadMatrix()
      .then((response) => {
        if (cancelled) return;
        matrixCache.set(industry, response);
        setData(includeHrSectionRows(response?.data || INITIAL_DATA));
        setLastSaved(response?.updated_at ? {
          by: response.updated_by,
          at: response.updated_at,
        } : null);
        setSelectedPeriod(response?.data ? `${response.data.fiscalYearEnd}|${response.data.reportMonth}` : '');
        setPeriodSelection(response?.data || INITIAL_PERIOD);
        setDirty(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError.response?.data?.error || 'Could not load HR Matrix.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [industry]);

  useEffect(() => {
    const refreshCurrentPeriod = () => {
      const currentPeriod = getIndianReportingPeriod();
      if (!followsCurrentPeriod || dirty || saving || (data.reportMonth === currentPeriod.reportMonth && data.fiscalYearEnd === currentPeriod.fiscalYearEnd)) return;
      api.get('/operation-matrix', { params: { industry, ...currentPeriod } }).then((response) => {
        const matrix = response.data;
        setData(includeHrSectionRows(matrix?.data || { ...currentPeriod, particulars: [] }));
        setPeriodSelection(matrix?.data || currentPeriod);
        setLastSaved(matrix?.updated_at ? { by: matrix.updated_by, at: matrix.updated_at } : null);
        setSelectedPeriod(matrix?.data ? `${matrix.data.fiscalYearEnd}|${matrix.data.reportMonth}` : `${currentPeriod.fiscalYearEnd}|${currentPeriod.reportMonth}`);
        setSavedMessage('');
      }).catch(() => {});
    };
    const interval = window.setInterval(refreshCurrentPeriod, 60_000);
    return () => window.clearInterval(interval);
  }, [industry, data.reportMonth, data.fiscalYearEnd, dirty, saving, followsCurrentPeriod]);

  useEffect(() => {
    if (!data.reportMonth || !data.fiscalYearEnd) return;
    const financialYearStart = Number(data.fiscalYearEnd) - 1;
    let cancelled = false;
    const currentMonthNumber = Number(data.reportMonth.slice(5, 7));
    const previousPeriods = [1].map((offset) => {
      const previousEnd = Number(data.fiscalYearEnd) - offset;
      if (periodView === 'year') {
        return {
          key: `fy-${previousEnd}`,
          params: { company: industry, range: 'fy', year: previousEnd - 1 },
        };
      }
      const previousYear = currentMonthNumber >= 4 ? previousEnd - 1 : previousEnd;
      const month = `${previousYear}-${String(currentMonthNumber).padStart(2, '0')}`;
      return {
        key: `month-${month}`,
        params: { company: industry, range: 'selectedMonth', date: `${month}-01` },
      };
    });
    const activePeriod = periodView === 'year'
      ? { company: industry, range: 'fy', year: financialYearStart }
      : { company: industry, range: 'selectedMonth', date: `${data.reportMonth}-01` };
    Promise.all([
      api.get('/dashboard', { params: { ...activePeriod, compact: true } }),
      ...previousPeriods.map((period) => api.get('/dashboard', { params: { ...period.params, compact: true } })),
    ])
      .then(([activeResponse, ...previousResponses]) => {
        if (!cancelled) {
          setLinkedMetrics({
            month: periodView === 'month' ? activeResponse.data : null,
            year: periodView === 'year' ? activeResponse.data : null,
            previousPeriods: Object.fromEntries(previousPeriods.map((period, index) => [period.key, previousResponses[index].data])),
          });
        }
      })
      .catch(() => { if (!cancelled) setLinkedMetrics({ month: null, year: null, previousPeriods: {} }); });
    return () => { cancelled = true; };
  }, [industry, data.reportMonth, data.fiscalYearEnd, periodView]);

  const columns = useMemo(
    () => makeColumns(data.fiscalYearEnd, data.reportMonth, periodView),
    [data.fiscalYearEnd, data.reportMonth, periodView]
  );
  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const filteredRows = term
      ? data.particulars.filter((row) =>
        `${row.particular} ${Object.values(row.values || {}).join(' ')}`.toLocaleLowerCase().includes(term)
      )
      : data.particulars;
    if (!sortDirection) return filteredRows;

    return [...filteredRows].sort((left, right) => {
      const result = String(left.particular || '').localeCompare(String(right.particular || ''), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? result : -result;
    });
  }, [data.particulars, search, sortDirection]);

  function updateData(change) {
    setData((current) => ({ ...current, ...change }));
    setDirty(true);
    setSavedMessage('');
    setError('');
  }

  function updateRow(rowId, change) {
    updateData({
      particulars: data.particulars.map((row) => row.id === rowId ? { ...row, ...change } : row),
    });
  }

  async function save(nextData = data) {
    const incompleteRow = nextData.particulars.find((row) => !String(row.particular || '').trim());
    if (incompleteRow) {
      setError('Enter a particular name for each row, or remove rows that are not needed, before saving.');
      document.getElementById(`matrix-particular-${incompleteRow.id}`)?.focus();
      return false;
    }

    setSaving(true);
    setError('');
    setSavedMessage('');
    try {
      const response = await api.put('/operation-matrix', { industry, data: nextData });
      matrixCache.set(industry, response.data);
      setData(response.data.data);
      const savedPeriod = `${response.data.data.fiscalYearEnd}|${response.data.data.reportMonth}`;
      setSelectedPeriod(savedPeriod);
      setPeriodSelection(response.data.data);
      const currentPeriod = getIndianReportingPeriod();
      setFollowsCurrentPeriod(savedPeriod === `${currentPeriod.fiscalYearEnd}|${currentPeriod.reportMonth}`);
      setLastSaved({ by: response.data.updated_by, at: response.data.updated_at });
      setDirty(false);
      setSavedMessage('Saved');
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not save HR Matrix.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openSavedPeriod(fiscalYearEnd, reportMonth) {
    const value = `${fiscalYearEnd}|${reportMonth}`;
    const currentPeriod = getIndianReportingPeriod();
    if (value !== selectedPeriod && dirty && !window.confirm('Discard unsaved HR Matrix changes and open this period?')) {
      setPeriodSelection({ fiscalYearEnd: data.fiscalYearEnd, reportMonth: data.reportMonth });
      return;
    }
    setFollowsCurrentPeriod(value === `${currentPeriod.fiscalYearEnd}|${currentPeriod.reportMonth}`);
    setPeriodSelection({ fiscalYearEnd: Number(fiscalYearEnd), reportMonth });
    if (value === selectedPeriod) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/operation-matrix', { params: { industry, fiscalYearEnd, reportMonth } });
      matrixCache.set(industry, response.data);
      setData(includeHrSectionRows(response.data?.data || {
        fiscalYearEnd: Number(fiscalYearEnd),
        reportMonth,
        particulars: [],
      }));
      setLastSaved(response.data?.updated_at ? { by: response.data.updated_by, at: response.data.updated_at } : null);
      setSelectedPeriod(value);
      setPeriodSelection(response.data?.data || { fiscalYearEnd: Number(fiscalYearEnd), reportMonth });
      setDirty(false);
      setSavedMessage('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not load the saved reporting period.');
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(rowId) {
    const nextData = {
      ...data,
      particulars: data.particulars.filter((row) => row.id !== rowId),
    };
    updateData({ particulars: nextData.particulars });
    await save(nextData);
  }

  if (loading) {
    return <div style={{ color: C.ink2, fontSize: 13 }} className="py-10 text-center">Loading HR Matrix...</div>;
  }

  if (error && !data) {
    return <div role="alert" style={{ color: C.rust, fontSize: 13 }} className="flex items-center gap-2"><AlertCircle size={16} />{error}</div>;
  }

  const reportDate = new Date(`${data.reportMonth}-01T12:00:00`);
  const reportLabel = Number.isNaN(reportDate.getTime())
    ? data.reportMonth
    : reportDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const activeFy = fiscalYearLabel(data.fiscalYearEnd);

  return (
    <section className="operation-matrix" aria-labelledby="operation-matrix-title">
      <div className="operation-matrix-heading">
        <div>
          <div className="operation-matrix-kicker">MIS · {reportLabel}</div>
          <h1 id="operation-matrix-title">{label}</h1>
          <p>Reporting period: {activeFy}</p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => save()}
            disabled={saving || !dirty}
            className="operation-matrix-save"
            title={dirty ? 'Save HR Matrix' : 'No unsaved changes'}
          >
            {savedMessage ? <Check size={16} /> : <Save size={16} />}
            <span>{saving ? 'Saving...' : savedMessage || 'Save changes'}</span>
          </button>
        )}
      </div>

      <div className="operation-matrix-toolbar">
        <label className="operation-matrix-setting">
          <span>Month</span>
          <input
            type="month"
            value={periodSelection.reportMonth}
            required
            disabled={loading || saving}
            onChange={(event) => {
              if (!event.target.value) return;
              openSavedPeriod(fiscalYearEndForMonth(event.target.value), event.target.value);
            }}
          />
        </label>
        <label className="operation-matrix-setting">
          <span>Financial year (Apr–Mar)</span>
          <select
            value={periodSelection.fiscalYearEnd}
            disabled={loading || saving}
            onChange={(event) => {
              const fiscalYearEnd = Number(event.target.value);
              const month = Number(periodSelection.reportMonth.slice(5, 7));
              const calendarYear = month >= 4 ? fiscalYearEnd - 1 : fiscalYearEnd;
              openSavedPeriod(fiscalYearEnd, `${calendarYear}-${String(month).padStart(2, '0')}`);
            }}
          >
            {fiscalYearOptions(periodSelection.fiscalYearEnd).map((year) => (
              <option key={year} value={year}>{fiscalYearLabel(year)}</option>
            ))}
          </select>
        </label>
        <label className="operation-matrix-setting">
          <span>Data view</span>
          <select value={periodView} onChange={(event) => setPeriodView(event.target.value)}>
            <option value="month">Month-wise</option>
            <option value="year">Year-wise</option>
          </select>
        </label>
        <button
          type="button"
          className="operation-matrix-sort"
          disabled={loading || saving}
          onClick={() => openSavedPeriod(periodSelection.fiscalYearEnd, periodSelection.reportMonth)}
        >
          Open period
        </button>
        <label className="operation-matrix-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search particulars or values"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search HR Matrix"
          />
        </label>
        <button
          type="button"
          className="operation-matrix-sort"
          onClick={() => setSortDirection((current) => current === null ? 'asc' : current === 'asc' ? 'desc' : null)}
          title={sortDirection === 'asc' ? 'Sort Z-A' : sortDirection === 'desc' ? 'Clear sort' : 'Sort A-Z'}
          aria-label={sortDirection === 'asc' ? 'Sort particulars Z-A' : sortDirection === 'desc' ? 'Clear particulars sort' : 'Sort particulars A-Z'}
        >
          {sortDirection === 'desc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
          <span>{sortDirection === 'asc' ? 'Sort Z-A' : sortDirection === 'desc' ? 'Clear sort' : 'Sort A-Z'}</span>
        </button>
        {editable && (
          <button
            type="button"
            className="operation-matrix-add"
            disabled={saving}
            onClick={() => updateData({ particulars: [...data.particulars, newRow()] })}
          >
            <Plus size={16} /> <span>Add particular</span>
          </button>
        )}
        {creatable && (
          <button type="button" className="operation-matrix-add" disabled={saving} onClick={() => setShowImport(true)}>
            <FileSpreadsheet size={16} /> <span>Import Excel</span>
          </button>
        )}
      </div>

      {showImport && creatable && (
        <Suspense fallback={null}>
          <OperationMatrixExcelImport
            columns={columns}
            existingCount={data.particulars.length}
            onClose={() => setShowImport(false)}
            onImport={async (rows) => save({ ...data, particulars: [...data.particulars, ...rows] })}
          />
        </Suspense>
      )}

      {error && <div role="alert" className="operation-matrix-error"><AlertCircle size={16} />{error}</div>}

      <div className="operation-matrix-table-wrap">
        <table className="operation-matrix-table">
          <thead>
            <tr>
              <th rowSpan={2} className="operation-matrix-serial-head">S. No.</th>
              <th rowSpan={2} className="operation-matrix-particular-head">Particulars</th>
              {columns.map((column, index) => {
                if (!column.group) return <th key={column.key} rowSpan={2}>{column.label}</th>;
                if (columns[index - 1]?.group === column.group) return null;
                const groupSize = columns.slice(index).findIndex((candidate) => candidate.group !== column.group);
                return <th key={column.group} colSpan={groupSize === -1 ? columns.length - index : groupSize}>{column.group}</th>;
              })}
              {canDelete && <th rowSpan={2} aria-label="Row actions" />}
            </tr>
            <tr>
              {columns.filter((column) => column.group).map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={row.id}>
                <td className="operation-matrix-serial-cell">{index + 1}</td>
                <td className="operation-matrix-particular-cell">
                  {editable && !row.id.startsWith('hr-section-') ? (
                    <input
                      id={`matrix-particular-${row.id}`}
                      type="text"
                      maxLength={200}
                      value={row.particular}
                      disabled={saving}
                      onChange={(event) => updateRow(row.id, { particular: event.target.value })}
                      aria-label="Particular name"
                      aria-required="true"
                      placeholder="Enter particular"
                    />
                  ) : row.particular}
                </td>
                {columns.map((column) => (
                  <td key={column.key}>
                    {isHrSectionRow(row) && column.linkedPeriod ? (() => {
                      const source = column.linkedPeriod === 'previous'
                        ? linkedMetrics.previousPeriods[column.key]
                        : linkedMetrics[column.linkedPeriod];
                      const value = source ? linkedSectionValue(row.particular, source) : null;
                      return value === null
                        ? <span className="operation-matrix-number" title="No linked data available">—</span>
                        : <span className="operation-matrix-number" title="Linked from this company’s dashboard data">{value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>;
                    })() : editable ? (
                      <input
                        type="number"
                        step="any"
                        value={row.values?.[column.key] ?? ''}
                        disabled={saving}
                        onChange={(event) => updateRow(row.id, {
                          values: { ...row.values, [column.key]: event.target.value },
                        })}
                        aria-label={`${row.particular || 'Particular'} ${column.label}`}
                      />
                    ) : (
                      <span className="operation-matrix-number">
                        {row.values?.[column.key] === undefined || row.values?.[column.key] === ''
                          ? ''
                          : Number.isFinite(Number(row.values[column.key]))
                            ? Number(row.values[column.key]).toLocaleString('en-IN')
                            : row.values[column.key]}
                      </span>
                    )}
                  </td>
                ))}
                {canDelete && (
                  <td className="operation-matrix-row-action">
                    <button
                      type="button"
                      disabled={saving || row.id.startsWith('hr-section-')}
                      onClick={() => removeRow(row.id)}
                      title={`Remove ${row.particular || 'particular'}`}
                      aria-label={`Remove ${row.particular || 'particular'}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (canDelete ? 3 : 2)} className="operation-matrix-empty">
                  {search ? 'No matching particulars.' : 'No particulars yet. Add a row to start building the matrix.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="operation-matrix-footer">
        <span>{visibleRows.length} of {data.particulars.length} particulars</span>
        {lastSaved?.at && <span>Last saved {lastSaved.by ? `by ${lastSaved.by} ` : ''}{new Date(lastSaved.at).toLocaleString('en-IN')}</span>}
      </div>
    </section>
  );
}
