import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileSpreadsheet, LoaderCircle, X } from 'lucide-react';
import { C } from '../config';

const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const makeId = () => globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const parseNumber = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  const clean = String(value).trim().replace(/[,\u00a0]/g, '');
  if (!clean) return '';
  const number = Number(clean);
  return Number.isFinite(number) ? number : clean;
};

export default function OperationMatrixExcelImport({ columns, existingCount, onClose, onImport }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);

  const mapping = useMemo(() => columns.map((column) => {
    const index = headers.findIndex((header) => {
      const value = normalize(header);
      const key = normalize(column.key);
      const label = normalize(column.label);
      return value === key || value === label || (column.group && value.includes(label));
    });
    return { column, index };
  }), [columns, headers]);

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    setError(''); setResult(null); setRows([]); setHeaders([]); setFileName('');
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
      const headerIndex = matrix.findIndex((row) => row.some((cell) => ['particular', 'particulars'].includes(normalize(cell))));
      if (headerIndex < 0) throw new Error('A header named Particular or Particulars is required.');
      const current = matrix[headerIndex];
      const previous = matrix[headerIndex - 1] || [];
      const nextHeaders = current.map((cell, index) => {
        const child = String(cell ?? '').trim();
        const parent = String(previous[index] ?? '').trim();
        return child && parent && normalize(child) !== normalize(parent) ? `${parent} ${child}` : child || parent;
      });
      const particularIndex = nextHeaders.findIndex((header) => ['particular', 'particulars', 'item', 'itemname'].includes(normalize(header)));
      const dataRows = matrix.slice(headerIndex + 1)
        .map((row, index) => ({ row, sourceRow: headerIndex + index + 2 }))
        .filter(({ row }) => row.some((cell) => String(cell ?? '').trim() !== ''));
      if (!dataRows.length) throw new Error('No data rows were found below the header.');
      const available = Math.max(0, 500 - existingCount);
      if (existingCount + dataRows.length > 500) throw new Error(`The matrix supports 500 particulars total. There is room for ${available} more.`);
      setHeaders(nextHeaders); setRows(dataRows.map(({ row, sourceRow }) => ({ row: row.slice(0, nextHeaders.length), sourceRow, particularIndex }))); setFileName(file.name);
    } catch (readError) {
      setError(readError.message || 'Could not read this Excel file.');
      event.target.value = '';
    }
  };

  const importRows = async () => {
    setError(''); setBusy(true); setResult(null);
    const failures = [];
    const importedRows = rows.flatMap(({ row, sourceRow, particularIndex }) => {
      const particular = String(row[particularIndex] ?? '').trim();
      if (!particular) {
        failures.push({ row: sourceRow, message: 'Particular is blank.' });
        return [];
      }
      const values = Object.fromEntries(columns.map(({ key }) => [key, '']));
      mapping.forEach(({ column, index }) => {
        if (index >= 0) values[column.key] = parseNumber(row[index]);
      });
      return [{ id: makeId(), particular: particular.slice(0, 200), values }];
    });
    if (!importedRows.length) {
      setResult({ imported: 0, failures }); setBusy(false); return;
    }
    setProgress(`Adding ${importedRows.length} particulars…`);
    try {
      const saved = await onImport(importedRows);
      if (!saved) {
        setError('The matrix could not be saved. Check your access and try again.');
        return;
      }
      setResult({ imported: importedRows.length, failures });
    } finally {
      setBusy(false); setProgress('');
    }
  };

  return (
    <section className="rounded p-4 space-y-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" style={{ color: C.ink, fontWeight: 600 }}><FileSpreadsheet size={17} /> Import Operation Matrix particulars</div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close Excel import"><X size={17} /></button>
      </div>
      <p className="text-xs" style={{ color: C.ink2 }}>Use the current matrix headers plus a Particular or Particulars column. Missing value columns stay blank. Imported rows are appended to this company’s matrix.</p>
      <input type="file" accept=".xlsx,.xls,.xlsm" onChange={chooseFile} disabled={busy} aria-label="Choose Excel file" className="block text-sm" />
      {fileName && <div className="text-xs" style={{ color: C.ink2 }}>{fileName} · {rows.length} rows · {mapping.filter((item) => item.index >= 0).length + 1} matched columns</div>}
      {!!headers.length && <div className="flex flex-wrap gap-1.5">{mapping.filter((item) => item.index >= 0).map(({ column }) => <span key={column.key} className="px-2 py-1 rounded text-xs" style={{ background: C.navyWash, color: C.ink }}>{column.label}</span>)}</div>}
      {rows.length > 0 && !result && <div className="overflow-x-auto"><table className="text-xs"><thead><tr><th className="p-2 text-left">Particular</th>{mapping.filter((item) => item.index >= 0).slice(0, 4).map(({ column }) => <th key={column.key} className="p-2 text-left">{column.label}</th>)}</tr></thead><tbody>{rows.slice(0, 3).map(({ row, particularIndex }, index) => <tr key={index} style={{ borderTop: `1px solid ${C.line}` }}><td className="p-2">{String(row[particularIndex] ?? '')}</td>{mapping.filter((item) => item.index >= 0).slice(0, 4).map(({ column, index: columnIndex }) => <td key={column.key} className="p-2">{String(row[columnIndex] ?? '')}</td>)}</tr>)}</tbody></table></div>}
      {error && <div className="flex gap-1.5 items-center text-sm" style={{ color: C.rust }}><AlertCircle size={15} />{error}</div>}
      {progress && <div className="flex gap-1.5 items-center text-sm" style={{ color: C.ink2 }}><LoaderCircle size={15} />{progress}</div>}
      {result && <div className="space-y-2 text-sm" aria-live="polite"><div className="flex gap-1.5 items-center" style={{ color: result.failures.length ? C.rust : C.moss }}><CheckCircle2 size={16} />Added {result.imported} particulars{result.failures.length ? `; ${result.failures.length} rows skipped.` : '.'}</div>{result.failures.length > 0 && <ul className="max-h-24 overflow-auto text-xs" style={{ color: C.rust }}>{result.failures.slice(0, 12).map((failure) => <li key={failure.row}>Row {failure.row}: {failure.message}</li>)}</ul>}</div>}
      <div className="flex gap-2">
        {rows.length > 0 && !result && <button type="button" onClick={importRows} disabled={busy} className="px-3 py-2 text-sm rounded" style={{ background: C.steel, color: '#fff' }}>Import {rows.length} rows</button>}
        {result && <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded" style={{ border: `1px solid ${C.line}`, color: C.ink }}>Done</button>}
        <button type="button" onClick={onClose} disabled={busy} className="px-3 py-2 text-sm rounded" style={{ border: `1px solid ${C.line}`, color: C.ink2 }}>Cancel</button>
      </div>
    </section>
  );
}