import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
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

function PieCard({ title, data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="p-4 rounded">
      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, color: C.ink }} className="mb-2">{title}</div>
      {total === 0 ? (
        <div style={{ color: C.ink2, fontSize: 13 }} className="py-10 text-center">No data for this period.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              label={({ name, pct }) => `${pct}%`}
              labelLine={false}
            >
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value, name, entry) => [`${entry.payload.pct}% (${value.toLocaleString('en-IN')})`, name]} />
            <Legend wrapperStyle={{ fontSize: 11.5 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState('all');
  const [year, setYear] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback((r, y) => {
    api.get('/dashboard', { params: { range: r, year: y || undefined } })
      .then((res) => setD(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load dashboard'));
  }, []);

  useEffect(() => { load(range, year); }, [range, year, load]);

  if (error) return <div style={{ color: C.rust, fontSize: 13 }}>{error}</div>;
  if (!d) return <div style={{ color: C.ink2, fontSize: 13 }}>Loading dashboard…</div>;

    const k = d.kpis;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => { setRange(r.key); setYear(''); }}
            className="px-3 py-1.5 text-xs rounded"
            style={{
              background: !year && range === r.key ? C.steel : C.card,
              color: !year && range === r.key ? '#fff' : C.ink2,
              border: `1px solid ${!year && range === r.key ? C.steel : C.line}`,
            }}
          >
            {r.label}
          </button>
        ))}
                <span style={{ color: C.ink2, fontSize: 12 }} className="ml-1">or a specific year:</span>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
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
        {d.permissions.retirement && <KpiCard label="Retiring This Year" value={k.retiringThisYear} sub={`${k.retiringNextYear} next year`} />}
        {d.permissions.loans && <KpiCard label="Outstanding Loans" value={fmtMoney(k.outstandingLoans)} sub={`${k.activeLoans} active`} accent={C.rust} />}
        {d.permissions.electricity && <KpiCard label="Electricity Cost" value={fmtMoney(k.electricityCost)} sub={`${k.solarShare}% from solar`} accent={C.steel} />}
        {d.permissions.canteen && <KpiCard label="Canteen Cost" value={fmtMoney(k.canteenCost)} sub="company + recovery" accent={C.moss} />}
        {d.permissions.engagement && <KpiCard label="Engagement Activities" value={k.engagementCount} sub={`${k.avgParticipation}% avg participation`} />}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        {d.permissions.manpower && (
          <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="p-4 rounded">
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
          <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="p-4 rounded">
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

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {d.permissions.manpower && <PieCard title="Manpower split" data={d.pies.manpowerSplit} />}
        {d.permissions.manpower && <PieCard title="Planned vs Actual" data={d.pies.manpowerPlanVsActual || []} />}
        {d.permissions.electricity && <PieCard title="Electricity source" data={d.pies.electricitySource} />}
        {d.permissions.loans && <PieCard title="Loan recovery" data={d.pies.loanRecovery} />}
        {d.permissions.loans && <PieCard title="Loan status" data={d.pies.loanStatus} />}
        {d.permissions.recruitment && <PieCard title="Recruitment outcome" data={d.pies.recruitmentOutcome} />}
      </div>
    </div>
  );
}