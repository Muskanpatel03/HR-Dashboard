import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Plus, Save, Search, Trash2 } from 'lucide-react';
import api from '../api';
import { C, FONT_HEAD } from '../config';

const INITIAL_DATA = {
  fiscalYearEnd: 2027,
  reportMonth: '2026-08',
  particulars: [],
};

function fiscalYearLabel(year) {
  const normalized = Number(year);
  if (!Number.isFinite(normalized)) return String(year);
  return `FY ${normalized - 1}-${String(normalized).slice(-2)}`;
}

function extractFiscalYearFromKey(key) {
  if (typeof key !== 'string') return null;

  const cleaned = key.trim();
  const patterns = [
    /^(?:fy|actual|target|revisedTarget)[-_]?(\d{4})$/i,
    /^(?:fy|actual|target|revisedTarget)[-_]?(\d{4})[-/](\d{2})$/i,
    /^(?:fy|actual|target|revisedTarget)[-_]?(\d{2})(\d{2})$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;

    if (match[2]) {
      return Number(match[1]) + 1;
    }

    if (match[1] && pattern.source.includes('\\d{2}\\d{2}')) {
      return Number(`20${match[1]}`) + 1;
    }

    if (match[1]) {
      return Number(match[1]);
    }
  }

  return null;
}

function detectFiscalYears(particulars, fiscalYearEnd) {
  const years = new Set([
    fiscalYearEnd,
    fiscalYearEnd - 1,
    fiscalYearEnd - 2,
    fiscalYearEnd - 3,
    fiscalYearEnd - 4,
  ]);

  particulars.forEach((row) => {
    Object.keys(row.values || {}).forEach((key) => {
      const year = extractFiscalYearFromKey(key);
      if (Number.isInteger(year)) years.add(year);
    });
  });

  return [...years].filter(Number.isInteger).sort((a, b) => a - b);
}

function makeColumns(fiscalYearEnd, reportMonth, particulars, yearFilter) {
  const fiscalYears = detectFiscalYears(particulars, fiscalYearEnd);
  const activeYear = yearFilter === 'current' ? fiscalYearEnd : Number(yearFilter);
  const yearsToShow = yearFilter === 'all'
    ? fiscalYears
    : fiscalYears.filter((year) => year === activeYear);
  const monthDate = new Date(`${reportMonth}-01T12:00:00`);
  const monthLabel = Number.isNaN(monthDate.getTime())
    ? reportMonth
    : monthDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }).replace(' ', '-');
  const yearLabel = Number.isNaN(monthDate.getTime())
    ? reportMonth.slice(0, 4)
    : monthDate.getFullYear();

  const fiscalColumns = yearsToShow.flatMap((year) => {
    const hasCurrentMetrics = particulars.some((row) =>
      Object.keys(row.values || {}).some((key) => {
        const parsedYear = extractFiscalYearFromKey(key);
        return parsedYear === year && ['actual', 'target', 'revisedtarget'].includes(String(key).split('-')[0].toLowerCase());
      })
    );

    if (year === fiscalYearEnd || hasCurrentMetrics) {
      return [
        { key: `actual-${year}`, label: 'Actual / Target', group: fiscalYearLabel(year) },
        { key: `target-${year}`, label: 'Actual / Target', group: fiscalYearLabel(year) },
        { key: `revisedTarget-${year}`, label: 'Revised Target', group: fiscalYearLabel(year) },
      ];
    }

    return [{ key: `fy-${year}`, label: fiscalYearLabel(year) }];
  });

  return [
    ...fiscalColumns,
    { key: `month-${reportMonth}`, label: 'Month' },
    { key: `year-${reportMonth}`, label: 'Year', value: yearLabel },
    { key: `ytd-${reportMonth}`, label: 'YTD' },
  ];
}

function newRow() {
  return {
    id: globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    particular: '',
    values: {},
  };
}

export default function OperationMatrix({ industry, label = industry, editable }) {
  const [data, setData] = useState(INITIAL_DATA);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('current');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    api.get('/operation-matrix', { params: { industry } })
      .then((response) => {
        setData(response.data?.data || INITIAL_DATA);
        setLastSaved(response.data?.updated_at ? {
          by: response.data.updated_by,
          at: response.data.updated_at,
        } : null);
        setDirty(false);
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.error || 'Could not load the Operation Matrix.');
      })
      .finally(() => setLoading(false));
  }, [industry]);

  const columns = useMemo(
    () => makeColumns(data.fiscalYearEnd, data.reportMonth, data.particulars, yearFilter === 'current' ? data.fiscalYearEnd : yearFilter),
    [data.fiscalYearEnd, data.reportMonth, data.particulars, yearFilter]
  );
  const fiscalYears = useMemo(
    () => detectFiscalYears(data.particulars, data.fiscalYearEnd),
    [data.particulars, data.fiscalYearEnd]
  );
  const fiscalColumns = columns.filter((column) => column.group || column.key.startsWith('fy-'));
  const fiscalHeaderGroups = fiscalColumns.reduce((groups, column) => {
    const label = column.group || column.label;
    const previousGroup = groups[groups.length - 1];
    if (column.group && previousGroup?.label === label) previousGroup.columns.push(column);
    else groups.push({ label, columns: [column], grouped: Boolean(column.group) });
    return groups;
  }, []);
  const monthYearColumns = columns.filter((column) => ['month', 'year', 'ytd'].includes(column.key.split('-')[0]));
  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return data.particulars;
    return data.particulars.filter((row) =>
      `${row.particular} ${Object.values(row.values || {}).join(' ')}`.toLocaleLowerCase().includes(term)
    );
  }, [data.particulars, search]);

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

  async function save() {
    setSaving(true);
    setError('');
    setSavedMessage('');
    try {
      const response = await api.put('/operation-matrix', { industry, data });
      setData(response.data.data);
      setLastSaved({ by: response.data.updated_by, at: response.data.updated_at });
      setDirty(false);
      setSavedMessage('Saved');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not save the Operation Matrix.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ color: C.ink2, fontSize: 13 }} className="py-10 text-center">Loading Operation Matrix...</div>;
  }

  if (error && !data) {
    return <div role="alert" style={{ color: C.rust, fontSize: 13 }} className="flex items-center gap-2"><AlertCircle size={16} />{error}</div>;
  }

  const reportDate = new Date(`${data.reportMonth}-01T12:00:00`);
  const reportLabel = Number.isNaN(reportDate.getTime())
    ? data.reportMonth
    : reportDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const activeFy = `FY ${data.fiscalYearEnd - 1}-${String(data.fiscalYearEnd).slice(-2)}`;

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
            onClick={save}
            disabled={saving || !dirty}
            className="operation-matrix-save"
            title={dirty ? 'Save Operation Matrix' : 'No unsaved changes'}
          >
            {savedMessage ? <Check size={16} /> : <Save size={16} />}
            <span>{saving ? 'Saving...' : savedMessage || 'Save changes'}</span>
          </button>
        )}
      </div>

      <div className="operation-matrix-toolbar">
        <label className="operation-matrix-setting">
          <span>Year / Session</span>
          <select
            value={data.fiscalYearEnd}
            disabled={!editable}
            onChange={(event) => updateData({ fiscalYearEnd: Number(event.target.value) })}
          >
            {Array.from({ length: 101 }, (_, index) => 2100 - index).map((year) => (
              <option key={year} value={year}>{year - 1}-{String(year).slice(-2)}</option>
            ))}
          </select>
        </label>
        <label className="operation-matrix-setting">
          <span>Reporting month</span>
          <input
            type="month"
            value={data.reportMonth}
            disabled={!editable}
            onChange={(event) => updateData({ reportMonth: event.target.value })}
          />
        </label>
        <label className="operation-matrix-setting">
          <span>Fiscal year filter</span>
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="current">Current ({fiscalYearLabel(data.fiscalYearEnd)})</option>
            <option value="all">All years</option>
            {fiscalYears.filter((year) => year !== data.fiscalYearEnd).map((year) => (
              <option key={year} value={year}>{fiscalYearLabel(year)}</option>
            ))}
          </select>
        </label>
        <label className="operation-matrix-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search particulars or values"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search Operation Matrix"
          />
        </label>
        {editable && (
          <button
            type="button"
            className="operation-matrix-add"
            onClick={() => updateData({ particulars: [...data.particulars, newRow()] })}
          >
            <Plus size={16} /> <span>Add particular</span>
          </button>
        )}
      </div>

      {error && <div role="alert" className="operation-matrix-error"><AlertCircle size={16} />{error}</div>}

      <div className="operation-matrix-table-wrap">
        <table className="operation-matrix-table">
          <thead>
            <tr>
              <th rowSpan={2} className="operation-matrix-serial-head">S. No.</th>
              <th rowSpan={2} className="operation-matrix-particular-head">Particulars</th>
              {fiscalHeaderGroups.map((group) => (
                <th key={group.label} colSpan={group.columns.length} rowSpan={group.grouped ? 1 : 2}>
                  {group.label}
                </th>
              ))}
              {monthYearColumns.map((column) => <th key={column.key} rowSpan={2}>{column.label}</th>)}
              {editable && <th rowSpan={2} aria-label="Row actions" />}
            </tr>
            <tr>
              {fiscalHeaderGroups.filter((group) => group.grouped).flatMap((group) =>
                group.columns.map((column) => <th key={column.key}>{column.label}</th>)
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={row.id}>
                <td className="operation-matrix-serial-cell">{index + 1}</td>
                <td className="operation-matrix-particular-cell">
                  {editable ? (
                    <input
                      type="text"
                      maxLength={200}
                      value={row.particular}
                      onChange={(event) => updateRow(row.id, { particular: event.target.value })}
                      aria-label="Particular name"
                      placeholder="Enter particular"
                    />
                  ) : row.particular}
                </td>
                {columns.map((column) => (
                  <td key={column.key}>
                    {editable ? (
                      <input
                        type="number"
                        step="any"
                        value={row.values?.[column.key] ?? ''}
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
                {editable && (
                  <td className="operation-matrix-row-action">
                    <button
                      type="button"
                      onClick={() => updateData({ particulars: data.particulars.filter((item) => item.id !== row.id) })}
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
                <td colSpan={columns.length + (editable ? 3 : 2)} className="operation-matrix-empty">
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
