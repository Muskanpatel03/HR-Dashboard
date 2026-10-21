import React, { useMemo, useState } from "react";
import { X, FileText, Upload } from "lucide-react";
import api from "../api";
import { C, FONT_BODY } from "../config";

const MAX_BYTES = 5 * 1024 * 1024;

const label = (r) =>
  [r.employeeName, r.month, r.department, r.reason, r.location]
    .filter(Boolean)
    .join(" · ") || `Record #${r.id}`;

// Import a PDF (stored as-is, no parsing) and attach it to a Separation record.
export default function PdfImport({ records, docs, onClose, onImported }) {
  const [recordId, setRecordId] = useState("");
  const [file, setFile] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => !q || label(r).toLowerCase().includes(q));
  }, [records, query]);

  const pick = (f) => {
    setError("");
    if (!f) return setFile(null);
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setError("Please choose a PDF file.");
    if (f.size > MAX_BYTES) return setError("The PDF must be 5 MB or smaller.");
    setFile(f);
  };

  const submit = async () => {
    if (!recordId || !file) return;
    if (docs[recordId] && !window.confirm("This record already has a PDF. Replace it?")) return;
    setBusy(true);
    setError("");
    try {
      await api.put(`/separation/${recordId}/document`, file, {
        headers: {
          "Content-Type": "application/pdf",
          "X-File-Name": encodeURIComponent(file.name),
        },
      });
      await onImported();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "PDF import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: FONT_BODY, width: "100%", maxWidth: 520 }} className="rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ color: C.ink, fontSize: 15, fontWeight: 600 }}>
            <FileText size={16} /> Import PDF
          </div>
          <button type="button" onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        <label className="flex flex-col gap-1 text-xs" style={{ color: C.ink2 }}>
          Record
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search records…"
            className="px-2.5 py-2 text-sm rounded"
            style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }}
          />
          <select
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            size={6}
            className="px-2 py-1 text-sm rounded"
            style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }}
          >
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {label(r)}{docs[r.id] ? "  (has PDF)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: C.ink2 }}>
          PDF file (max 5 MB)
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => pick(e.target.files?.[0])} className="text-sm" />
        </label>

        {error && <div style={{ color: C.rust, fontSize: 13 }}>{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!recordId || !file || busy}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded"
            style={{ background: C.steel, color: "#fff", opacity: !recordId || !file || busy ? 0.5 : 1 }}
          >
            <Upload size={14} /> {busy ? "Importing…" : "Import PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}