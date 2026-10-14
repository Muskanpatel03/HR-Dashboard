import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileSpreadsheet, LoaderCircle, X } from 'lucide-react';
import api from '../api';
import { C, COMPANY_OPTIONS } from '../config';

const MAX_ROWS = 20000;
const BATCH_SIZE = 100;
const keyFor = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const IMPORT_HEADER_ALIASES = {
  date: ['Date', 'Daily Date', 'Manpower Date', 'Attendance Date'],
  departmentProduction: ['Department', 'Department Name', 'Deptt', 'DEPTT_PRODUCTION', 'DEPTT_NON PRODUCTION'],
};
const toIsoDate = (value, type) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString().slice(0, 10);
    return type === 'month' ? iso.slice(0, 7) : iso;
  }
  if (typeof value === 'number' && (type === 'date' || type === 'month')) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts) return `${String(parts.y).padStart(4, '0')}-${String(parts.m).padStart(2, '0')}${type === 'date' ? `-${String(parts.d).padStart(2, '0')}` : ''}`;
  }
  if ((type === 'date' || type === 'month') && typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}${type === 'date' && match[3] ? `-${String(match[3]).padStart(2, '0')}` : type === 'date' ? '-01' : ''}`;
    const localMatch = value.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (type === 'date' && localMatch) return `${localMatch[3]}-${String(localMatch[2]).padStart(2, '0')}-${String(localMatch[1]).padStart(2, '0')}`;
  }
  return value == null ? '' : String(value).trim();
};

export default function ExcelImport({ config, companyId, onClose, onImported }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [defaultCompany, setDefaultCompany] = useState(companyId && companyId !== 'all' ? companyId : '');
  const [dailyImportDate, setDailyImportDate] = useState('');
  const [dailyImportMonth, setDailyImportMonth] = useState('');
  const [overrideDailyDates, setOverrideDailyDates] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);

  const mapping = useMemo(() => {
    const used = new Set();
    const fields = config.fields;
    const mapped = fields.map((field) => {
      const candidates = [field.name, field.label, ...(IMPORT_HEADER_ALIASES[field.name] || [])].map(keyFor);
      const index = headers.findIndex((header, i) => !used.has(i) && candidates.includes(keyFor(header)));
      if (index >= 0) used.add(index);
      return { field, index };
    });
    return { fields: mapped, matched: mapped.filter((item) => item.index >= 0), ignored: headers.filter((_, i) => !used.has(i)) };
  }, [config.fields, headers]);

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    setError(''); setResult(null); setRows([]); setHeaders([]); setFileName('');
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const acceptedHeaders = new Set(config.fields.flatMap((field) => [field.name, field.label, ...(IMPORT_HEADER_ALIASES[field.name] || [])].map(keyFor)));
      const sheetNames = config.key === 'dailyManpower' ? workbook.SheetNames : workbook.SheetNames.slice(0, 1);
      const parsedSheets = sheetNames.map((sheetName) => {
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true, blankrows: false });
        const headerCandidates = matrix.slice(0, 30).map((row, index) => ({
          index,
          score: row.reduce((total, cell) => total + (acceptedHeaders.has(keyFor(cell)) ? 1 : 0), 0),
          hasContent: row.some((cell) => String(cell ?? '').trim()),
        })).filter((candidate) => candidate.hasContent);
        const bestHeader = headerCandidates.reduce((best, candidate) => candidate.score > best.score ? candidate : best, { index: -1, score: 0 });
        const headerRow = bestHeader.score > 0 ? bestHeader.index : matrix.findIndex((row) => row.some((cell) => String(cell ?? '').trim()));
        if (headerRow < 0 || !matrix[headerRow + 1]) return null;
        const sheetHeaders = matrix[headerRow].map((cell) => String(cell ?? '').trim());
        const departmentHeader = sheetHeaders.some((header) => [ 'departmentProduction', ...(IMPORT_HEADER_ALIASES.departmentProduction || []) ].some((alias) => keyFor(alias) === keyFor(header)));
        if (config.key === 'dailyManpower' && !departmentHeader) return null;
        const departmentIndex = sheetHeaders.findIndex((header) => [ 'departmentProduction', ...(IMPORT_HEADER_ALIASES.departmentProduction || []) ].some((alias) => keyFor(alias) === keyFor(header)));
        const sheetRows = matrix.slice(headerRow + 1).filter((row) => {
          if (!row.some((cell) => String(cell ?? '').trim() !== '')) return false;
          if (config.key !== 'dailyManpower' || departmentIndex < 0) return true;
          const departmentValue = keyFor(row[departmentIndex]);
          const repeatedHeader = [ 'departmentProduction', ...(IMPORT_HEADER_ALIASES.departmentProduction || []) ].some((alias) => keyFor(alias) === departmentValue);
          return !['total', 'grandtotal', 'summary'].includes(departmentValue) && !repeatedHeader;
        });
        return { sheetName, headers: sheetHeaders, rows: sheetRows };
      }).filter(Boolean);
      if (!parsedSheets.length) throw new Error(config.key === 'dailyManpower'
        ? 'No worksheet has a Department column. Use Department, Deptt, DEPTT_PRODUCTION, or DEPTT_NON PRODUCTION as the heading.'
        : 'The first worksheet needs a header row and at least one data row.');
      const canonicalHeader = (header) => {
        const field = config.fields.find((candidate) => [candidate.name, candidate.label, ...(IMPORT_HEADER_ALIASES[candidate.name] || [])].some((alias) => keyFor(alias) === keyFor(header)));
        return field?.name || header;
      };
      const nextHeaders = [...new Set(parsedSheets.flatMap(({ headers: sheetHeaders }) => sheetHeaders.map(canonicalHeader)))];
      const dataRows = parsedSheets.flatMap(({ sheetName, headers: sheetHeaders, rows: sheetRows }) => {
        const canonicalHeaders = sheetHeaders.map(canonicalHeader);
        return sheetRows.map((row) => {
          const mappedRow = nextHeaders.map((header) => {
          const index = canonicalHeaders.indexOf(header);
          return index >= 0 ? row[index] ?? '' : '';
          });
          mappedRow.sourceSheet = sheetName;
          return mappedRow;
        });
      });
      if (!dataRows.length) throw new Error('No data rows were found below the headers.');
      if (dataRows.length > MAX_ROWS) throw new Error(`This import supports up to ${MAX_ROWS} rows at a time. Split the sheet and upload it in smaller batches.`);
      setHeaders(nextHeaders); setRows(dataRows); setFileName(file.name);
    } catch (err) {
      setError(err.message || 'Could not read this Excel file.');
      event.target.value = '';
    }
  };

  const importRows = async () => {
    if (config.key === 'usersmgmt') {
      const required = ['name', 'email', 'designation', 'password'];
      const missing = required.filter((name) => !mapping.fields.some((item) => item.field.name === name && item.index >= 0));
      if (missing.length) {
        setError(`User imports require these columns: ${missing.join(', ')}.`);
        return;
      }
    }
    setError(''); setBusy(true); setResult(null);
    let imported = 0;
    const failures = [];
    const validRows = [];
    try {
      for (let i = 0; i < rows.length; i += 1) {
        const record = Object.fromEntries(mapping.fields.map(({ field, index }) => [field.name, index >= 0 ? toIsoDate(rows[i][index], field.type) : '']));
        if (config.key === 'dailyManpower' && !overrideDailyDates && !record.date && dailyImportMonth && /^\d{1,2}$/.test(rows[i].sourceSheet || '')) {
          const day = Number(rows[i].sourceSheet);
          const date = `${dailyImportMonth}-${String(day).padStart(2, '0')}`;
          const parsed = new Date(`${date}T00:00:00`);
          if (parsed.getFullYear() === Number(dailyImportMonth.slice(0, 4)) && parsed.getMonth() + 1 === Number(dailyImportMonth.slice(5, 7)) && parsed.getDate() === day) record.date = date;
        }
        if (config.key === 'dailyManpower' && dailyImportDate && (overrideDailyDates || !record.date)) record.date = dailyImportDate;
        if (record.company && companyId && companyId !== 'all' && record.company !== companyId) {
          failures.push({ row: i + 2, message: 'Company differs from the selected company.' });
          continue;
        }
        if (!record.company) record.company = defaultCompany;
        if (config.fields.some((field) => field.name === 'company') && !record.company) {
          failures.push({ row: i + 2, message: 'Company is blank; choose a default company or fill the Company column.' });
          continue;
        }
        if (config.key === 'usersmgmt') {
          const missing = ['name', 'email', 'designation', 'password'].filter((field) => !String(record[field] ?? '').trim());
          if (missing.length) {
            failures.push({ row: i + 2, message: `Required user fields are blank: ${missing.join(', ')}.` });
            continue;
          }
        }
        if (config.key === 'dailyManpower') {
          if (!record.date || !record.departmentProduction) {
            const missing = [!record.date && 'Date', !record.departmentProduction && 'Department'].filter(Boolean);
            failures.push({ row: i + 2, message: `${missing.join(' and ')} missing. Add a matching column or use the Import date picker for missing dates.` });
            continue;
          }
          const departmentField = config.fields.find((field) => field.name === 'departmentProduction');
          const production = departmentField.optionsFor({ departmentType: 'Production' });
          const nonProduction = departmentField.optionsFor({ departmentType: 'Non-Production' });
          const normalizedDepartment = keyFor(record.departmentProduction);
          const productionDepartment = production.find((department) => keyFor(department) === normalizedDepartment);
          const nonProductionDepartment = nonProduction.find((department) => keyFor(department) === normalizedDepartment);
          if (productionDepartment) {
            record.departmentProduction = productionDepartment;
            record.departmentType = 'Production';
          } else if (nonProductionDepartment) {
            record.departmentProduction = nonProductionDepartment;
            record.departmentType = 'Non-Production';
          } else {
            failures.push({ row: i + 2, message: 'Department does not match a predefined Daily Manpower department.' });
            continue;
          }
        }
        validRows.push({ row: i + 2, record });
      }
      for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
        const batch = validRows.slice(start, start + BATCH_SIZE);
        setProgress(`Importing rows ${start + 1}-${start + batch.length} of ${validRows.length}...`);
        try {
          const response = await api.post(`/${config.key}/import-batch`, { records: batch.map(({ record }) => record) });
          imported += response.data.imported;
          response.data.failures.forEach((failure) => failures.push({ row: batch[failure.index]?.row ?? '?', message: failure.message }));
        } catch (err) {
          const message = err.response?.data?.error || 'Import batch failed.';
          batch.forEach(({ row }) => failures.push({ row, message }));
        }
      }
      setResult({ imported, failures });
      if (imported) await onImported?.();
    } finally {
      setBusy(false); setProgress('');
    }
  };

  const previewFields = mapping.matched.filter(({ field }) => field.type !== 'password');
  const companyRequired = config.fields.some((field) => field.name === 'company') && !defaultCompany && !mapping.fields.find((item) => item.field.name === 'company' && item.index >= 0);
  const dailyDateColumn = mapping.fields.find((item) => item.field.name === 'date');
  const dailyDateMissing = !dailyDateColumn || rows.some((row) => !toIsoDate(row[dailyDateColumn.index], 'date'));
  const numberedSheetDatesAvailable = rows.length > 0 && rows.every((row) => /^\d{1,2}$/.test(row.sourceSheet || '')) && Boolean(dailyImportMonth);
  const dailyDateRequired = config.key === 'dailyManpower' && dailyDateMissing && !dailyImportDate && !numberedSheetDatesAvailable;
  const dailyDepartmentMapped = mapping.fields.some((item) => item.field.name === 'departmentProduction' && item.index >= 0);
  const dailyDepartmentRequired = config.key === 'dailyManpower' && !dailyDepartmentMapped;

  return (
    <section className="rounded p-4 space-y-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" style={{ color: C.ink, fontWeight: 600 }}><FileSpreadsheet size={17} /> Import Excel into {config.label}</div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close Excel import"><X size={17} /></button>
      </div>
      <p className="text-xs" style={{ color: C.ink2 }}>{config.key === 'dailyManpower' ? 'All worksheets with a Department column are combined. For numbered day tabs such as 01-31, choose the month below so each tab becomes that date. Put one department record per row.' : 'The first worksheet is used.'} Dates in the sheet are kept unless you choose a date below and select "Use this date for every row." The selected date also fills blank or missing dates. Imports support up to {MAX_ROWS.toLocaleString()} rows and are sent in batches.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs space-y-1" style={{ color: C.ink2 }}>Excel file (.xlsx, .xls, .xlsm)
          <input type="file" accept=".xlsx,.xls,.xlsm" onChange={chooseFile} disabled={busy} className="block mt-1 text-sm" />
        </label>
        {config.key === 'dailyManpower' && (
          <label className="text-xs space-y-1" style={{ color: C.ink2 }}>Import date
            <input type="date" value={dailyImportDate} onChange={(event) => setDailyImportDate(event.target.value)} disabled={busy} className="block mt-1 px-2 py-2 rounded text-sm" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          </label>
        )}
        {config.key === 'dailyManpower' && (
          <label className="text-xs space-y-1" style={{ color: C.ink2 }}>Month for numbered worksheet tabs
            <input type="month" value={dailyImportMonth} onChange={(event) => setDailyImportMonth(event.target.value)} disabled={busy} className="block mt-1 px-2 py-2 rounded text-sm" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          </label>
        )}
        {config.key === 'dailyManpower' && (
          <label className="flex items-center gap-2 pb-2 text-xs" style={{ color: C.ink2 }}>
            <input type="checkbox" checked={overrideDailyDates} onChange={(event) => setOverrideDailyDates(event.target.checked)} disabled={busy || !dailyImportDate} />
            Use this date for every row
          </label>
        )}
        {config.fields.some((field) => field.name === 'company') && (
          <label className="text-xs space-y-1" style={{ color: C.ink2 }}>Default company for rows without one
            <select value={defaultCompany} onChange={(event) => setDefaultCompany(event.target.value)} disabled={busy || (companyId && companyId !== 'all')} className="block mt-1 px-2 py-2 rounded text-sm" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
              <option value="">Choose company</option>
              {COMPANY_OPTIONS.map((company) => <option key={company.id} value={company.id}>{company.label}</option>)}
            </select>
          </label>
        )}
      </div>
      {fileName && <div className="text-xs" style={{ color: C.ink2 }}>{fileName} · {rows.length} data rows · {mapping.matched.length} matched fields · {mapping.ignored.length} ignored columns</div>}
      {!!previewFields.length && (
        <div className="flex flex-wrap gap-1.5">{previewFields.map(({ field }) => <span key={field.name} className="px-2 py-1 rounded text-xs" style={{ background: C.navyWash, color: C.ink }}>{field.label}</span>)}</div>
      )}
      {rows.length > 0 && !result && <div className="overflow-x-auto"><table className="text-xs w-full"><thead><tr>{previewFields.slice(0, 6).map(({ field }) => <th key={field.name} className="p-2 text-left" style={{ color: C.ink2 }}>{field.label}</th>)}</tr></thead><tbody>{rows.slice(0, 3).map((row, ri) => <tr key={ri} style={{ borderTop: `1px solid ${C.line}` }}>{previewFields.slice(0, 6).map(({ field, index }) => <td key={field.name} className="p-2" style={{ color: C.ink }}>{String(row[index] ?? '')}</td>)}</tr>)}</tbody></table></div>}
      {companyRequired && rows.length > 0 && <div className="text-xs" style={{ color: C.rust }}>Choose a default company or include a Company column before importing.</div>}
      {dailyDateRequired && rows.length > 0 && <div className="text-xs" style={{ color: C.rust }}>Some rows have no Date. Choose an Import date to fill them, or add a Date column with one date per row.</div>}
      {dailyDepartmentRequired && rows.length > 0 && <div className="text-xs" style={{ color: C.rust }}>Add a Department column. Accepted headings include Department, Deptt, DEPTT_PRODUCTION, and DEPTT_NON PRODUCTION.</div>}
      {error && <div className="flex gap-1.5 items-center text-sm" style={{ color: C.rust }}><AlertCircle size={15} />{error}</div>}
      {progress && <div className="flex gap-1.5 items-center text-sm" style={{ color: C.ink2 }}><LoaderCircle size={15} />{progress}</div>}
      {result && <div className="space-y-2 text-sm" aria-live="polite"><div className="flex gap-1.5 items-center" style={{ color: result.failures.length ? C.rust : C.moss }}><CheckCircle2 size={16} />Imported {result.imported} of {rows.length} rows{result.failures.length ? `; ${result.failures.length} failed.` : '.'}</div>{result.failures.length > 0 && <ul className="max-h-28 overflow-auto text-xs" style={{ color: C.rust }}>{result.failures.slice(0, 12).map((failure) => <li key={failure.row}>Row {failure.row}: {failure.message}</li>)}</ul>}</div>}
      <div className="flex gap-2">
        {rows.length > 0 && !result && <button type="button" onClick={importRows} disabled={busy || !mapping.matched.length || companyRequired || dailyDateRequired || dailyDepartmentRequired} className="px-3 py-2 text-sm rounded" style={{ background: C.steel, color: '#fff', opacity: busy || !mapping.matched.length || companyRequired || dailyDateRequired || dailyDepartmentRequired ? 0.5 : 1 }}>Import {rows.length} rows</button>}
        {result && <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded" style={{ border: `1px solid ${C.line}`, color: C.ink }}>Done</button>}
        <button type="button" onClick={onClose} disabled={busy} className="px-3 py-2 text-sm rounded" style={{ border: `1px solid ${C.line}`, color: C.ink2 }}>Cancel</button>
      </div>
    </section>
  );
}
