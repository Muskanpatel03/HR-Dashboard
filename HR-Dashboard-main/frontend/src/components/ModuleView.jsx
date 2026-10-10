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
  Upload,
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
import ExcelImport from './ExcelImport';
import PeriodSummary from "./PeriodSummary";

import {
  C,
  FONT_BODY,
  FONT_HEAD,
  FONT_MONO,
  COMPUTED,
  CHARTS,
  COMPANY_OPTIONS,
  DAILY_MANPOWER_CONFIG,
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

function companyChartLabel(companyId) {
  const company = COMPANY_OPTIONS.find((option) => option.id === companyId);
  if (!company) return companyId || "Unknown company";
  return company.id === "HO" ? "HO / Corporate" : company.label;
}

function aggregate(records, chartConf, byCompany = false) {
  const map = {};

  records.forEach((record) => {
    const category = record[chartConf.groupBy] || "—";
    const company = companyChartLabel(record.company);
    const key = byCompany ? company || "Unknown company" : category;

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
            sum + (Number(record[field]) || 0),
          0
        );
      });
    } else {
      let value = 1;

      if (chartConf.aggregate === "sum") {
        if (Array.isArray(chartConf.valueField)) {
          value = chartConf.valueField.reduce(
            (sum, field) =>
              sum + (Number(record[field]) || 0),
            0
          );
        } else {
          value =
            Number(record[chartConf.valueField]) || 0;
        }
      }

      map[key].value =
        (map[key].value || 0) + value;
    }
  });

  const values = Object.values(map);
  const companyOrder = new Map(COMPANY_OPTIONS.map((company, index) => [companyChartLabel(company.id), index]));
  return byCompany
    ? values.sort((a, b) => (companyOrder.get(a.name) ?? Infinity) - (companyOrder.get(b.name) ?? Infinity))
    : values;
}

const PERIODS = ["Monthly", "Quarterly", "Half-Yearly", "Annual"];

function defaultSortFor(config) {
  if (config.defaultSort) return config.defaultSort;
  const firstChronologicalField = config.fields.find((field) =>
    field.type === "month" || field.type === "date"
  );
  return firstChronologicalField
    ? { field: firstChronologicalField.name, dir: "asc" }
    : null;
}

function periodKey(monthStr, period) {
  const [y, m] = String(monthStr || "").split("-").map(Number);
  if (!y || !m) return { key: "0000", label: "Unspecified" };
  if (period === "Quarterly") { const q = Math.ceil(m / 3); return { key: `${y}-Q${q}`, label: `Q${q} ${y}` }; }
  if (period === "Half-Yearly") { const h = m <= 6 ? 1 : 2; return { key: `${y}-H${h}`, label: `H${h} ${y}` }; }
  return { key: `${y}`, label: `${y}` };
}

// Weighted average of a per-head rate field (noSum): sum(rate*weight)/sum(weight)
function weightedAvg(rows, f) {
  let num = 0, den = 0;
  rows.forEach((r) => {
    if (r[f.name] === undefined || r[f.name] === null || r[f.name] === "") return;
    const w = f.weightFields.reduce((s, k) => s + (Number(r[k]) || 0), 0);
    num += (Number(r[f.name]) || 0) * w;
    den += w;
  });
  return den > 0 ? Math.round((num / den) * 100) / 100 : 0;
}

// Rolls monthly rows up to quarter / half-year / year.
// Numbers are summed; noSum rate fields are blended by headcount.
// Rows stay separate per location/department (every non-numeric column).
function rollupByPeriod(rows, fields, periodName, period) {
  const sums = fields.filter((f) => f.type === "number" && !f.noSum);
  const rates = fields.filter((f) => f.noSum && f.weightFields);
  const dims = fields.filter((f) => f.name !== periodName && f.type !== "number" && f.type !== "password");
  const groups = {};
  rows.forEach((r) => {
    const { key, label } = periodKey(r[periodName], period);
    const gk = key + "::" + dims.map((f) => r[f.name] ?? "").join("|");
    if (!groups[gk]) {
      groups[gk] = { id: gk, _key: key, _src: [], [periodName]: label };
      dims.forEach((f) => { groups[gk][f.name] = r[f.name]; });
      sums.forEach((f) => { groups[gk][f.name] = 0; });
    }
    const g = groups[gk];
    g._src.push(r);
    sums.forEach((f) => { g[f.name] += Number(r[f.name]) || 0; });
  });
  return Object.values(groups)
    .map((g) => { rates.forEach((f) => { g[f.name] = weightedAvg(g._src, f); }); return g; })
    .sort((a, b) => a._key.localeCompare(b._key));
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
// DATE / MONTH HELPERS
//
// Converts:
// 1968-07-01  (or 1968-07-01T00:00:00.000Z)
//
// Into:
// 01-07-1968
// ============================================================

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monthKeyOf = (v) => (v ? String(v).slice(0, 7) : "");
const monthLabel = (key) => {
  const [y, m] = key.split("-");
  return `${MONTH_LABELS[Number(m) - 1]} ${y}`;
};
const LOAN_HEADING_STORAGE_KEY = "loan-summary-heading-periods";
const DEFAULT_LOAN_HEADING_SETTINGS = {
  budgetYear: 2026,
  recoveryYear: 2025,
  historicalYear: 2024,
  corpusMonth: "2026-08",
  outstandingMonth: "2026-07",
};

function readLoanHeadingSettings() {
  try {
    return {
      ...DEFAULT_LOAN_HEADING_SETTINGS,
      ...JSON.parse(localStorage.getItem(LOAN_HEADING_STORAGE_KEY) || "{}"),
    };
  } catch {
    return DEFAULT_LOAN_HEADING_SETTINGS;
  }
}

function fiscalYearLabel(year) {
  const start = Number(year);
  return `FY${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

function monthHeading(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  return year && monthNumber >= 1 && monthNumber <= 12
    ? `${MONTH_LABELS[monthNumber - 1]}-${String(year).slice(-2)}`
    : "—";
}

function formatDate(value) {
  if (!value) return "—";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

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
  companyId,
}) {
  const chartConf =
    CHARTS[config.key];
  const byCompany = companyId === "all" && records.some((record) => record.company);

  const data = useMemo(
    () =>
      chartConf
        ? aggregate(
            records,
            chartConf,
            byCompany
          )
        : [],
    [chartConf, records, byCompany]
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
        {byCompany
          ? `${config.key === "loanSummary" ? "Outstanding (₹ Lac)" : chartConf.title.replace(/\s+by\s+.*$/i, "")} by company`
          : chartConf.title}
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
  creatable = false,
  canDelete = false,
  recordFilter,
  defaultValues = {},
  companyId,
  onRecordsChange,
}) {
  const [records, setRecords] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [showForm, setShowForm] =
    useState(false);

  const [showImport, setShowImport] = useState(false);

  const [editingId, setEditingId] =
    useState(null);

  const [formValues, setFormValues] =
    useState({});
  const [loanHeadingSettings, setLoanHeadingSettings] =
    useState(readLoanHeadingSettings);
  const [period, setPeriod] = useState("Monthly");
  const [search, setSearch] =
    useState("");

  // Sorting + month filter (both optional per module via config)
  const [sort, setSort] =
    useState(defaultSortFor(config));

  const [monthFilter, setMonthFilter] =
    useState("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [dailyMonth, setDailyMonth] = useState("all");

  useEffect(() => {
    localStorage.setItem(LOAN_HEADING_STORAGE_KEY, JSON.stringify(loanHeadingSettings));
  }, [loanHeadingSettings]);

  useEffect(() => {
    setSort(defaultSortFor(config));
    setMonthFilter("all");
    setSelectedDate("");
    setDailyMonth("all");
  }, [config.key]);

  useEffect(() => {
    setSelectedDate("");
  }, [companyId]);

  useEffect(() => {
    if (!showForm || editingId || !config.fields.some((field) => field.name === 'company')) return;
    setFormValues((current) => ({
      ...current,
      company: companyId && companyId !== 'all' ? companyId : '',
    }));
  }, [companyId, config.fields, editingId, showForm]);

  const toggleSort = (field) =>
    setSort((s) =>
      s && s.field === field
        ? {
            field,
            dir: s.dir === "asc" ? "desc" : "asc",
          }
        : { field, dir: "asc" }
    );


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

        const loadedRecords = Array.isArray(data.records) ? data.records : [];
        setRecords(loadedRecords);
        if (config.key === "dailyManpower") onRecordsChange?.(loadedRecords);
      } catch (err) {
        setError(
          err.response?.data?.error ||
            "Failed to load records"
        );
      } finally {
        setLoading(false);
      }
    },
    [config.key, onRecordsChange]
  );


  useEffect(() => {
    load();
  }, [load]);


  // ==========================================================
  // NEW RECORD
  // ==========================================================

  const newRecordValues = () => ({
      ...defaultValues,
      ...(config.key === "recruitment" ? { numberOfPositions: 1 } : {}),
      ...(companyId && companyId !== 'all' ? { company: companyId } : {}),
      ...(config.key === "dailyManpower" && selectedDate ? { date: selectedDate } : {}),
      ...(config.key === "dailyManpower" ? { departmentType: 'Production' } : {}),
  });

  const openNew = () => {
    setFormValues(newRecordValues());
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

  const submit = async (addAnother = false) => {
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

      await load();
      if (addAnother && !editingId) {
        setFormValues(newRecordValues());
      } else {
        closeForm();
      }
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
  // MONTH FILTER OPTIONS
  // (only when the module config sets monthFilterField)
  // ==========================================================

  const monthField = config.monthFilterField;

  const monthOptions = useMemo(() => {
    if (!monthField) return [];

    return [
      ...new Set(
        records
          .map((r) => monthKeyOf(r[monthField]))
          .filter(Boolean)
      ),
    ].sort();
  }, [records, monthField]);

  const dailyManpowerDates = useMemo(() => {
    if (config.key !== "dailyManpower") return [];

    const countsByDate = new Map();
    records.forEach((record) => {
      if (companyId && companyId !== 'all' && record.company !== companyId) return;
      const date = String(record.date || "").slice(0, 10);
      if (date) countsByDate.set(date, (countsByDate.get(date) || 0) + 1);
    });

    return [...countsByDate]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [config.key, records, companyId]);

  const dailyManpowerMonths = useMemo(() => {
    if (config.key !== "dailyManpower") return [];
    return [...new Set(dailyManpowerDates.map(({ date }) => date.slice(0, 7)))].sort().reverse();
  }, [config.key, dailyManpowerDates]);


  // ==========================================================
  // MONTH FILTER + SEARCH + SORT
  // ==========================================================

  const filtered = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    let rows = records.filter(
      (record) => {
        if (recordFilter && !recordFilter(record)) {
          return false;
        }

        if (config.key !== "usersmgmt" && companyId && companyId !== 'all' && record.company !== companyId) {
          return false;
        }

        if (
          config.key === "dailyManpower" &&
          selectedDate &&
          String(record.date || "").slice(0, 10) !== selectedDate
        ) {
          return false;
        }

        if (
          config.key === "dailyManpower" &&
          dailyMonth !== "all" &&
          String(record.date || "").slice(0, 7) !== dailyMonth
        ) {
          return false;
        }

        // Month filter
        if (
          monthField &&
          monthFilter !== "all" &&
          monthKeyOf(record[monthField]) !==
            monthFilter
        ) {
          return false;
        }

        // Search
        if (!query) {
          return true;
        }

        return config.fields.some(
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
        );
      }
    );

    // Sort
    if (sort) {
      const { field, dir } = sort;

      const type = config.fields.find(
        (f) => f.name === field
      )?.type;

      const blank = (v) =>
        v === null ||
        v === undefined ||
        v === "";

      rows = [...rows].sort((a, b) => {
        const av = a[field];
        const bv = b[field];

        if (blank(av) && blank(bv)) return 0;
        if (blank(av)) return 1; // blanks always last
        if (blank(bv)) return -1;

        const cmp =
          type === "number"
            ? Number(av) - Number(bv)
            : type === "month"
              ? String(av).localeCompare(String(bv))
            : String(av).localeCompare(
                String(bv),
                undefined,
                { numeric: true }
              );

        return dir === "desc" ? -cmp : cmp;
      });
    }

    return rows;
  }, [
    records,
    search,
    sort,
    monthFilter,
    dailyMonth,
    monthField,
    config.fields,
    config.key,
    recordFilter,
    companyId,
    selectedDate,
  ]);


  // ==========================================================
  // FIELDS
  // ==========================================================

  const loanHeadingLabels = config.key === "loanSummary"
    ? {
        budgetPersonal: `Budget ${fiscalYearLabel(loanHeadingSettings.budgetYear)} – Personal (₹ Lac)`,
        budgetHome: `Budget ${fiscalYearLabel(loanHeadingSettings.budgetYear)} – Home (₹ Lac)`,
        availablePersonal: `Available Corpus Till ${monthHeading(loanHeadingSettings.corpusMonth)} – Personal (₹ Lac)`,
        availableHome: `Available Corpus Till ${monthHeading(loanHeadingSettings.corpusMonth)} – Home (₹ Lac)`,
        takenPersonal: `Loan Taken Till ${monthHeading(loanHeadingSettings.corpusMonth)} – Personal (₹ Lac)`,
        takenHome: `Loan Taken Till ${monthHeading(loanHeadingSettings.corpusMonth)} – Home (₹ Lac)`,
        recoveredFY2526: `Amount Recovered ${fiscalYearLabel(loanHeadingSettings.recoveryYear)} (₹ Lac)`,
        takenFY2526: `Loan Taken ${fiscalYearLabel(loanHeadingSettings.recoveryYear)} (₹ Lac)`,
        takenFY2425: `Loan Taken ${fiscalYearLabel(loanHeadingSettings.historicalYear)} (₹ Lac)`,
        outstandingTillJul26: `Total Outstanding Till ${monthHeading(loanHeadingSettings.outstandingMonth)} (₹ Lac)`,
      }
    : {};

  const visibleFields = config.fields
    .filter((field) => field.type !== "password")
    .map((field) => loanHeadingLabels[field.name]
      ? { ...field, label: loanHeadingLabels[field.name] }
      : field);

  const computedFields =
    COMPUTED[config.key] || [];

  const periodField = config.fields.find((f) => f.type === "month");
  const displayRows = useMemo(
    () =>
      periodField && period !== "Monthly"
        ? rollupByPeriod(filtered, config.fields, periodField.name, period)
        : filtered,
    [filtered, config.fields, periodField, period],
  );
  // Rolled-up rows aren't single DB records, so edit/delete only in Monthly view
  const canEditRows = editable && (!periodField || period === "Monthly");
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
        filterField: group.filterField,
        filterValue: group.filterValue,

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
        companyId={companyId}
      />


      {/* ====================================================
          PERIOD SUMMARY
      ==================================================== */}

      <PeriodSummary
        config={config}
        records={records}
      />

      {config.key === "loanSummary" && (
        <div className="flex flex-wrap items-end gap-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
          <span style={{ color: C.ink, fontSize: 12.5, fontWeight: 600, paddingBottom: 8 }}>Heading periods</span>
          {[
            ["Budget FY", "budgetYear"],
            ["Recovery FY", "recoveryYear"],
            ["Historical FY", "historicalYear"],
          ].map(([label, name]) => {
            const currentYear = new Date().getFullYear();
            const fiscalYears = [...new Set([
              ...Array.from({ length: 21 }, (_, index) => currentYear - 10 + index),
              Number(loanHeadingSettings[name]),
            ])].sort((a, b) => a - b);
            return (
              <label key={name} className="flex flex-col gap-1" style={{ color: C.ink2, fontSize: 11.5 }}>
                {label}
                <select
                  value={loanHeadingSettings[name]}
                  onChange={(event) => setLoanHeadingSettings((settings) => ({ ...settings, [name]: Number(event.target.value) }))}
                  className="px-2.5 py-2 text-sm rounded"
                  style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }}
                >
                  {fiscalYears.map((year) => <option key={year} value={year}>{fiscalYearLabel(year)}</option>)}
                </select>
              </label>
            );
          })}
          {[
            ["Corpus / Taken Till", "corpusMonth"],
            ["Outstanding Till", "outstandingMonth"],
          ].map(([label, name]) => (
            <label key={name} className="flex flex-col gap-1" style={{ color: C.ink2, fontSize: 11.5 }}>
              {label}
              <input
                type="month"
                value={loanHeadingSettings[name]}
                onChange={(event) => setLoanHeadingSettings((settings) => ({ ...settings, [name]: event.target.value }))}
                className="px-2.5 py-2 text-sm rounded"
                style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }}
              />
            </label>
          ))}
        </div>
      )}


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

          {config.key === "dailyManpower" && (
            <label className="flex items-center gap-2 text-sm" style={{ color: C.ink2 }}>
              <span>Month</span>
              <select
                value={dailyMonth}
                onChange={(event) => {
                  setDailyMonth(event.target.value);
                  setSelectedDate("");
                }}
                className="px-2.5 py-2 text-sm rounded"
                style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }}
              >
                <option value="all">All months</option>
                {dailyManpowerMonths.map((month) => (
                  <option key={month} value={month}>{monthLabel(month)}</option>
                ))}
              </select>
              <span>Date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  if (event.target.value) setDailyMonth(event.target.value.slice(0, 7));
                }}
                className="px-2.5 py-2 text-sm rounded"
                style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }}
              />
              {selectedDate && (
                <button type="button" onClick={() => setSelectedDate("")} className="text-xs underline">
                  Clear
                </button>
              )}
            </label>
          )}

          {/* Month filter (only for modules that enable it) */}

          {monthField && (
            <select
              value={monthFilter}
              onChange={(event) =>
                setMonthFilter(
                  event.target.value
                )
              }
              className="px-2.5 py-2 text-sm rounded"
              style={{
                background: C.card,
                border: `1px solid ${C.line}`,
              }}
            >
              <option value="all">
                All months
              </option>

              {monthOptions.map(
                (month) => (
                  <option
                    key={month}
                    value={month}
                  >
                    {monthLabel(month)}
                  </option>
                )
              )}
            </select>
          )}


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
              downloadCSV(config.key, visibleFields, computedFields, displayRows)
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


          {creatable && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded"
              style={{ border: `1px solid ${C.line}`, color: C.ink }}
            >
              <Upload size={14} />
              Import Excel
            </button>
          )}

          {/* Add record */}

          {creatable && (
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

      {showImport && creatable && (
        <ExcelImport
          config={config}
          companyId={companyId}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}

      {config.key === "dailyManpower" && dailyManpowerDates.length > 0 && (
        <section className="daily-manpower-date-panel" aria-label="Daily manpower dates">
          <div className="daily-manpower-date-heading">
            <div>
              <div className="daily-manpower-date-title">Daily records</div>
              <div className="daily-manpower-date-caption" aria-live="polite">
                {selectedDate ? `Showing ${filtered.length} records for ${formatDate(selectedDate)}` : "Choose a date to see all of that day's records"}
              </div>
            </div>
            {selectedDate && (
              <button type="button" onClick={() => setSelectedDate("")} className="daily-manpower-all-dates">
                All dates
              </button>
            )}
          </div>
          <div className="daily-manpower-date-grid">
            {dailyManpowerDates.map(({ date, count }) => {
              const isSelected = selectedDate === date;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  aria-pressed={isSelected}
                  aria-label={`${formatDate(date)}, ${count} records`}
                  className={`daily-manpower-date-button${isSelected ? ' is-selected' : ''}`}
                >
                  <span>{formatDate(date)}</span>
                  <span className="daily-manpower-date-count">{count} {count === 1 ? 'row' : 'rows'}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}


      {/* ====================================================
          VIEW ONLY NOTICE
      ==================================================== */}

      {!editable && !creatable && (
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
          onSubmit={() => submit(false)}
          onSubmitAndNew={() => submit(true)}
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
            const showComputed = isLast || config.key === "dailyManpower";
            const groupRows = group.filterField
              ? displayRows.filter((record) => {
                  const value = record[group.filterField];
                  if (value) return value === group.filterValue;
                  const departments = group.filterValue === 'Production'
                    ? DAILY_MANPOWER_CONFIG.fields.find((field) => field.name === 'departmentProduction').optionsFor({ departmentType: 'Production' })
                    : DAILY_MANPOWER_CONFIG.fields.find((field) => field.name === 'departmentProduction').optionsFor({ departmentType: 'Non-Production' });
                  return departments.includes(record.departmentProduction);
                })
              : displayRows;
              const showActions = canEditRows || (canDelete && (!periodField || period === "Monthly"));

            const groupColSpan =
              group.fields.length +
              (config.showSerialNumber ? 1 : 0) +
              (showComputed
                ? computedFields.length
                : 0) +
              (showActions ? 1 : 0);

            return (
              <div
                key={groupIndex}
                className="module-table-wrap"
                style={{
                  maxHeight: "70vh",
                }}
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
                      textAlign: config.key === "loanSummary" ? "center" : undefined,
                    }}
                    className="px-3 py-2"
                  >
                    {group.title}
                  </div>
                )}


                <table
                  className="module-record-table spreadsheet-table text-sm"
                >

                  {/* ==================================================
                      TABLE HEADER
                  ================================================== */}

                  <thead>
                    <tr
                      className="module-record-table-heading"
                    >

                      {config.showSerialNumber && (
                        <th className="text-left px-3 py-2 font-medium nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>S.No.</th>
                      )}

                      {group.fields.map((field) => (
                        <React.Fragment key={field.name}>
                          <th
                            onClick={() => toggleSort(field.name)}
                            title="Click to sort"
                            style={{
                              color: C.ink,
                              fontSize: 11.5,
                              cursor: "pointer",
                              userSelect: "none",
                              minWidth: config.wrapHeaders
                                ? field.type !== "number" ? 120 : 100
                                : undefined,
                            }}
                            className={`text-left px-3 py-2 font-medium ${
                              config.wrapHeaders && field.type !== "number"
                                ? "whitespace-normal break-words leading-tight align-bottom"
                                : "nowrap-cell align-bottom"
                            }`}
                          >
                            {field.label}
                            {sort?.field === field.name
                              ? sort.dir === "asc" ? " ▲" : " ▼"
                              : ""}
                          </th>
                          {showComputed && config.computedAfterField === field.name && computedFields.map((computed) => (
                            <th key={computed.name} style={{ color: C.steel, fontSize: 11.5, minWidth: 110 }} className="text-left px-3 py-2 font-medium whitespace-normal break-words leading-tight align-bottom">
                              {computed.label}
                            </th>
                          ))}
                        </React.Fragment>
                      ))}


                      {/* Computed headers */}

                      {showComputed && !config.computedAfterField &&
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
                                minWidth: 110,
                              }}
                              className="text-left px-3 py-2 font-medium whitespace-normal break-words leading-tight align-bottom"
                            >
                              {
                                computed.label
                              }
                            </th>
                          )
                        )}


                      {/* Actions header */}

                      {showActions && (
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
                      groupRows.length ===
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
                      groupRows.map(
                        (record, rowIndex) => (
                          <tr
                            key={
                              record.id
                            }
                            className="spreadsheet-row"
                            style={{
                              borderBottom: `1px solid ${C.line}`,
                            }}
                          >

                            {config.showSerialNumber && (
                              <td className="px-3 py-2 nowrap-cell" style={{ color: C.ink2 }}>{rowIndex + 1}</td>
                            )}

                            {/* Normal fields */}

                            {group.fields.map((f) => (
                              <React.Fragment key={f.name}>
                                <td
                                  className={`px-3 py-2 ${config.wrapHeaders && f.type !== "number" ? "whitespace-normal break-words" : "nowrap-cell"}`}
                                  style={{
                                    fontFamily: f.type === "number" ? FONT_MONO : FONT_BODY,
                                    minWidth: config.wrapHeaders && f.type !== "number" ? 120 : undefined,
                                  }}
                                >
                                  {f.type === "date"
                                    ? formatDate(record[f.name])
                                    : record[f.name] || "—"}
                                </td>
                                {showComputed && config.computedAfterField === f.name && computedFields.map((computed) => (
                                  <td key={computed.name} className="px-3 py-2 nowrap-cell" style={{ fontFamily: FONT_MONO, color: C.steel, minWidth: 110 }}>
                                    {computed.compute(record)}
                                  </td>
                                ))}
                              </React.Fragment>
                            ))}


                            {/* Computed fields */}

                            {showComputed && !config.computedAfterField &&
                              computedFields.map(
                                (
                                  computed
                                ) => (
                                  <td
                                    key={
                                      computed.name
                                    }
                                    className="px-3 py-2 nowrap-cell"
                                    style={{
                                      fontFamily:
                                        FONT_MONO,
                                      color:
                                        C.steel,
                                      minWidth: 110,
                                    }}
                                  >
                                    {computed.compute(
                                      record
                                    )}
                                  </td>
                                )
                              )}


                            {/* Actions */}

                            {showActions && (
                              <td className="px-3 py-2">
                                <div className="flex gap-2">

                                  {/* Edit */}

                                  {canEditRows && (
                                    <button
                                      onClick={() => openEdit(record)}
                                      style={{ color: C.steel }}
                                      title="Edit"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                  )}


                                  {/* Delete */}

                                  {canDelete && (!periodField || period === "Monthly") && (
                                    <button
                                      onClick={() => remove(record.id)}
                                      style={{ color: C.rust }}
                                      title="Delete"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}

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
                      groupRows.length >
                        0 && (
                        <tr
                          style={{
                            background:
                              C.paper,
                            fontWeight: 600,
                          }}
                        >

                          {config.showSerialNumber && <td className="px-3 py-2" />}

                          {group.fields.map((field, fieldIndex) => (
                            <React.Fragment key={field.name}>
                              <td
                                className={`px-3 py-2 ${config.wrapHeaders && field.type !== "number" ? "whitespace-normal break-words" : "nowrap-cell"}`}
                                style={{ fontFamily: field.type === "number" ? FONT_MONO : FONT_BODY, color: C.ink }}
                              >
                                {field.name === config.totalLabelField || (!config.totalLabelField && fieldIndex === 0)
                                  ? "Total"
                                  : field.type === "number"
                                    ? field.noSum
                                      ? weightedAvg(groupRows, field).toLocaleString("en-IN", { maximumFractionDigits: 2 })
                                      : groupRows.reduce((sum, record) => sum + (Number(record[field.name]) || 0), 0).toLocaleString("en-IN")
                                    : ""}
                              </td>
                              {showComputed && config.computedAfterField === field.name && computedFields.map((computed) => (
                                <td key={computed.name} className="px-3 py-2 nowrap-cell" style={{ fontFamily: FONT_MONO, color: C.steel }}>
                                  {computed.total ? computed.total(groupRows) : ""}
                                </td>
                              ))}
                            </React.Fragment>
                          ))}


                          {/* Computed totals */}

                          {showComputed && !config.computedAfterField &&
                            computedFields.map(
                              (computed) => (
                                <td
                                  key={
                                    computed.name
                                  }
                                  className="px-3 py-2 nowrap-cell"
                                  style={{
                                    fontFamily:
                                      FONT_MONO,
                                    color:
                                      C.steel,
                                  }}
                                >
                                  {computed.total
                                    ? computed.total(
                                        groupRows
                                      )
                                    : ""}
                                </td>
                              )
                            )}


                          {/* Action column */}

                          {showActions && (
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
