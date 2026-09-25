import React, { useMemo, useState } from "react";
import { C, FONT_HEAD, FONT_MONO, FONT_BODY, COMPUTED } from "../config";

// Four fixed roll-up periods, in the order the user switches between them.
const PERIODS = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "halfyearly", label: "Half-Yearly" },
  { key: "annual", label: "Annual" },
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// A record's "month" field is "YYYY-MM" (native <input type="month"> value).
// Bucket it into the right label + a lexically-sortable key for the chosen period.
function bucketFor(monthStr, period) {
  const [yStr, mStr] = String(monthStr).split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || m < 1 || m > 12) return null;

  if (period === "monthly") return { key: monthStr, label: `${MONTH_NAMES[m - 1]} ${y}` };
  if (period === "quarterly") {
    const q = Math.ceil(m / 3);
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}` };
  }
  if (period === "halfyearly") {
    const h = m <= 6 ? 1 : 2;
    return { key: `${y}-H${h}`, label: `H${h} ${y}` };
  }
  return { key: `${y}`, label: `${y}` }; // annual
}

// Reuses each module's COMPUTED `total(rows)` roll-ups (see config.js) so the
// per-period figures stay consistent with the section Total row — additive
// fields are summed, rate/percentage fields are recomputed from the
// aggregated totals rather than averaged.
export default function PeriodSummary({ config, records }) {
  const [period, setPeriod] = useState("monthly");
  const monthField = config.fields.find((f) => f.type === "month");
  const numericFields = useMemo(
    () => config.fields.filter((f) => f.type === "number"),
    [config.fields],
  );
  const computedFields = COMPUTED[config.key] || [];

  const buckets = useMemo(() => {
    if (!monthField) return [];
    const map = {};
    records.forEach((r) => {
      const raw = r[monthField.name];
      if (!raw) return;
      const b = bucketFor(raw, period);
      if (!b) return;
      if (!map[b.key]) map[b.key] = { key: b.key, label: b.label, rows: [] };
      map[b.key].rows.push(r);
    });
    return Object.values(map).sort((a, c) => (a.key < c.key ? -1 : a.key > c.key ? 1 : 0));
  }, [records, monthField, period]);

  if (!monthField || records.length === 0) return null;

  const colCount = 1 + numericFields.length + computedFields.length;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded">
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: `1px solid ${C.line}` }}
      >
        <div style={{ fontFamily: FONT_HEAD, fontSize: 14, color: C.ink }}>
          Period Summary
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className="px-2.5 py-1 text-xs rounded"
              style={{
                background: period === p.key ? C.steel : C.paper,
                color: period === p.key ? "#fff" : C.ink2,
                border: `1px solid ${period === p.key ? C.steel : C.line}`,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr style={{ background: C.paper, borderBottom: `1px solid ${C.line}` }}>
            <th
              className="text-left px-3 py-2 font-medium whitespace-normal break-words leading-tight align-bottom"
              style={{ color: C.ink2, fontSize: 11.5 }}
            >
              Period
            </th>
            {numericFields.map((f) => (
              <th
                key={f.name}
                className="text-left px-3 py-2 font-medium whitespace-normal break-words leading-tight align-bottom"
                style={{ color: C.ink2, fontSize: 11.5 }}
              >
                {f.label}
              </th>
            ))}
            {computedFields.map((c) => (
              <th
                key={c.name}
                className="text-left px-3 py-2 font-medium whitespace-normal break-words leading-tight align-bottom"
                style={{ color: C.steel, fontSize: 11.5 }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.length === 0 && (
            <tr>
              <td
                colSpan={colCount}
                className="px-3 py-6 text-center"
                style={{ color: C.ink2, fontSize: 13 }}
              >
                No dated records yet.
              </td>
            </tr>
          )}
          {buckets.map((b) => (
            <tr key={b.key} style={{ borderBottom: `1px solid ${C.line}` }}>
              <td
                className="px-3 py-2 whitespace-normal break-words"
                style={{ fontFamily: FONT_BODY, color: C.ink }}
              >
                {b.label}
              </td>
              {numericFields.map((f) => (
                <td
                  key={f.name}
                  className="px-3 py-2 whitespace-normal break-words"
                  style={{ fontFamily: FONT_MONO }}
                >
                  {b.rows.reduce((s, r) => s + num(r[f.name]), 0).toLocaleString("en-IN")}
                </td>
              ))}
              {computedFields.map((c) => (
                <td
                  key={c.name}
                  className="px-3 py-2 whitespace-normal break-words"
                  style={{ fontFamily: FONT_MONO, color: C.steel }}
                >
                  {c.total ? c.total(b.rows) : "—"}
                </td>
              ))}
            </tr>
          ))}
          {buckets.length > 0 && (
            <tr style={{ background: C.paper, fontWeight: 600 }}>
              <td className="px-3 py-2" style={{ color: C.ink }}>
                Grand Total
              </td>
              {numericFields.map((f) => (
                <td key={f.name} className="px-3 py-2" style={{ fontFamily: FONT_MONO, color: C.ink }}>
                  {records.reduce((s, r) => s + num(r[f.name]), 0).toLocaleString("en-IN")}
                </td>
              ))}
              {computedFields.map((c) => (
                <td key={c.name} className="px-3 py-2" style={{ fontFamily: FONT_MONO, color: C.ink }}>
                  {c.total ? c.total(records) : ""}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
