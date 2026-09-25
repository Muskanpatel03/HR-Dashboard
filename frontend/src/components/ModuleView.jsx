import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Download,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import api from "../api";
import RecordForm from "./RecordForm";
import PeriodSummary from "./PeriodSummary";
import {
  C,
  FONT_BODY,
  FONT_HEAD,
  FONT_MONO,
  COMPUTED,
  CHARTS,
} from "../config";

const PIE_COLORS = [C.steel, C.amber, C.moss, C.rust, "#8A6FB0", "#4C8577"];

function aggregate(records, chartConf) {
  const map = {};
  records.forEach((r) => {
    const key = r[chartConf.groupBy] || "—";
    if (!map[key]) {
      map[key] = { name: key };
      if (chartConf.series) chartConf.series.forEach((s) => { map[key][s.key] = 0; });
    }
    if (chartConf.series) {
      // Multi-series (e.g. Planned vs Actual): sum each series' own fields independently.
      chartConf.series.forEach((s) => {
        map[key][s.key] += s.fields.reduce((sum, f) => sum + (Number(r[f]) || 0), 0);
      });
    } else {
      let val = 1;
      if (chartConf.aggregate === "sum") {
        val = Array.isArray(chartConf.valueField)
          ? chartConf.valueField.reduce((s, f) => s + (Number(r[f]) || 0), 0)
          : Number(r[chartConf.valueField]) || 0;
      }
      map[key].value = (map[key].value || 0) + val;
    }
  });
  return Object.values(map);
}
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCSV(moduleKey, visibleFields, computedFields, rows) {
  const headers = [
    ...visibleFields.map((f) => f.label),
    ...computedFields.map((c) => c.label),
  ];
  const lines = [headers.map(csvEscape).join(",")];
  rows.forEach((r) => {
    const vals = [
      ...visibleFields.map((f) => csvEscape(r[f.name])),
      ...computedFields.map((c) => csvEscape(c.compute(r))),
    ];
    lines.push(vals.join(","));
  });
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${moduleKey}-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ModuleChart({ config, records }) {
  const chartConf = CHARTS[config.key];
  const data = useMemo(
    () => (chartConf ? aggregate(records, chartConf) : []),
    [chartConf, records],
  );
  if (!chartConf || records.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div
      style={{ background: C.card, border: `1px solid ${C.line}` }}
      className="p-4 rounded"
    >
      <div
        style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }}
        className="mb-3"
      >
        {chartConf.title}
      </div>
      <div style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={280}>
          {chartConf.type === "pie" ? (
            <PieChart margin={{ top: 28, right: 10, bottom: 0, left: 10 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="46%"
                innerRadius={42}
                outerRadius={68}
                paddingAngle={2}
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: C.ink2, strokeWidth: 1 }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                layout="horizontal"
                verticalAlign="bottom"
              />
            </PieChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.ink2 }} />
              <YAxis
                tick={{ fontSize: 11, fill: C.ink2 }}
                allowDecimals={false}
              />
              <Tooltip />
              {chartConf.series ? (
                <>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartConf.series.map((s, i) => (
                    <Bar key={s.key} dataKey={s.key} name={s.label} fill={PIE_COLORS[i % PIE_COLORS.length]} radius={[3, 3, 0, 0]} />
                  ))}
                </>
              ) : (
                <Bar dataKey="value" fill={C.steel} radius={[3, 3, 0, 0]} />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
        {chartConf.type === "pie" && (
          <div
            style={{
              position: "absolute",
              top: "calc(46% + 14px)",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontFamily: FONT_MONO, fontSize: 20, color: C.ink }}>
              {total}
            </div>
            <div style={{ fontSize: 10, color: C.ink2 }}>total</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ModuleView({ config, editable }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/${config.key}`);
      setRecords(data.records);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [config.key]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setFormValues({});
    setEditingId(null);
    setShowForm(true);
  };
  const openEdit = (record) => {
    setFormValues(record);
    setEditingId(record.id);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormValues({});
  };

  const submit = async () => {
    try {
      if (editingId) {
        await api.put(`/${config.key}/${editingId}`, formValues);
      } else {
        await api.post(`/${config.key}`, formValues);
      }
      closeForm();
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Save failed");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    try {
      await api.delete(`/${config.key}/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Delete failed");
    }
  };

  const filtered = records.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return config.fields.some((f) =>
      String(r[f.name] ?? "")
        .toLowerCase()
        .includes(q),
    );
  });

  const visibleFields = config.fields.filter((f) => f.type !== "password");
  const computedFields = COMPUTED[config.key] || [];
  const colSpan =
    visibleFields.length + computedFields.length + (editable ? 1 : 0);

  return (
    <div className="space-y-4">
      <ModuleChart config={config} records={records} />

      <PeriodSummary config={config} records={records} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search
            size={14}
            style={{ color: C.ink2 }}
            className="absolute left-2.5 top-2.5"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records…"
            className="pl-8 pr-3 py-2 text-sm rounded"
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              width: 240,
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: C.ink2, fontSize: 12.5 }}>
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() =>
              downloadCSV(config.key, visibleFields, computedFields, filtered)
            }
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded"
            style={{
              border: `1px solid ${C.line}`,
              color: filtered.length === 0 ? C.ink2 : C.ink,
              opacity: filtered.length === 0 ? 0.5 : 1,
            }}
          >
            <Download size={14} /> Export CSV
          </button>
          {editable && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded"
              style={{ background: C.steel, color: "#fff" }}
            >
              <Plus size={14} /> Add record
            </button>
          )}
        </div>
      </div>

      {!editable && (
        <div
          className="flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          style={{ background: "#F0EEE7", color: C.ink2 }}
        >
          <AlertCircle size={13} /> Your role has view-only access to this
          module.
        </div>
      )}

      {error && <div style={{ color: C.rust, fontSize: 13 }}>{error}</div>}

      {showForm && (
        <RecordForm
          config={config}
          values={formValues}
          setValues={setFormValues}
          onCancel={closeForm}
          onSubmit={submit}
          isEdit={!!editingId}
        />
      )}

      {(() => {
        const groups = config.columnGroups
          ? config.columnGroups.map((g) => ({
              title: g.title,
              fields: g.fields
                .map((n) => visibleFields.find((f) => f.name === n))
                .filter(Boolean),
            }))
          : [{ title: null, fields: visibleFields }];
        return (
          <div className="space-y-4">
            {groups.map((group, gi) => {
              const isLast = gi === groups.length - 1;
              const groupColSpan =
                group.fields.length +
                (isLast ? computedFields.length : 0) +
                (editable ? 1 : 0);
              return (
                <div
                  key={gi}
                  style={{ background: C.card, border: `1px solid ${C.line}` }}
                  className={`rounded ${config.wrapHeaders ? "" : "overflow-x-auto"}`}
                >
                  {group.title && (
                    <div
                      style={{
                        fontFamily: FONT_HEAD,
                        fontSize: 13.5,
                        color: C.ink,
                        borderBottom: `1px solid ${C.line}`,
                      }}
                      className="px-3 py-2"
                    >
                      {group.title}
                    </div>
                  )}
                  <table
                    className="w-full text-sm"
                    style={
                      config.wrapHeaders ? { tableLayout: "fixed" } : undefined
                    }
                  >
                    <thead>
                      <tr
                        style={{
                          background: C.paper,
                          borderBottom: `1px solid ${C.line}`,
                        }}
                      >
                        {group.fields.map((f) => (
                          <th
                            key={f.name}
                            style={{ color: C.ink2, fontSize: 11.5 }}
                            className={`text-left px-3 py-2 font-medium ${config.wrapHeaders ? "whitespace-normal break-words leading-tight align-bottom" : "whitespace-nowrap"}`}
                          >
                            {f.label}
                          </th>
                        ))}
                        {isLast &&
                          computedFields.map((c) => (
                            <th
                              key={c.name}
                              style={{ color: C.steel, fontSize: 11.5 }}
                              className={`text-left px-3 py-2 font-medium ${config.wrapHeaders ? "whitespace-normal break-words leading-tight align-bottom" : "whitespace-nowrap"}`}
                            >
                              {c.label}
                            </th>
                          ))}
                        {editable && (
                          <th className="px-3 py-2" style={{ width: 90 }}></th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td
                            colSpan={groupColSpan}
                            className="px-3 py-8 text-center"
                            style={{ color: C.ink2, fontSize: 13 }}
                          >
                            Loading…
                          </td>
                        </tr>
                      )}
                      {!loading && filtered.length === 0 && (
                        <tr>
                          <td
                            colSpan={groupColSpan}
                            className="px-3 py-8 text-center"
                            style={{ color: C.ink2, fontSize: 13 }}
                          >
                            No records yet.
                          </td>
                        </tr>
                      )}
                      {!loading &&
                        filtered.map((r) => (
                          <tr
                            key={r.id}
                            style={{ borderBottom: `1px solid ${C.line}` }}
                          >
                            {group.fields.map((f) => (
                              <td
                                key={f.name}
                                className={`px-3 py-2 ${config.wrapHeaders ? "whitespace-normal break-words" : "whitespace-nowrap"}`}
                                style={{
                                  fontFamily:
                                    f.type === "number" ? FONT_MONO : FONT_BODY,
                                }}
                              >
                                {r[f.name] || "—"}
                              </td>
                            ))}
                            {isLast &&
                              computedFields.map((c) => (
                                <td
                                  key={c.name}
                                  className={`px-3 py-2 ${config.wrapHeaders ? "whitespace-normal break-words" : "whitespace-nowrap"}`}
                                  style={{
                                    fontFamily: FONT_MONO,
                                    color: C.steel,
                                  }}
                                >
                                  {c.compute(r)}
                                </td>
                              ))}
                            {editable && (
                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openEdit(r)}
                                    style={{ color: C.steel }}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => remove(r.id)}
                                    style={{ color: C.rust }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      {config.showTotals && filtered.length > 0 && (
                        <tr style={{ background: C.paper, fontWeight: 600 }}>
                          {group.fields.map((f, i) => (
                            <td
                              key={f.name}
                              className={`px-3 py-2 ${config.wrapHeaders ? "whitespace-normal break-words" : "whitespace-nowrap"}`}
                              style={{
                                fontFamily:
                                  f.type === "number" ? FONT_MONO : FONT_BODY,
                                color: C.ink,
                              }}
                            >
                              {i === 0
                                ? "Total"
                                : f.type === "number"
                                  ? filtered
                                      .reduce(
                                        (s, r) => s + (Number(r[f.name]) || 0),
                                        0,
                                      )
                                      .toLocaleString("en-IN")
                                  : ""}
                            </td>
                          ))}
                          {isLast &&
                            computedFields.map((c) => (
                              <td
                                key={c.name}
                                className={`px-3 py-2 ${config.wrapHeaders ? "whitespace-normal break-words" : "whitespace-nowrap"}`}
                                style={{ fontFamily: FONT_MONO, color: C.steel }}
                              >
                                {c.total ? c.total(filtered) : ""}
                              </td>
                            ))}
                          {editable && <td className="px-3 py-2"></td>}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
