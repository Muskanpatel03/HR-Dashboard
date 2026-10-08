import React, { useEffect, useState, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../api';
import KpiCard from './KpiCard';
import OperationMatrix from './OperationMatrix';
import { C, COMPANY_OPTIONS, FONT_HEAD, fmtMoney } from '../config';


const RANGES = [
  { key: 'all', label: 'All time' },
  { key: '15d', label: 'Last 15 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

const PIE_COLORS = [C.steel, C.amber, C.moss, C.rust];
const DASHBOARD_PANEL_STYLE = {
  background: C.card,
  border: `1px solid ${C.line}`,
  borderTop: `3px solid ${C.navyLine}`,
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  return year && month ? `${MONTH_NAMES[month - 1]} ${year}` : value;
};

function PieCard({ title, data }) {
  const safeData = Array.isArray(data) ? data : [];
  const total = safeData.reduce((s, d) => s + (Number(d.value) || 0), 0);
  return (
    <div style={DASHBOARD_PANEL_STYLE} className="p-4 rounded">
      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-2">{title}</div>
      {total === 0 ? (
        <div style={{ color: C.ink2, fontSize: 13 }} className="py-10 text-center">No data for this period.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={safeData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              label={({ pct }) => `${pct}%`}
              labelLine={false}
            >
              {safeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value, name, entry) => [`${entry?.payload?.pct || 0}% (${Number(value || 0).toLocaleString('en-IN')})`, name]} />
            <Legend wrapperStyle={{ fontSize: 11.5 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function LegacyDashboard({ onNavigate, companyId }) {
  const [range, setRange] = useState('all');
  const [year, setYear] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [manpowerDate, setManpowerDate] = useState('');

  const load = useCallback((r, y, dt) => {
    api.get('/dashboard', {
      params: {
        range: r,
        year: y || undefined,
        date: dt || undefined,
        company: companyId && companyId !== 'all' ? companyId : undefined,
      },
    })
      .then((res) => setD(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load dashboard'));
  }, [companyId]);

  useEffect(() => { load(range, year, selectedDate); }, [range, year, selectedDate, load]);

   const changeRange = (key) => {
    setRange(key);
    setYear('');
    setSelectedDate('');
  };

  if (error) return <div style={{ color: C.rust, fontSize: 13 }}>{error}</div>;
  if (!d) return <div style={{ color: C.ink2, fontSize: 13 }}>Loading dashboard…</div>;

    const k = d.kpis;
    const dailyTableRows = (d.dailyManpowerRecords || d.manpowerDailyTrend || []).slice();
    const getRowDate = (row) => row?.fullDate || row?.date || '';
    const getDayValue = (row) => Number(row?.dayShift ?? row?.direct ?? row?.day_shift ?? 0);
    const getNightValue = (row) => Number(row?.nightShift ?? row?.indirect ?? row?.night_shift ?? 0);
    const getTotal = (row) => Number(row?.total ?? getDayValue(row) + getNightValue(row));

  return (
    <div className="dashboard-layout">
      <section className="dashboard-filters" aria-label="Dashboard filters">
        <div className="dashboard-filter-group">
          <div className="dashboard-filter-label">Reporting period</div>
          <div className="dashboard-range-options">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => changeRange(r.key)}
                className="dashboard-range-button"
                aria-pressed={!year && !selectedDate && range === r.key}
                style={{
                  background: !year && !selectedDate && range === r.key ? C.steel : C.card,
                  color: !year && !selectedDate && range === r.key ? '#fff' : C.ink2,
                  borderColor: !year && !selectedDate && range === r.key ? C.steel : C.line,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-filter-group dashboard-custom-filters">
          <label className="dashboard-filter-field">
            <span className="dashboard-filter-label">Year</span>
            <input
              type="number"
              value={year}
              onChange={(e) => { setYear(e.target.value); setSelectedDate(''); }}
              placeholder="e.g. 2019"
              min="2000"
              max="2100"
              className="dashboard-filter-input"
            />
          </label>
          <label className="dashboard-filter-field">
            <span className="dashboard-filter-label">Exact date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setYear(''); }}
              className="dashboard-filter-input"
            />
          </label>
          {(year || selectedDate) && (
            <button
              type="button"
              onClick={() => { setYear(''); setSelectedDate(''); }}
              className="dashboard-clear-filter"
            >
              Clear custom filter
            </button>
          )}
        </div>
      </section>

      <div className="dashboard-kpi-grid">
        {d.permissions.manpower && <KpiCard label="Total Manpower" value={k.totalManpower} sub={`${k.directManpower} direct · ${k.indirectManpower} indirect`} />}
        {d.permissions.manpower && (
          <KpiCard
            label="Planned vs Actual"
            value={k.plannedManpower}
            sub={`Actual ${k.totalManpower} · variance ${k.manpowerVariance > 0 ? '+' : ''}${k.manpowerVariance}`}
            accent={k.manpowerVariance < 0 ? C.rust : C.moss}
          />
        )}
        {d.permissions.recruitment && <KpiCard label="Open Positions" value={k.openPositions} sub={`${k.candidatesInPipeline} in pipeline`} accent={C.steel} />}
        {d.permissions.hiring && <KpiCard label="New Joiners" value={k.newJoiners} sub="in selected period" accent={C.moss} />}
        {d.permissions.separation && <KpiCard label="Separations" value={k.separations} sub="in selected period" accent={C.rust} />}
        {d.permissions.attendance && <KpiCard label="Absenteeism" value={`${k.absenteeism}%`} sub="across logged records" accent={C.amber} />}
        {d.permissions.retirement && (
  <KpiCard
    label="Retirement"
    value={k.futureRetirements}
    sub={`${k.alreadyRetired} already retired · future retirements`}
    accent={C.rust}
  />
)}
        {d.permissions.electricity && <KpiCard label="Electricity Cost" value={fmtMoney(k.electricityCost)} sub={`${k.solarShare}% from solar`} accent={C.steel} />}
        {d.permissions.canteen && <KpiCard label="Canteen Cost" value={fmtMoney(k.canteenCost)} sub="company + recovery" accent={C.moss} />}
          {d.permissions.engagement && <KpiCard label="Engagement Activities" value={k.engagementCount} sub={`${k.avgParticipation}% avg participation`} />}
        {d.permissions.training && <KpiCard label="Trainings Conducted" value={k.trainingsCount} sub="in selected period" accent={C.moss} />}
        {d.permissions.healthcheck && <KpiCard label="Health Check Coupons Used" value={`${k.healthcheckUsedPct}%`} sub={`${k.healthcheckAvailable} of ${k.healthcheckPurchased} left`} accent={C.amber} />}
      </div>

      <div className="dashboard-chart-grid">
        {d.permissions.manpower && (
          <div style={DASHBOARD_PANEL_STYLE} className="p-4 rounded">
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-3">Manpower by location</div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={d.manpowerByLocation}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                <XAxis dataKey="location" tick={{ fontSize: 12, fill: C.ink2 }} />
                <YAxis tick={{ fontSize: 12, fill: C.ink2 }} />
                <Tooltip />
                <Bar dataKey="headcount" fill={C.steel} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {d.permissions.recruitment && (
          <div
            style={{ ...DASHBOARD_PANEL_STYLE, cursor: 'pointer' }}
            className="p-4 rounded"
            role="button"
            tabIndex={0}
            onClick={() => onNavigate?.('recruitment')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onNavigate?.('recruitment');
              }
            }}
            aria-label="Open recruitment section"
          >
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-3">Recruitment funnel</div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={d.recruitmentFunnel} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.ink2 }} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 10.5, fill: C.ink2 }} width={110} />
                <Tooltip />
                <Bar dataKey="count" fill={C.amber} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {d.permissions.loanSummary && d.loanByUnit?.length > 0 && (
          <div style={DASHBOARD_PANEL_STYLE} className="p-4 rounded">
            <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-3">Loan position by unit</div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={d.loanByUnit} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                <XAxis dataKey="unit" tick={{ fontSize: 10.5, fill: C.ink2 }} />
                <YAxis tick={{ fontSize: 11, fill: C.ink2 }} />
                <Tooltip formatter={(value) => [`₹${Number(value || 0).toLocaleString('en-IN')} Lac`]} />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
                <Bar dataKey="budget" name="Budget" fill={C.steel} radius={[3, 3, 0, 0]} />
                <Bar dataKey="taken" name="Taken" fill={C.amber} radius={[3, 3, 0, 0]} />
                <Bar dataKey="outstanding" name="Outstanding" fill={C.rust} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {(d.permissions.recruitment || d.permissions.hiring || d.permissions.separation) && (
        <div className="dashboard-chart-grid">
          {d.permissions.recruitment && d.recruitmentMonthlyTrend?.length > 0 && (
            <div style={DASHBOARD_PANEL_STYLE} className="p-4 rounded">
              <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-3">Recruitment by month</div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={d.recruitmentMonthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: C.ink2 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: C.ink2 }} />
                  <Tooltip labelFormatter={monthLabel} />
                  <Legend wrapperStyle={{ fontSize: 11.5 }} />
                  <Bar dataKey="shortlisted" name="Shortlisted" fill={C.steel} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="offered" name="Offered" fill={C.amber} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {d.permissions.hiring && d.hiringMonthlyTrend?.length > 0 && (
            <div style={DASHBOARD_PANEL_STYLE} className="p-4 rounded">
              <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-3">Joined by month</div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={d.hiringMonthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: C.ink2 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: C.ink2 }} />
                  <Tooltip labelFormatter={monthLabel} />
                  <Bar dataKey="joined" name="Joined" fill={C.moss} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {d.permissions.separation && d.separationMonthlyTrend?.length > 0 && (
            <div style={DASHBOARD_PANEL_STYLE} className="p-4 rounded">
              <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-3">Separations by month</div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={d.separationMonthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: C.ink2 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: C.ink2 }} />
                  <Tooltip labelFormatter={monthLabel} />
                  <Bar dataKey="separations" name="Separations" fill={C.rust} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {d.permissions.manpower && (
        <div className="dashboard-chart-grid">
          {d.manpowerMonthlyTrend?.length > 0 && (
            <div style={DASHBOARD_PANEL_STYLE} className="p-4 rounded">
              <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-3">Manpower trend — Planned vs Actual</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={d.manpowerMonthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.ink2 }} />
                  <YAxis tick={{ fontSize: 12, fill: C.ink2 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11.5 }} />
                  <Line type="monotone" dataKey="planned" name="Planned" stroke={C.amber} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke={C.steel} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Daily Manpower — chart/picker for one day, PLUS a full
              scrollable table of every logged day underneath. Always shown
              (even with zero entries) so the feature is discoverable. */}
          <div
            style={DASHBOARD_PANEL_STYLE}
            className="p-4 rounded"
          >
            <div
              className="flex flex-wrap items-center justify-between gap-3 mb-4"
            >
              <div>
                <div
                  style={{
                    fontFamily: FONT_HEAD,
                    fontSize: 15,
                    color: C.ink,
                  }}
                >
                  Daily Manpower
                </div>

                <div
                  style={{
                    color: C.ink2,
                    fontSize: 12,
                    marginTop: 3,
                  }}
                >
                  Direct vs Indirect manpower by date
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label
                  style={{
                    color: C.ink2,
                    fontSize: 12,
                  }}
                >
                  Date
                </label>

                <input
                  type="date"
                  value={manpowerDate}
                  onChange={(e) => setManpowerDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded"
                  style={{
                    background: C.card,
                    color: C.ink,
                    border: `1px solid ${C.line}`,
                  }}
                />

                {manpowerDate && (
                  <button
                    onClick={() => setManpowerDate('')}
                    className="text-xs underline"
                    style={{ color: C.ink2 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const dailyRows = dailyTableRows;

              const selectedRow = manpowerDate
                ? dailyRows.find((row) => getRowDate(row) === manpowerDate)
                : null;

              if (manpowerDate && !selectedRow) {
                return (
                  <div
                    className="py-6 text-center"
                    style={{
                      color: C.ink2,
                      fontSize: 13,
                    }}
                  >
                    No manpower data available for this date. Add or edit a Manpower record and fill in "Specific Day" to see it here.
                  </div>
                );
              }

              if (selectedRow) {
                const total = getTotal(selectedRow);

                return (
                  <div
                    className="dashboard-kpi-grid dashboard-daily-kpis"
                  >
                    <KpiCard
                      label="Total Manpower"
                      value={total}
                      sub={manpowerDate}
                    />

                    <KpiCard
                      label="Day Shift"
                      value={getDayValue(selectedRow)}
                      sub="Daily manpower"
                      accent={C.moss}
                    />

                    <KpiCard
                      label="Night Shift"
                      value={getNightValue(selectedRow)}
                      sub="Daily manpower"
                      accent={C.rust}
                    />
                  </div>
                );
              }

              if (dailyRows.length > 0) {
                return (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dailyRows}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={C.line}
                      />

                      <XAxis
                        dataKey={(row) => getRowDate(row).slice(5) || getRowDate(row)}
                        tick={{
                          fontSize: 11,
                          fill: C.ink2,
                        }}
                      />

                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: C.ink2,
                        }}
                      />

                      <Tooltip />

                      <Legend
                        wrapperStyle={{
                          fontSize: 11.5,
                        }}
                      />

                      <Line
                        type="monotone"
                        dataKey={(row) => getDayValue(row)}
                        name="Day Shift"
                        stroke={C.moss}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />

                      <Line
                        type="monotone"
                        dataKey={(row) => getNightValue(row)}
                        name="Night Shift"
                        stroke={C.rust}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                );
              }

              return (
                <div
                  className="py-6 text-center"
                  style={{
                    color: C.ink2,
                    fontSize: 13,
                  }}
                >
                  No daily manpower entries yet. Add a Manpower record with "Specific Day" filled in to start tracking daily headcount here.
                </div>
              );
            })()}

            {/* Full table of every logged day, most recent first — click a
                row to jump the date picker (and the KPI view above) straight
                to that day. */}
            {dailyTableRows.length > 0 && (
              <div className="mt-4" style={{ borderTop: `1px solid ${C.line}` }}>
                <div
                  style={{ maxHeight: 260, overflowY: 'auto' }}
                  className="mt-3"
                >
                  <table className="w-full text-sm">
                    <thead style={{ position: 'sticky', top: 0, background: C.navyTint }}>
                      <tr style={{ borderBottom: `1px solid ${C.navyLine}` }}>
                        <th className="text-left px-2 py-1.5 nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>Date</th>
                        <th className="text-left px-2 py-1.5 nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>Day Shift</th>
                        <th className="text-left px-2 py-1.5 nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>Night Shift</th>
                        <th className="text-left px-2 py-1.5 nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...dailyTableRows]
                        .sort((a, b) => ((getRowDate(b) || '').localeCompare(getRowDate(a) || '')))
                        .map((row) => {
                          const rowDate = getRowDate(row);
                          const isActive = manpowerDate === rowDate;
                          const total = getTotal(row);
                          const dayValue = getDayValue(row);
                          const nightValue = getNightValue(row);
                          return (
                            <tr
                              key={rowDate || `${dayValue}-${nightValue}`}
                              onClick={() => setManpowerDate(isActive ? '' : rowDate)}
                              style={{
                                borderBottom: `1px solid ${C.line}`,
                                background: isActive ? C.paper : 'transparent',
                                cursor: 'pointer',
                              }}
                            >
                              <td className="px-2 py-1.5 nowrap-cell" style={{ fontFamily: FONT_HEAD, color: C.ink }}>{rowDate}</td>
                              <td className="px-2 py-1.5 nowrap-cell" style={{ color: C.moss }}>{dayValue}</td>
                              <td className="px-2 py-1.5 nowrap-cell" style={{ color: C.rust }}>{nightValue}</td>
                              <td className="px-2 py-1.5 nowrap-cell" style={{ fontWeight: 600, color: C.ink }}>{total}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-chart-grid">
        {d.permissions.manpower && <PieCard title="Manpower split" data={d.pies.manpowerSplit} />}
        
        {d.permissions.electricity && <PieCard title="Electricity source" data={d.pies.electricitySource} />}
        {d.permissions.recruitment && <PieCard title="Recruitment outcome" data={d.pies.recruitmentOutcome} />}
      </div>
    </div>
  );
}

export function DashboardSummary({ allowedCompanies }) {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all(allowedCompanies.map(async (company) => {
      const [summaryResponse, matrixResponse] = await Promise.all([
        api.get('/dashboard', { params: { company: company.id } }),
        api.get('/operation-matrix', { params: { industry: company.id } }),
      ]);
      return {
        company,
        summary: summaryResponse.data,
        matrix: matrixResponse.data?.data,
      };
    }))
      .then((results) => {
        if (!cancelled) setSummaries(results);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.response?.data?.error || 'Failed to load company summaries');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [allowedCompanies]);

  if (loading) return <div style={{ color: C.ink2, fontSize: 13 }}>Loading company summaries...</div>;
  if (error) return <div role="alert" style={{ color: C.rust, fontSize: 13 }}>{error}</div>;

  const averageMetric = (metric) => {
    const values = summaries
      .map(({ summary }) => Number(summary?.kpis?.[metric]) || 0)
      .filter((value) => Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  };

  const weightedMetric = (metric, weightMetric) => {
    const totalWeight = summaries.reduce((sum, { summary }) => sum + (Number(summary?.kpis?.[weightMetric]) || 0), 0);
    if (!totalWeight) return 0;

    const weightedTotal = summaries.reduce((sum, { summary }) => {
      const value = Number(summary?.kpis?.[metric]) || 0;
      const weight = Number(summary?.kpis?.[weightMetric]) || 0;
      return sum + (value * weight);
    }, 0);

    return weightedTotal / totalWeight;
  };

  const allCompanyData = summaries.length ? (() => {
    const allPermissions = {};
    const allKpis = {};
    const loanByUnitMap = new Map();
    const allMatrices = [];

    summaries.forEach(({ summary, matrix }) => {
      Object.entries(summary?.permissions || {}).forEach(([key, value]) => {
        if (value) allPermissions[key] = true;
      });

      Object.entries(summary?.kpis || {}).forEach(([key, value]) => {
        if (typeof value === 'number') {
          allKpis[key] = (Number(allKpis[key]) || 0) + value;
        }
      });

      (summary?.loanByUnit || []).forEach((unit) => {
        const key = unit.unit || '—';
        const existing = loanByUnitMap.get(key) || { unit: key, budget: 0, taken: 0, outstanding: 0 };
        loanByUnitMap.set(key, {
          ...existing,
          budget: (Number(existing.budget) || 0) + (Number(unit.budget) || 0),
          taken: (Number(existing.taken) || 0) + (Number(unit.taken) || 0),
          outstanding: (Number(existing.outstanding) || 0) + (Number(unit.outstanding) || 0),
        });
      });

      if (Array.isArray(matrix?.particulars)) {
        allMatrices.push(...matrix.particulars);
      }
    });

    const latestDailyRecord = summaries
      .map(({ summary }) => summary?.dailyManpowerRecords?.[0])
      .filter(Boolean)
      .reduce((max, current) => {
        if (!max || (current.date || '') > (max.date || '')) return current;
        return max;
      }, null);

    const latestDailyTotal = summaries
      .map(({ summary }) => Number(summary?.dailyManpowerRecords?.[0]?.total) || 0)
      .reduce((sum, value) => sum + value, 0);

    return {
      company: { id: 'all', label: 'All companies' },
      summary: {
        permissions: allPermissions,
        kpis: {
          ...allKpis,
          absenteeism: averageMetric('absenteeism'),
          avgParticipation: averageMetric('avgParticipation'),
          solarShare: weightedMetric('solarShare', 'electricityCost'),
          healthcheckUsedPct: allKpis.healthcheckPurchased
            ? ((Number(allKpis.healthcheckUsed) || 0) / (Number(allKpis.healthcheckPurchased) || 1)) * 100
            : 0,
        },
        loanByUnit: Array.from(loanByUnitMap.values()),
        dailyManpowerRecords: latestDailyRecord
          ? [{ total: latestDailyTotal, date: latestDailyRecord.date }]
          : [],
      },
      matrix: { particulars: allMatrices },
    };
  })() : null;

  const companyColumns = allCompanyData ? [...summaries, allCompanyData] : summaries;

  const sectionRows = [
    {
      key: 'operationMatrix',
      label: 'Operation Matrix',
      permission: 'operationMatrix',
      value: (summary) => `${Number(summary.matrix?.particulars?.length || 0).toLocaleString('en-IN')} particulars`,
    },
    {
      key: 'manpower',
      label: 'Manpower',
      permission: 'manpower',
      value: (summary) => `Actual ${Number(summary.kpis?.totalManpower || 0).toLocaleString('en-IN')} · Plan ${Number(summary.kpis?.plannedManpower || 0).toLocaleString('en-IN')}`,
    },
    {
      key: 'dailyManpower',
      label: 'Daily Manpower',
      permission: 'manpower',
      value: (summary) => {
        const latest = summary.dailyManpowerRecords?.[0];
        return latest ? `${latest.total.toLocaleString('en-IN')} present · ${latest.date}` : 'No daily entries';
      },
    },
    {
      key: 'recruitment',
      label: 'Recruitment',
      permission: 'recruitment',
      value: (summary) => `${Number(summary.kpis?.openPositions || 0).toLocaleString('en-IN')} open · ${Number(summary.kpis?.candidatesInPipeline || 0).toLocaleString('en-IN')} in pipeline`,
    },
    {
      key: 'openPositions',
      label: 'Open Position Recruitment',
      permission: 'recruitment',
      value: (summary) => Number(summary.kpis?.openPositions || 0).toLocaleString('en-IN'),
    },
    {
      key: 'hiring',
      label: 'Hiring',
      permission: 'hiring',
      value: (summary) => `${Number(summary.kpis?.newJoiners || 0).toLocaleString('en-IN')} new joiners`,
    },
    {
      key: 'separation',
      label: 'Separation',
      permission: 'separation',
      value: (summary) => `${Number(summary.kpis?.separations || 0).toLocaleString('en-IN')} separations`,
    },
    {
      key: 'attendance',
      label: 'Attendance',
      permission: 'attendance',
      value: (summary) => `${Number(summary.kpis?.absenteeism || 0).toLocaleString('en-IN')}% absenteeism`,
    },
    {
      key: 'retirement',
      label: 'Retirement',
      permission: 'retirement',
      value: (summary) => `${Number(summary.kpis?.futureRetirements || 0).toLocaleString('en-IN')} upcoming · ${Number(summary.kpis?.alreadyRetired || 0).toLocaleString('en-IN')} retired`,
    },
    {
      key: 'loanSummary',
      label: 'Loan Summary',
      permission: 'loanSummary',
      value: (summary) => {
        const outstanding = (summary.loanByUnit || []).reduce((total, unit) => total + (Number(unit.outstanding) || 0), 0);
        return `${fmtMoney(outstanding)} outstanding`;
      },
    },
    {
      key: 'electricity',
      label: 'Electricity',
      permission: 'electricity',
      value: (summary) => `${fmtMoney(summary.kpis?.electricityCost)} · ${Number(summary.kpis?.solarShare || 0).toLocaleString('en-IN')}% solar`,
    },
    {
      key: 'canteen',
      label: 'Canteen',
      permission: 'canteen',
      value: (summary) => fmtMoney(summary.kpis?.canteenCost),
    },
    {
      key: 'healthcheck',
      label: 'Health Check',
      permission: 'healthcheck',
      value: (summary) => `${Number(summary.kpis?.healthcheckUsed || 0).toLocaleString('en-IN')} used · ${Number(summary.kpis?.healthcheckUsedPct || 0).toLocaleString('en-IN')}%`,
    },
    {
      key: 'engagement',
      label: 'Engagement',
      permission: 'engagement',
      value: (summary) => `${Number(summary.kpis?.engagementCount || 0).toLocaleString('en-IN')} activities · ${Number(summary.kpis?.avgParticipation || 0).toLocaleString('en-IN')}% participation`,
    },
    {
      key: 'training',
      label: 'Training',
      permission: 'training',
      value: (summary) => `${Number(summary.kpis?.trainingsCount || 0).toLocaleString('en-IN')} trainings`,
    },
  ].filter((section) => section.key === 'operationMatrix' || summaries.some(({ summary }) => summary.permissions?.[section.permission]));

  return (
    <section className="company-summary" aria-labelledby="company-summary-title">
      <header className="company-summary-heading">
        <div>
          <div className="company-selector-kicker">Company portfolio</div>
          <h2 id="company-summary-title">Section Summary</h2>
        </div>
        <span className="company-summary-count">{sectionRows.length} sections · {summaries.length} companies</span>
      </header>
      <div className="company-summary-table-wrap">
        <table className="company-summary-table" aria-label="Section summary by company">
        <thead>
          <tr>
            <th scope="col">Section</th>
            {companyColumns.map(({ company }) => <th key={company.id} scope="col">{company.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {sectionRows.map((section) => (
            <tr key={section.key}>
              <th scope="row">{section.label}</th>
              {companyColumns.map(({ company, summary, matrix }) => (
                <td key={company.id}>
                  {section.key === 'operationMatrix'
                    ? section.value({ matrix })
                    : summary.permissions?.[section.permission]
                      ? section.value(summary)
                      : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

export default function Dashboard({ editable, canDelete, canViewMatrix, companyId, onCompanyChange, allowedCompanies = COMPANY_OPTIONS }) {
  const selectedCompany = COMPANY_OPTIONS.find((company) => company.id === companyId);
  const canSelectAll = allowedCompanies.length === COMPANY_OPTIONS.length;

  return (
    <div className="dashboard-layout">
      {canViewMatrix && (
        <>
          <section className="company-selector-shell" aria-label="Select company">
            <div className="company-selector-header">
              <div>
                <div className="company-selector-kicker">Company portfolio</div>
                <h2>Select a company</h2>
              </div>
              <span className="company-selector-count">{allowedCompanies.length} companies available</span>
            </div>

              {canSelectAll && <button
              type="button"
              onClick={() => onCompanyChange('all')}
              className="dashboard-clear-filter"
              aria-pressed={companyId === 'all'}
            >
              All companies
            </button>}

            <div className="company-selector-grid">
              {allowedCompanies.map((company, index) => {
                  const isActive = companyId === company.id;

                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => onCompanyChange(company.id)}
                    className={`company-selector-card${isActive ? ' is-active' : ''}`}
                    style={{ '--company-accent': company.accent }}
                    aria-pressed={isActive}
                  >
                    <span className="company-card-mark" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <span className="company-card-body">
                      <span className="company-card-topline">
                        <span>{company.shortLabel}</span>
                        <span>{isActive ? 'Selected' : 'Select company'}</span>
                      </span>
                      <span className="company-card-name">{company.label}</span>
                      <span className="company-card-action">Operation Matrix <ArrowRight size={14} /></span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedCompany && <div className="company-selector-detail" aria-live="polite">
            <div>
              <div className="company-selector-kicker">Selected company</div>
              <h3>{selectedCompany.label}</h3>
            </div>
            <div className="company-selector-detail-meta">
              <span>Operation matrix</span>
            </div>
          </div>}

          {selectedCompany ? <OperationMatrix
            key={selectedCompany.id}
            industry={selectedCompany.id}
            label={selectedCompany.label}
            editable={editable}
            canDelete={canDelete}
          /> : <div className="company-selector-detail">Select one company to open its Operation Matrix.</div>}
        </>
      )}
    </div>
  );
}