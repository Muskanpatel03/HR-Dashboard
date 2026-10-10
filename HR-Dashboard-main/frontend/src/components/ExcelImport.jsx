import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileSpreadsheet, LoaderCircle, X } from 'lucide-react';
import api from '../api';
import { C, COMPANY_OPTIONS } from '../config';

const MAX_ROWS = 500;
const keyFor = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
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
  }
  return value == null ? '' : String(value).trim();
};

export default function ExcelImport({ config, companyId, onClose, onImported }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [defaultCompany, setDefaultCompany] = useState(companyId && companyId !== 'all' ? companyId : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);

  const mapping = useMemo(() => {
    const used = new Set();
    const fields = config.fields;
    const mapped = fields.map((field) => {
      const candidates = [field.name, field.label].map(keyFor);
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
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
      const headerRow = matrix.findIndex((row) => row.some((cell) => String(cell ?? '').trim()));
      if (headerRow < 0 || !matrix[headerRow + 1]) throw new Error('The first worksheet needs a header row and at least one data row.');
      const nextHeaders = matrix[headerRow].map((cell) => String(cell ?? '').trim());
      const dataRows = matrix.slice(headerRow + 1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== '')).map((row) => row.slice(0, nextHeaders.length));
      if (!dataRows.length) throw new Error('No data rows were found below the header.');
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
    try {
      for (let i = 0; i < rows.length; i += 1) {
        const record = Object.fromEntries(mapping.fields.map(({ field, index }) => [field.name, index >= 0 ? toIsoDate(rows[i][index], field.type) : '']));
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
        if (config.key === 'dailyManpower' && !record.departmentType && record.departmentProduction) record.departmentType = 'Production';
        setProgress(`Importing row ${i + 1} of ${rows.length}…`);
        try {
          await api.post(`/${config.key}`, record);
          imported += 1;
        } catch (err) {
          failures.push({ row: i + 2, message: err.response?.data?.error || 'Import failed.' });
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

  return (
    <section className="rounded p-4 space-y-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" style={{ color: C.ink, fontWeight: 600 }}><FileSpreadsheet size={17} /> Import Excel into {config.label}</div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close Excel import"><X size={17} /></button>
      </div>
      <p className="text-xs" style={{ color: C.ink2 }}>The first worksheet is used. Columns are matched by field name or label; missing fields stay blank and unmatched columns are ignored. User imports require name, email, designation, and password. Up to {MAX_ROWS} rows per import.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs space-y-1" style={{ color: C.ink2 }}>Excel file (.xlsx, .xls, .xlsm)
          <input type="file" accept=".xlsx,.xls,.xlsm" onChange={chooseFile} disabled={busy} className="block mt-1 text-sm" />
        </label>
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
      {error && <div className="flex gap-1.5 items-center text-sm" style={{ color: C.rust }}><AlertCircle size={15} />{error}</div>}
      {progress && <div className="flex gap-1.5 items-center text-sm" style={{ color: C.ink2 }}><LoaderCircle size={15} />{progress}</div>}
      {result && <div className="space-y-2 text-sm" aria-live="polite"><div className="flex gap-1.5 items-center" style={{ color: result.failures.length ? C.rust : C.moss }}><CheckCircle2 size={16} />Imported {result.imported} of {rows.length} rows{result.failures.length ? `; ${result.failures.length} failed.` : '.'}</div>{result.failures.length > 0 && <ul className="max-h-28 overflow-auto text-xs" style={{ color: C.rust }}>{result.failures.slice(0, 12).map((failure) => <li key={failure.row}>Row {failure.row}: {failure.message}</li>)}</ul>}</div>}
      <div className="flex gap-2">
        {rows.length > 0 && !result && <button type="button" onClick={importRows} disabled={busy || !mapping.matched.length || companyRequired} className="px-3 py-2 text-sm rounded" style={{ background: C.steel, color: '#fff', opacity: busy || !mapping.matched.length || companyRequired ? 0.5 : 1 }}>Import {rows.length} rows</button>}
        {result && <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded" style={{ border: `1px solid ${C.line}`, color: C.ink }}>Done</button>}
        <button type="button" onClick={onClose} disabled={busy} className="px-3 py-2 text-sm rounded" style={{ border: `1px solid ${C.line}`, color: C.ink2 }}>Cancel</button>
      </div>
    </section>
  );
}
