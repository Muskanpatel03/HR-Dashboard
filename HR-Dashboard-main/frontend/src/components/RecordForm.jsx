import React from 'react';
import { X } from 'lucide-react';
import { C, FONT_HEAD, FONT_MONO, COMPUTED } from '../config';

export default function RecordForm({ config, values, setValues, onCancel, onSubmit, onSubmitAndNew, isEdit }) {
  const set = (name, val, resetOnChange = []) => setValues((prev) => {
    const next = { ...prev, [name]: val };
    resetOnChange.forEach((fieldName) => { next[fieldName] = ''; });
    return next;
  });
  const computedFields = COMPUTED[config.key] || [];

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="record-entry-form p-4 rounded">
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }}>
          {isEdit ? 'Edit record' : `New ${config.label.toLowerCase()} record`}
        </div>
        <button onClick={onCancel}><X size={16} style={{ color: C.ink2 }} /></button>
      </div>
      <div className="record-entry-grid grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {config.fields.map((f) => (
          <div key={f.name} className="record-entry-field">
            <label className="record-entry-label" style={{ color: C.ink2, fontSize: 11.5 }}>{f.label}</label>
            {f.type === 'select' ? (
              <select
                value={values[f.name] || ''}
                onChange={(e) => set(f.name, e.target.value, f.resetOnChange)}
                className="record-entry-control w-full mt-1 px-2.5 py-1.5 text-sm rounded"
                style={{ border: `1px solid ${C.line}` }}
              >
                <option value="">Select…</option>
                {(f.optionsFor ? f.optionsFor(values) : f.options).map((option) => {
                  const optionValue = typeof option === 'object' ? option.value : option;
                  const optionLabel = typeof option === 'object' ? option.label : option;
                  return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
                })}
              </select>
            ) : f.type === 'month' ? (
              <input
                type="month"
                value={values[f.name] || ''}
                onChange={(e) => set(f.name, e.target.value)}
                className="record-entry-control w-full mt-1 px-2.5 py-1.5 text-sm rounded"
                style={{ border: `1px solid ${C.line}` }}
              />
            ) : (
              <input
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text'}
                value={values[f.name] ?? ''}
                onChange={(e) => set(f.name, e.target.value)}
                autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                className="record-entry-control w-full mt-1 px-2.5 py-1.5 text-sm rounded"
                style={{ border: `1px solid ${C.line}` }}
              />
            )}
          </div>
        ))}
      </div>

      {computedFields.length > 0 && (
        <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
          <div style={{ color: C.ink2, fontSize: 10.5, letterSpacing: 0.5 }} className="mb-2 uppercase">
            Auto-calculated — updates as you type, nothing to fill in
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {computedFields.map((c) => (
              <div key={c.name}>
                <div style={{ color: C.ink2, fontSize: 11.5 }}>{c.label}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 17, color: C.steel, marginTop: 2 }}>{c.compute(values)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={onSubmit} className="px-4 py-2 text-sm rounded" style={{ background: C.steel, color: '#fff' }}>
          {isEdit ? 'Save changes' : 'Add record'}
        </button>
        {!isEdit && onSubmitAndNew && (
          <button onClick={onSubmitAndNew} className="px-4 py-2 text-sm rounded" style={{ border: `1px solid ${C.steel}`, color: C.steel }}>
            Save &amp; add another
          </button>
        )}
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded" style={{ border: `1px solid ${C.line}`, color: C.ink2 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
