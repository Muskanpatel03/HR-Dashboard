const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { canView } = require('../config/roles');

const router = express.Router();
router.use(authenticate);

const RECRUITMENT_STAGES = [
  'Requirement', 'Sourcing', 'Screening', 'Shortlisted', 'Interview Scheduled',
  'Interviewed', 'Selected', 'Offer', 'Joined', 'Rejected', 'Not Joined',
];

// Every module's own "when did this happen" column, used to apply the
// selected time range. Month-only tables (stored as 'YYYY-MM' text) are
// converted to a real date for comparison. Retirement is intentionally
// NOT range-filtered — it's about future dates, not entries made recently.
const RANGE_SQL = {
  all: '1=1',
  '15d': "(%COL%) >= (current_date - interval '15 days')",
  '30d': "(%COL%) >= (current_date - interval '30 days')",
  month: "date_trunc('month', (%COL%)) = date_trunc('month', current_date)",
  year: "date_trunc('year', (%COL%)) = date_trunc('year', current_date)",
};
const VALID_RANGES = Object.keys(RANGE_SQL);

function whereFor(range, colExpr, year) {
  if (year) {
    // Explicit calendar year picked by the user — overrides the range presets.
    return `extract(year from (${colExpr})) = ${year}`;
  }
  const tmpl = RANGE_SQL[VALID_RANGES.includes(range) ? range : 'all'];
  return tmpl.replace(/%COL%/g, colExpr);
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

router.get('/', async (req, res) => {
  if (!canView(req.user.role, 'dashboard')) return res.status(403).json({ error: 'Not permitted to view the dashboard' });

    const range = VALID_RANGES.includes(req.query.range) ? req.query.range : 'all';
  // Explicit year picker (e.g. ?year=2023) — validated as a real integer in a
  // sane bound before ever touching SQL, so it's safe to interpolate directly.
  let year = null;
  if (req.query.year !== undefined && req.query.year !== '') {
    const y = parseInt(req.query.year, 10);
    if (Number.isInteger(y) && y >= 2000 && y <= 2100) year = y;
  }
    const monthCol = "to_date(month, 'YYYY-MM')";

  // Only compute/return data for modules this role can actually view — the
  // dashboard must never leak numbers from a module the role has no access
  // to, even in aggregated/rolled-up form.
  const perm = {
    manpower: canView(req.user.role, 'manpower'),
    recruitment: canView(req.user.role, 'recruitment'),
    hiring: canView(req.user.role, 'hiring'),
    separation: canView(req.user.role, 'separation'),
    loans: canView(req.user.role, 'loans'),
    retirement: canView(req.user.role, 'retirement'),
    electricity: canView(req.user.role, 'electricity'),
    canteen: canView(req.user.role, 'canteen'),
    engagement: canView(req.user.role, 'engagement'),
    attendance: canView(req.user.role, 'attendance'),
  };
  const q = (allowed, sql) => (allowed ? pool.query(sql) : Promise.resolve({ rows: [] }));

  try {
    const [manpower, recruitment, attendance, retirement, loans, electricity, canteen, engagement, hiring, separation] = await Promise.all([
      q(perm.manpower, `SELECT location, direct_count, indirect_count, planned_direct_count, planned_indirect_count FROM manpower WHERE ${whereFor(range, monthCol, year)}`),
      q(perm.recruitment, `SELECT status FROM recruitment WHERE ${whereFor(range, 'application_date', year)}`),
      q(perm.attendance, `SELECT absent_days, employee_strength, total_working_days FROM attendance WHERE ${whereFor(range, monthCol, year)}`),
      q(perm.retirement, 'SELECT retirement_date FROM retirement'), // not range-filtered — see comment above
      q(perm.loans, `SELECT disbursed_amount, total_recovered, status FROM loans WHERE ${whereFor(range, 'start_date', year)}`),
      q(perm.electricity, `SELECT bill_amount, opening_reading, closing_reading, solar_generation FROM electricity WHERE ${whereFor(range, monthCol, year)}`),
      q(perm.canteen, `SELECT monthly_bill FROM canteen WHERE ${whereFor(range, monthCol, year)}`),
      q(perm.engagement, `SELECT eligible_employees, participants FROM engagement WHERE ${whereFor(range, 'date', year)}`),
      q(perm.hiring, `SELECT id FROM hiring WHERE ${whereFor(range, 'joining_date', year)}`),
      q(perm.separation, `SELECT id FROM separation WHERE ${whereFor(range, 'separation_date', year)}`),
    ]);

        const mpRows = manpower.rows;
    const directManpower = mpRows.reduce((s, r) => s + (Number(r.direct_count) || 0), 0);
    const indirectManpower = mpRows.reduce((s, r) => s + (Number(r.indirect_count) || 0), 0);
    const plannedDirectManpower = mpRows.reduce((s, r) => s + (Number(r.planned_direct_count) || 0), 0);
    const plannedIndirectManpower = mpRows.reduce((s, r) => s + (Number(r.planned_indirect_count) || 0), 0);
    const plannedManpower = plannedDirectManpower + plannedIndirectManpower;

    const manpowerByLocationMap = {};
    mpRows.forEach((r) => {
      const key = r.location || '—';
      const total = (Number(r.direct_count) || 0) + (Number(r.indirect_count) || 0);
      manpowerByLocationMap[key] = (manpowerByLocationMap[key] || 0) + total;
    });
    const recRows = recruitment.rows;
    const openPositions = recRows.filter((r) => !['Joined', 'Rejected', 'Not Joined'].includes(r.status)).length;
    const candidatesInPipeline = recRows.filter((r) => ['Sourcing', 'Screening', 'Shortlisted', 'Interview Scheduled', 'Interviewed'].includes(r.status)).length;
    const funnelCounts = {};
    RECRUITMENT_STAGES.forEach((s) => { funnelCounts[s] = 0; });
    recRows.forEach((r) => { if (funnelCounts[r.status] !== undefined) funnelCounts[r.status]++; });

    const successCount = recRows.filter((r) => ['Selected', 'Offer', 'Joined'].includes(r.status)).length;
    const rejectedCount = recRows.filter((r) => ['Rejected', 'Not Joined'].includes(r.status)).length;
    const inProgressCount = recRows.length - successCount - rejectedCount;

    const attRows = attendance.rows;
    const totalAbsent = attRows.reduce((s, r) => s + (Number(r.absent_days) || 0), 0);
    const totalAvailable = attRows.reduce((s, r) => s + (Number(r.employee_strength) || 0) * (Number(r.total_working_days) || 0), 0);
    const absenteeism = totalAvailable > 0 ? Number(((totalAbsent / totalAvailable) * 100).toFixed(1)) : 0;

    const curYear = new Date().getFullYear();
    const retiringThisYear = retirement.rows.filter((r) => r.retirement_date && new Date(r.retirement_date).getFullYear() === curYear).length;
    const retiringNextYear = retirement.rows.filter((r) => r.retirement_date && new Date(r.retirement_date).getFullYear() === curYear + 1).length;

    const loanRows = loans.rows;
    const totalDisbursed = loanRows.reduce((s, r) => s + (Number(r.disbursed_amount) || 0), 0);
    const totalRecovered = loanRows.reduce((s, r) => s + (Number(r.total_recovered) || 0), 0);
    const outstandingLoans = Math.max(0, totalDisbursed - totalRecovered);
    const activeLoans = loanRows.filter((r) => r.status === 'Active').length;
    const closedLoans = loanRows.filter((r) => r.status === 'Closed').length;

    const elRows = electricity.rows;
    const electricityCost = elRows.reduce((s, r) => s + (Number(r.bill_amount) || 0), 0);
    const totalUnits = elRows.reduce((s, r) => s + Math.max(0, (Number(r.closing_reading) || 0) - (Number(r.opening_reading) || 0)), 0);
    const totalSolar = elRows.reduce((s, r) => s + (Number(r.solar_generation) || 0), 0);
    const solarShare = pct(totalSolar, totalUnits + totalSolar);

    const canteenCost = canteen.rows.reduce((s, r) => s + (Number(r.monthly_bill) || 0), 0);

    const engRows = engagement.rows;
    const avgParticipation = engRows.length
      ? Math.round(engRows.reduce((s, r) => s + (Number(r.eligible_employees) ? (Number(r.participants) / Number(r.eligible_employees)) * 100 : 0), 0) / engRows.length)
      : 0;

    res.json({
      range,
      year,
      permissions: perm,
      kpis: {
        totalManpower: directManpower + indirectManpower,
        directManpower,
        indirectManpower,
        plannedManpower,
        plannedDirectManpower,
        plannedIndirectManpower,
        manpowerVariance: (directManpower + indirectManpower) - plannedManpower,
        openPositions,
        candidatesInPipeline,
        newJoiners: hiring.rows.length,
        separations: separation.rows.length,
        absenteeism,
        retiringThisYear,
        retiringNextYear,
        outstandingLoans,
        activeLoans,
        electricityCost,
        solarShare,
        canteenCost,
        engagementCount: engRows.length,
        avgParticipation,
      },
      manpowerByLocation: Object.entries(manpowerByLocationMap).map(([location, headcount]) => ({ location, headcount })),
      manpowerPlanVsActual: [
        { name: 'Planned', value: plannedManpower, pct: pct(plannedManpower, plannedManpower + directManpower + indirectManpower) },
        { name: 'Actual', value: directManpower + indirectManpower, pct: pct(directManpower + indirectManpower, plannedManpower + directManpower + indirectManpower) },
      ],
      recruitmentFunnel: RECRUITMENT_STAGES.map((stage) => ({ stage, count: funnelCounts[stage] })),
      pies: {
        manpowerSplit: [
          { name: 'Direct', value: directManpower, pct: pct(directManpower, directManpower + indirectManpower) },
          { name: 'Indirect', value: indirectManpower, pct: pct(indirectManpower, directManpower + indirectManpower) },
        ],
        electricitySource: [
          { name: 'Grid', value: totalUnits, pct: pct(totalUnits, totalUnits + totalSolar) },
          { name: 'Solar', value: totalSolar, pct: solarShare },
        ],
        loanRecovery: [
          { name: 'Recovered', value: totalRecovered, pct: pct(totalRecovered, totalDisbursed) },
          { name: 'Outstanding', value: outstandingLoans, pct: pct(outstandingLoans, totalDisbursed) },
        ],
        loanStatus: [
          { name: 'Active', value: activeLoans, pct: pct(activeLoans, loanRows.length) },
          { name: 'Closed', value: closedLoans, pct: pct(closedLoans, loanRows.length) },
        ],
        recruitmentOutcome: [
          { name: 'Selected / Offer / Joined', value: successCount, pct: pct(successCount, recRows.length) },
          { name: 'Rejected / Not Joined', value: rejectedCount, pct: pct(rejectedCount, recRows.length) },
          { name: 'In Progress', value: inProgressCount, pct: pct(inProgressCount, recRows.length) },
        ],
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute dashboard' });
  }
});

module.exports = router;