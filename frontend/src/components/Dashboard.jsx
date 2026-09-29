import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../api';
import KpiCard from './KpiCard';
import { C, FONT_HEAD, fmtMoney } from '../config';


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

export default function Dashboard({ onNavigate }) {
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
      },
    })
      .then((res) => setD(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load dashboard'));
  }, []);

  useEffect(() => { load(range, year, selectedDate); }, [range, year, selectedDate, load]);

   const changeRange = (key) => {
    setRange(key);
    setYear('');
    setSelectedDate('');
  };

  if (error) return <div style={{ color: C.rust, fontSize: 13 }}>{error}</div>;
  if (!d) return <div style={{ color: C.ink2, fontSize: 13 }}>Loading dashboard…</div>;

    const k = d.kpis;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => changeRange(r.key)}
            className="px-3 py-1.5 text-xs rounded"
            style={{
              background: !year && !selectedDate && range === r.key ? C.steel : C.card,
              color: !year && !selectedDate && range === r.key ? '#fff' : C.ink2,
              border: `1px solid ${!year && !selectedDate && range === r.key ? C.steel : C.line}`,
            }}
          >
            {r.label}
          </button>
        ))}

       <span style={{ color: C.ink2, fontSize: 12 }} className="ml-1">or a specific year:</span>
        <input
          type="number"
          value={year}
          onChange={(e) => { setYear(e.target.value); setSelectedDate(''); }}
          placeholder="e.g. 2019"
          min="2000"
          max="2100"
          className="px-2.5 py-1.5 text-xs rounded"
          style={{
            width: 90,
            background: year ? C.steel : C.card,
            color: year ? '#fff' : C.ink,
            border: `1px solid ${year ? C.steel : C.line}`,
          }}
        />
        {year && (
          <button onClick={() => setYear('')} className="text-xs underline" style={{ color: C.ink2 }}>
            clear
          </button>
        )}

        <span style={{ color: C.ink2, fontSize: 12 }} className="ml-1">or an exact date:</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => { setSelectedDate(e.target.value); setYear(''); }}
          className="px-2.5 py-1.5 text-xs rounded"
          style={{
            background: selectedDate ? C.steel : C.card,
            color: selectedDate ? '#fff' : C.ink,
            border: `1px solid ${selectedDate ? C.steel : C.line}`,
          }}
        />
        {selectedDate && (
          <button onClick={() => setSelectedDate('')} className="text-xs underline" style={{ color: C.ink2 }}>
            clear
          </button>
        )}
      </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
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

      <div className="grid gap-4" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
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
      </div>

      {(d.permissions.recruitment || d.permissions.hiring || d.permissions.separation) && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
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
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
              const dailyRows = d.manpowerDailyTrend || [];

              const selectedRow = manpowerDate
                ? dailyRows.find((x) => x.fullDate === manpowerDate)
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
                const total =
                  Number(selectedRow.direct || 0) +
                  Number(selectedRow.indirect || 0);

                return (
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(160px, 1fr))',
                    }}
                  >
                    <KpiCard
                      label="Total Manpower"
                      value={total}
                      sub={manpowerDate}
                    />

                    <KpiCard
                      label="Direct"
                      value={selectedRow.direct}
                      sub="Daily manpower"
                      accent={C.moss}
                    />

                    <KpiCard
                      label="Indirect"
                      value={selectedRow.indirect}
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
                        dataKey="date"
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
                        dataKey="direct"
                        name="Direct"
                        stroke={C.moss}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />

                      <Line
                        type="monotone"
                        dataKey="indirect"
                        name="Indirect"
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
            {(d.manpowerDailyTrend || []).length > 0 && (
              <div className="mt-4" style={{ borderTop: `1px solid ${C.line}` }}>
                <div
                  style={{ maxHeight: 260, overflowY: 'auto' }}
                  className="mt-3"
                >
                  <table className="w-full text-sm">
                    <thead style={{ position: 'sticky', top: 0, background: C.navyTint }}>
                      <tr style={{ borderBottom: `1px solid ${C.navyLine}` }}>
                        <th className="text-left px-2 py-1.5 nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>Date</th>
                        <th className="text-left px-2 py-1.5 nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>Direct</th>
                        <th className="text-left px-2 py-1.5 nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>Indirect</th>
                        <th className="text-left px-2 py-1.5 nowrap-cell" style={{ color: C.ink, fontSize: 11.5 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(d.manpowerDailyTrend || [])]
                        .sort((a, b) => (a.fullDate < b.fullDate ? 1 : -1))
                        .map((row) => {
                          const isActive = manpowerDate === row.fullDate;
                          const total = Number(row.direct || 0) + Number(row.indirect || 0);
                          return (
                            <tr
                              key={row.fullDate}
                              onClick={() => setManpowerDate(isActive ? '' : row.fullDate)}
                              style={{
                                borderBottom: `1px solid ${C.line}`,
                                background: isActive ? C.paper : 'transparent',
                                cursor: 'pointer',
                              }}
                            >
                              <td className="px-2 py-1.5 nowrap-cell" style={{ fontFamily: FONT_HEAD, color: C.ink }}>{row.fullDate}</td>
                              <td className="px-2 py-1.5 nowrap-cell" style={{ color: C.moss }}>{row.direct}</td>
                              <td className="px-2 py-1.5 nowrap-cell" style={{ color: C.rust }}>{row.indirect}</td>
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

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {d.permissions.manpower && <PieCard title="Manpower split" data={d.pies.manpowerSplit} />}
        
        {d.permissions.electricity && <PieCard title="Electricity source" data={d.pies.electricitySource} />}
        {d.permissions.recruitment && <PieCard title="Recruitment outcome" data={d.pies.recruitmentOutcome} />}
      </div>
    </div>
  );
}