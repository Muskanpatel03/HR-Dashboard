import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";

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


// ============================================================
// CHART COLORS
// ============================================================

const PIE_COLORS = [
  C.steel,
  C.amber,
  C.moss,
  C.rust,
  "#8A6FB0",
  "#4C8577",
];


// ============================================================
// CHART AGGREGATION
// ============================================================

function aggregate(records, chartConf) {
  const map = {};

  records.forEach((r) => {
    const key = r[chartConf.groupBy] || "—";

    if (!map[key]) {
      map[key] = {
        name: key,
      };

      if (chartConf.series) {
        chartConf.series.forEach((s) => {
          map[key][s.key] = 0;
        });
      }
    }

    if (chartConf.series) {
      chartConf.series.forEach((s) => {
        map[key][s.key] += s.fields.reduce(
          (sum, field) =>
            sum + (Number(r[field]) || 0),
          0
        );
      });
    } else {
      let value = 1;

      if (chartConf.aggregate === "sum") {
        if (Array.isArray(chartConf.valueField)) {
          value = chartConf.valueField.reduce(
            (sum, field) =>
              sum + (Number(r[field]) || 0),
            0
          );
        } else {
          value =
            Number(r[chartConf.valueField]) || 0;
        }
      }

      map[key].value =
        (map[key].value || 0) + value;
    }
  });

  return Object.values(map);
}


// ============================================================
// CSV ESCAPE
// ============================================================

function csvEscape(value) {
  const stringValue = String(value ?? "");

  return /[",\n]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}


// ============================================================
// DATE FORMATTER
//
// Converts:
// 1968-07-01T00:00:00.000Z
//
// Into:
// 01-07-1968
// ============================================================

function formatDate(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const day = String(
    date.getUTCDate()
  ).padStart(2, "0");

  const month = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");

  const year = date.getUTCFullYear();

  return `${day}-${month}-${year}`;
}


// ============================================================
// TABLE VALUE FORMATTER
// ============================================================

function formatCellValue(value, type) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "—";
  }

  if (type === "date") {
    return formatDate(value);
  }

  if (type === "number") {
    return Number(value).toLocaleString(
      "en-IN"
    );
  }

  return String(value);
}


// ============================================================
// CSV DOWNLOAD
// ============================================================

function downloadCSV(
  moduleKey,
  visibleFields,
  computedFields,
  rows
) {
  const headers = [
    ...visibleFields.map(
      (field) => field.label
    ),
    ...computedFields.map(
      (field) => field.label
    ),
  ];

  const lines = [
    headers.map(csvEscape).join(","),
  ];

  rows.forEach((record) => {
    const values = [
      ...visibleFields.map((field) => {
        const value =
          field.type === "date"
            ? formatDate(record[field.name])
            : record[field.name];

        return csvEscape(value);
      }),

      ...computedFields.map((field) =>
        csvEscape(field.compute(record))
      ),
    ];

    lines.push(values.join(","));
  });

  const blob = new Blob(
    [lines.join("\n")],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `${moduleKey}-export-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}


// ============================================================
// MODULE CHART
// ============================================================

function ModuleChart({
  config,
  records,
}) {
  const chartConf =
    CHARTS[config.key];

  const data = useMemo(
    () =>
      chartConf
        ? aggregate(
            records,
            chartConf
          )
        : [],
    [chartConf, records]
  );

  if (
    !chartConf ||
    records.length === 0
  ) {
    return null;
  }

  const total = data.reduce(
    (sum, item) =>
      sum + (item.value || 0),
    0
  );

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
      }}
      className="p-4 rounded"
    >
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontSize: 15,
          color: C.ink,
        }}
        className="mb-3"
      >
        {chartConf.title}
      </div>

      <div
        style={{
          position: "relative",
        }}
      >
        <ResponsiveContainer
          width="100%"
          height={280}
        >
          {chartConf.type === "pie" ? (
            <PieChart
              margin={{
                top: 28,
                right: 10,
                bottom: 0,
                left: 10,
              }}
            >
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="46%"
                innerRadius={42}
                outerRadius={68}
                paddingAngle={2}
                label={({ percent }) =>
                  `${(
                    percent * 100
                  ).toFixed(0)}%`
                }
                labelLine={{
                  stroke: C.ink2,
                  strokeWidth: 1,
                }}
              >
                {data.map(
                  (_, index) => (
                    <Cell
                      key={index}
                      fill={
                        PIE_COLORS[
                          index %
                            PIE_COLORS.length
                        ]
                      }
                    />
                  )
                )}
              </Pie>

              <Tooltip />

              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  paddingTop: 8,
                }}
                layout="horizontal"
                verticalAlign="bottom"
              />
            </PieChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={C.line}
              />

              <XAxis
                dataKey="name"
                tick={{
                  fontSize: 11,
                  fill: C.ink2,
                }}
              />

              <YAxis
                tick={{
                  fontSize: 11,
                  fill: C.ink2,
                }}
                allowDecimals={false}
              />

              <Tooltip />

              {chartConf.series ? (
                <>
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                    }}
                  />

                  {chartConf.series.map(
                    (series, index) => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        name={series.label}
                        fill={
                          PIE_COLORS[
                            index %
                              PIE_COLORS.length
                          ]
                        }
                        radius={[
                          3,
                          3,
                          0,
                          0,
                        ]}
                      />
                    )
                  )}
                </>
              ) : (
                <Bar
                  dataKey="value"
                  fill={C.steel}
                  radius={[
                    3,
                    3,
                    0,
                    0,
                  ]}
                />
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
              transform:
                "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 20,
                color: C.ink,
              }}
            >
              {total}
            </div>

            <div
              style={{
                fontSize: 10,
                color: C.ink2,
              }}
            >
              total
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// MAIN MODULE VIEW
// ============================================================

export default function ModuleView({
  config,
  editable,
}) {
  const [records, setRecords] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [showForm, setShowForm] =
    useState(false);

  const [editingId, setEditingId] =
    useState(null);

  const [formValues, setFormValues] =
    useState({});

  const [search, setSearch] =
    useState("");


  // ==========================================================
  // LOAD RECORDS
  // ==========================================================

  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const { data } =
          await api.get(
            `/${config.key}`
          );

        setRecords(
          Array.isArray(data.records)
            ? data.records
            : []
        );
      } catch (err) {
        setError(
          err.response?.data?.error ||
            "Failed to load records"
        );
      } finally {
        setLoading(false);
      }
    },
    [config.key]
  );


  useEffect(() => {
    load();
  }, [load]);


  // ==========================================================
  // NEW RECORD
  // ==========================================================

  const openNew = () => {
    setFormValues({});
    setEditingId(null);
    setShowForm(true);
  };


  // ==========================================================
  // EDIT RECORD
  // ==========================================================

  const openEdit = (record) => {
    setFormValues({
      ...record,
    });

    setEditingId(record.id);
    setShowForm(true);
  };


  // ==========================================================
  // CLOSE FORM
  // ==========================================================

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormValues({});
  };


  // ==========================================================
  // SAVE RECORD
  // ==========================================================

  const submit = async () => {
    try {
      if (editingId) {
        await api.put(
          `/${config.key}/${editingId}`,
          formValues
        );
      } else {
        await api.post(
          `/${config.key}`,
          formValues
        );
      }

      closeForm();

      await load();
    } catch (err) {
      alert(
        err.response?.data?.error ||
          "Save failed"
      );
    }
  };


  // ==========================================================
  // DELETE RECORD
  // ==========================================================

  const remove = async (id) => {
    const confirmed =
      window.confirm(
        "Delete this record? This cannot be undone."
      );

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(
        `/${config.key}/${id}`
      );

      await load();
    } catch (err) {
      alert(
        err.response?.data?.error ||
          "Delete failed"
      );
    }
  };


  // ==========================================================
  // SEARCH
  // ==========================================================

  const filtered = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    if (!query) {
      return records;
    }

    return records.filter(
      (record) =>
        config.fields.some(
          (field) => {
            const rawValue =
              record[field.name];

            const value =
              field.type === "date"
                ? formatDate(rawValue)
                : String(
                    rawValue ?? ""
                  );

            return value
              .toLowerCase()
              .includes(query);
          }
        )
    );
  }, [
    records,
    search,
    config.fields,
  ]);


  // ==========================================================
  // FIELDS
  // ==========================================================

  const visibleFields =
    config.fields.filter(
      (field) =>
        field.type !== "password"
    );

  const computedFields =
    COMPUTED[config.key] || [];


  // ==========================================================
  // COLUMN GROUPS
  // ==========================================================

  const groups = useMemo(() => {
    if (!config.columnGroups) {
      return [
        {
          title: null,
          fields: visibleFields,
        },
      ];
    }

    return config.columnGroups.map(
      (group) => ({
        title: group.title,

        fields: group.fields
          .map((fieldName) =>
            visibleFields.find(
              (field) =>
                field.name ===
                fieldName
            )
          )
          .filter(Boolean),
      })
    );
  }, [
    config.columnGroups,
    visibleFields,
  ]);


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="space-y-4">

      {/* ====================================================
          CHART
      ==================================================== */}

      <ModuleChart
        config={config}
        records={records}
      />


      {/* ====================================================
          PERIOD SUMMARY
      ==================================================== */}

      <PeriodSummary
        config={config}
        records={records}
      />


      {/* ====================================================
          SEARCH + ACTIONS
      ==================================================== */}

      <div className="flex items-center justify-between gap-3 flex-wrap">

        <div className="relative">

          <Search
            size={14}
            style={{
              color: C.ink2,
            }}
            className="absolute left-2.5 top-2.5"
          />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
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

          <span
            style={{
              color: C.ink2,
              fontSize: 12.5,
            }}
          >
            {filtered.length} record
            {filtered.length !== 1
              ? "s"
              : ""}
          </span>


          {/* Export CSV */}

          <button
            onClick={() =>
              downloadCSV(
                config.key,
                visibleFields,
                computedFields,
                filtered
              )
            }
            disabled={
              filtered.length === 0
            }
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded"
            style={{
              border: `1px solid ${C.line}`,
              color:
                filtered.length === 0
                  ? C.ink2
                  : C.ink,
              opacity:
                filtered.length === 0
                  ? 0.5
                  : 1,
              cursor:
                filtered.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            <Download size={14} />

            Export CSV
          </button>


          {/* Add record */}

          {editable && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded"
              style={{
                background: C.steel,
                color: "#fff",
              }}
            >
              <Plus size={14} />

              Add record
            </button>
          )}

        </div>
      </div>


      {/* ====================================================
          VIEW ONLY NOTICE
      ==================================================== */}

      {!editable && (
        <div
          className="flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          style={{
            background: "#F0EEE7",
            color: C.ink2,
          }}
        >
          <AlertCircle size={13} />

          Your role has view-only
          access to this module.
        </div>
      )}


      {/* ====================================================
          ERROR
      ==================================================== */}

      {error && (
        <div
          style={{
            color: C.rust,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}


      {/* ====================================================
          RECORD FORM
      ==================================================== */}

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


      {/* ====================================================
          TABLES
      ==================================================== */}

      <div className="space-y-4">

        {groups.map(
          (group, groupIndex) => {
            const isLast =
              groupIndex ===
              groups.length - 1;

            const groupColSpan =
              group.fields.length +
              (isLast
                ? computedFields.length
                : 0) +
              (editable ? 1 : 0);

            return (
              <div
                key={groupIndex}
                style={{
                  background: C.card,
                  border: `1px solid ${C.line}`,
                }}
                className={`rounded ${
                  config.wrapHeaders
                    ? ""
                    : "overflow-x-auto"
                }`}
              >

                {/* Group heading */}

                {group.title && (
                  <div
                    style={{
                      fontFamily:
                        FONT_HEAD,
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
                    config.wrapHeaders
                      ? {
                          tableLayout:
                            "fixed",
                        }
                      : undefined
                  }
                >

                  {/* ==================================================
                      TABLE HEADER
                  ================================================== */}

                  <thead>
                    <tr
                      style={{
                        background:
                          C.paper,
                        borderBottom: `1px solid ${C.line}`,
                      }}
                    >

                      {group.fields.map(
                        (field) => (
                          <th
                            key={
                              field.name
                            }
                            style={{
                              color:
                                C.ink2,
                              fontSize:
                                11.5,
                            }}
                            className={`text-left px-3 py-2 font-medium ${
                              config.wrapHeaders
                                ? "whitespace-normal break-words leading-tight align-bottom"
                                : "whitespace-nowrap"
                            }`}
                          >
                            {field.label}
                          </th>
                        )
                      )}


                      {/* Computed headers */}

                      {isLast &&
                        computedFields.map(
                          (computed) => (
                            <th
                              key={
                                computed.name
                              }
                              style={{
                                color:
                                  C.steel,
                                fontSize:
                                  11.5,
                              }}
                              className={`text-left px-3 py-2 font-medium ${
                                config.wrapHeaders
                                  ? "whitespace-normal break-words leading-tight align-bottom"
                                  : "whitespace-nowrap"
                              }`}
                            >
                              {
                                computed.label
                              }
                            </th>
                          )
                        )}


                      {/* Actions header */}

                      {editable && (
                        <th
                          className="px-3 py-2"
                          style={{
                            width: 90,
                          }}
                        />
                      )}

                    </tr>
                  </thead>


                  {/* ==================================================
                      TABLE BODY
                  ================================================== */}

                  <tbody>

                    {/* Loading */}

                    {loading && (
                      <tr>
                        <td
                          colSpan={
                            groupColSpan
                          }
                          className="px-3 py-8 text-center"
                          style={{
                            color:
                              C.ink2,
                            fontSize:
                              13,
                          }}
                        >
                          Loading…
                        </td>
                      </tr>
                    )}


                    {/* Empty */}

                    {!loading &&
                      filtered.length ===
                        0 && (
                        <tr>
                          <td
                            colSpan={
                              groupColSpan
                            }
                            className="px-3 py-8 text-center"
                            style={{
                              color:
                                C.ink2,
                              fontSize:
                                13,
                            }}
                          >
                            No records yet.
                          </td>
                        </tr>
                      )}


                    {/* Records */}

                    {!loading &&
                      filtered.map(
                        (record) => (
                          <tr
                            key={
                              record.id
                            }
                            style={{
                              borderBottom: `1px solid ${C.line}`,
                            }}
                          >

                            {/* Normal fields */}

                            {group.fields.map(
                              (field) => (
                                <td
                                  key={
                                    field.name
                                  }
                                  className={`px-3 py-2 ${
                                    config.wrapHeaders
                                      ? "whitespace-normal break-words"
                                      : "whitespace-nowrap"
                                  }`}
                                  style={{
                                    fontFamily:
                                      field.type ===
                                      "number"
                                        ? FONT_MONO
                                        : FONT_BODY,
                                  }}
                                >
                                  {formatCellValue(
                                    record[
                                      field.name
                                    ],
                                    field.type
                                  )}
                                </td>
                              )
                            )}


                            {/* Computed fields */}

                            {isLast &&
                              computedFields.map(
                                (
                                  computed
                                ) => (
                                  <td
                                    key={
                                      computed.name
                                    }
                                    className={`px-3 py-2 ${
                                      config.wrapHeaders
                                        ? "whitespace-normal break-words"
                                        : "whitespace-nowrap"
                                    }`}
                                    style={{
                                      fontFamily:
                                        FONT_MONO,
                                      color:
                                        C.steel,
                                    }}
                                  >
                                    {computed.compute(
                                      record
                                    )}
                                  </td>
                                )
                              )}


                            {/* Actions */}

                            {editable && (
                              <td className="px-3 py-2">
                                <div className="flex gap-2">

                                  {/* Edit */}

                                  <button
                                    onClick={() =>
                                      openEdit(
                                        record
                                      )
                                    }
                                    style={{
                                      color:
                                        C.steel,
                                    }}
                                    title="Edit"
                                  >
                                    <Pencil
                                      size={
                                        14
                                      }
                                    />
                                  </button>


                                  {/* Delete */}

                                  <button
                                    onClick={() =>
                                      remove(
                                        record.id
                                      )
                                    }
                                    style={{
                                      color:
                                        C.rust,
                                    }}
                                    title="Delete"
                                  >
                                    <Trash2
                                      size={
                                        14
                                      }
                                    />
                                  </button>

                                </div>
                              </td>
                            )}

                          </tr>
                        )
                      )}


                    {/* ==================================================
                        TOTALS
                    ================================================== */}

                    {config.showTotals &&
                      filtered.length >
                        0 && (
                        <tr
                          style={{
                            background:
                              C.paper,
                            fontWeight: 600,
                          }}
                        >

                          {group.fields.map(
                            (
                              field,
                              fieldIndex
                            ) => (
                              <td
                                key={
                                  field.name
                                }
                                className={`px-3 py-2 ${
                                  config.wrapHeaders
                                    ? "whitespace-normal break-words"
                                    : "whitespace-nowrap"
                                }`}
                                style={{
                                  fontFamily:
                                    field.type ===
                                    "number"
                                      ? FONT_MONO
                                      : FONT_BODY,
                                  color:
                                    C.ink,
                                }}
                              >
                                {fieldIndex ===
                                0
                                  ? "Total"
                                  : field.type ===
                                    "number"
                                  ? filtered
                                      .reduce(
                                        (
                                          sum,
                                          record
                                        ) =>
                                          sum +
                                          (Number(
                                            record[
                                              field.name
                                            ]
                                          ) ||
                                            0),
                                        0
                                      )
                                      .toLocaleString(
                                        "en-IN"
                                      )
                                  : ""}
                              </td>
                            )
                          )}


                          {/* Computed totals */}

                          {isLast &&
                            computedFields.map(
                              (computed) => (
                                <td
                                  key={
                                    computed.name
                                  }
                                  className={`px-3 py-2 ${
                                    config.wrapHeaders
                                      ? "whitespace-normal break-words"
                                      : "whitespace-nowrap"
                                  }`}
                                  style={{
                                    fontFamily:
                                      FONT_MONO,
                                    color:
                                      C.steel,
                                  }}
                                >
                                  {computed.total
                                    ? computed.total(
                                        filtered
                                      )
                                    : ""}
                                </td>
                              )
                            )}


                          {/* Action column */}

                          {editable && (
                            <td className="px-3 py-2" />
                          )}

                        </tr>
                      )}

                  </tbody>
                </table>

              </div>
            );
          }
        )}

      </div>

    </div>
  );
}