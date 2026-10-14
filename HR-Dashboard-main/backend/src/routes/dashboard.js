const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { canView, getRoleCompanies, ALL_COMPANY_IDS } = require('../config/roles');

const router = express.Router();
router.use(authenticate);

const RECRUITMENT_STAGES = [
  'Requirement',
  'Sourcing',
  'Screening',
  'Shortlisted',
  'Interview Scheduled',
  'Interviewed',
  'Selected',
  'Offer',
  'Joined',
  'Rejected',
  'Not Joined',
];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const RANGE_SQL = {
  all: '1=1',
  daily: '1=1', // the actual day filter is applied via requestedDate in whereFor, below
  '15d': "(%COL%) >= (current_date - interval '14 days') AND (%COL%) < (current_date + interval '1 day')",
  '30d': "(%COL%) >= (current_date - interval '29 days') AND (%COL%) < (current_date + interval '1 day')",
  month: "date_trunc('month', (%COL%)) = date_trunc('month', current_date)",
  year: "date_trunc('year', (%COL%)) = date_trunc('year', current_date)",
  fy: '1=1',
  selectedMonth: '1=1',
};

const VALID_RANGES = Object.keys(RANGE_SQL);

function whereFor(range, colExpr, year, selectedDate, { monthGranularity = false } = {}) {
  if (selectedDate) {
    // Exact day picked in Daily mode — overrides range and year.
    if (monthGranularity || range === 'selectedMonth') {
      return `date_trunc('month', (${colExpr})) = date_trunc('month', '${selectedDate}'::date)`;
    }
    return `(${colExpr})::date = '${selectedDate}'`;
  }

  if (range === 'fy' && year) {
    return `(${colExpr}) >= make_date(${year}, 4, 1) AND (${colExpr}) < make_date(${year} + 1, 4, 1)`;
  }

  if (year) {
    return `extract(year from (${colExpr})) = ${year}`;
  }

  if (monthGranularity && (range === '15d' || range === '30d')) {
    const daysBack = range === '15d' ? 14 : 29;
    return `date_trunc('month', (${colExpr})) BETWEEN date_trunc('month', current_date - interval '${daysBack} days') AND date_trunc('month', current_date)`;
  }

  const tmpl = RANGE_SQL[
    VALID_RANGES.includes(range) ? range : 'all'
  ];

  return tmpl.replace(/%COL%/g, colExpr);
}

function whereForDateOrMonth(range, dateColumn, monthExpr, year, selectedDate) {
  const dateFilter = whereFor(range, dateColumn, year, selectedDate, { monthGranularity: range === 'selectedMonth' });
  const monthFilter = whereFor(range, monthExpr, year, selectedDate, { monthGranularity: true });
  return `((${dateColumn} IS NOT NULL AND (${dateFilter})) OR (${dateColumn} IS NULL AND (${monthFilter})))`;
}

function pct(part, whole) {
  return whole > 0
    ? Math.round((part / whole) * 1000) / 10
    : 0;
}

router.get('/', async (req, res) => {
  if (!canView(req.user.role, 'dashboard')) {
    return res.status(403).json({
      error: 'Not permitted to view the dashboard',
    });
  }

  const range = VALID_RANGES.includes(req.query.range)
    ? req.query.range
    : 'all';

  let year = null;

  if (
    req.query.year !== undefined &&
    req.query.year !== ''
  ) {
    const y = parseInt(req.query.year, 10);

    if (
      Number.isInteger(y) &&
      y >= 2000 &&
      y <= 2100
    ) {
      year = y;
    }
  }

  // Exact day picked in Daily mode (?date=YYYY-MM-DD). Strict regex means
  // it's always safe to interpolate directly in whereFor above — same
  // pattern already used for "year".
  const requestedDate =
    typeof req.query.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : null;

  const monthCol = "to_date(month, 'YYYY-MM')";

  const perm = {
    operationMatrix: canView(req.user.role, 'operationMatrix'),
    manpower: canView(req.user.role, 'manpower'),
    recruitment: canView(req.user.role, 'recruitment'),
    hiring: canView(req.user.role, 'hiring'),
    separation: canView(req.user.role, 'separation'),
    retirement: canView(req.user.role, 'retirement'),
    electricity: canView(req.user.role, 'electricity'),
    canteen: canView(req.user.role, 'canteen'),
    loanSummary: canView(req.user.role, 'loanSummary'),
    healthcheck: canView(req.user.role, 'healthcheck'),
    engagement: canView(req.user.role, 'engagement'),
    training: canView(req.user.role, 'training'),
    attendance: canView(req.user.role, 'attendance'),
  };

  const roleCompanies = getRoleCompanies(req.user.role);
  const requestedCompany = typeof req.query.company === 'string' ? req.query.company : '';
  if (requestedCompany && !ALL_COMPANY_IDS.includes(requestedCompany)) {
    return res.status(400).json({ error: 'Invalid company' });
  }
  if (requestedCompany && !roleCompanies.includes(requestedCompany)) {
    return res.status(403).json({ error: 'Not permitted to access this company' });
  }
  const companiesToQuery = requestedCompany ? [requestedCompany] : roleCompanies;
  const q = (allowed, sql) => {
    if (!allowed) return Promise.resolve({ rows: [] });
    if (!requestedCompany && companiesToQuery.length === ALL_COMPANY_IDS.length) return pool.query(sql);

    const insertion = /\b(GROUP BY|ORDER BY|LIMIT)\b/i.exec(sql);
    const insertAt = insertion ? insertion.index : sql.length;
    const before = sql.slice(0, insertAt);
    const after = sql.slice(insertAt);
    const companyCondition = 'company = ANY($1::text[])';
    const scopedBefore = /\bWHERE\b/i.test(before)
      ? `${before.trimEnd()} AND ${companyCondition}\n`
      : `${before.trimEnd()} WHERE ${companyCondition}\n`;
    return pool.query(`${scopedBefore}${after}`, [companiesToQuery]);
  };

  if (req.query.compact === 'true') {
    const currentPeriodParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
    }).formatToParts(new Date());
    const currentYear = Number(currentPeriodParts.find((part) => part.type === 'year')?.value);
    const currentMonthNumber = Number(currentPeriodParts.find((part) => part.type === 'month')?.value);
    const currentReportMonth = `${currentYear}-${String(currentMonthNumber).padStart(2, '0')}`;
    const currentFiscalYearEnd = currentYear + (currentMonthNumber >= 4 ? 1 : 0);
    const selectedReportMonth = requestedDate?.slice(0, 7);
    const selectedMonthNumber = selectedReportMonth ? Number(selectedReportMonth.slice(5, 7)) : 0;
    const selectedLoanFiscalYearStart = selectedReportMonth
      ? Number(selectedReportMonth.slice(0, 4)) - (selectedMonthNumber < 4 ? 1 : 0)
      : range === 'fy' && year
        ? year
        : currentFiscalYearEnd - 1;
    const loanBudgetAvailable = selectedLoanFiscalYearStart === 2026;
    const loanTakenExpression = selectedReportMonth
      ? selectedReportMonth === '2026-08'
        ? 'SUM(COALESCE(taken_personal, 0) + COALESCE(taken_home, 0))'
        : 'NULL'
      : selectedLoanFiscalYearStart === 2024
        ? 'SUM(taken_fy2425)'
        : selectedLoanFiscalYearStart === 2025
          ? 'SUM(taken_fy2526)'
          : selectedLoanFiscalYearStart === 2026
            ? 'SUM(COALESCE(taken_personal, 0) + COALESCE(taken_home, 0))'
            : 'NULL';
    const loanOutstandingAvailable = selectedReportMonth
      ? selectedReportMonth === '2026-07'
      : selectedLoanFiscalYearStart === 2026;
    const selectedFiscalYearEnd = selectedReportMonth
      ? Number(selectedReportMonth.slice(0, 4)) + (selectedMonthNumber >= 4 ? 1 : 0)
      : null;
    const matrixPeriodCondition = selectedReportMonth
      ? `fiscal_year_end = ${selectedFiscalYearEnd} AND report_month = '${selectedReportMonth}'`
      : range === 'fy' && year
        ? `fiscal_year_end = ${year + 1} AND report_month >= '${year}-04' AND report_month <= '${year + 1}-03'`
        : `fiscal_year_end = ${currentFiscalYearEnd} AND report_month = '${currentReportMonth}'`;
    const matrixCountSql = canView(req.user.role, 'operationMatrix')
      ? `(SELECT COALESCE(jsonb_array_length(data->'particulars'), 0)
          FROM operation_matrix_periods
          WHERE industry = ANY($1::text[])
            AND ${matrixPeriodCondition}
          ORDER BY report_month DESC
          LIMIT 1)`
      : '0';
    const retirementAsOf = selectedReportMonth
      ? `(to_date('${selectedReportMonth}-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::date`
      : range === 'fy' && year
        ? `make_date(${year + 1}, 3, 31)`
        : 'CURRENT_DATE';
    const filters = {
      manpower: whereForDateOrMonth(range, 'entry_date', "to_date(month, 'YYYY-MM')", year, requestedDate),
      daily: whereFor(range, 'date', year, requestedDate),
      recruitment: whereFor(range, "to_date(month, 'YYYY-MM')", year, requestedDate, { monthGranularity: true }),
      attendance: whereFor(range, monthCol, year, requestedDate, { monthGranularity: true }),
      electricity: whereFor(range, monthCol, year, requestedDate, { monthGranularity: true }),
      canteen: whereFor(range, monthCol, year, requestedDate),
      engagement: whereFor(range, 'date', year, requestedDate),
      hiring: whereForDateOrMonth(range, 'date_of_joining', "to_date(month, 'YYYY-MM')", year, requestedDate),
      separation: whereForDateOrMonth(range, 'last_working_day', "to_date(month, 'YYYY-MM')", year, requestedDate),
      training: whereFor(range, 'training_date', year, requestedDate),
      // Health Check usage belongs to the month it happened, not the later
      // inventory snapshot date (as_of_date).
      healthcheck: whereFor(range, 'date_of_usage', year, requestedDate, { monthGranularity: range === 'selectedMonth' }),
      retirement: whereFor(range, 'COALESCE(last_working_day, retirement_date)', year, requestedDate),
    };
    const scoped = (allowed, filter = '1=1') => allowed ? `${filter} AND company = ANY($1::text[])` : 'FALSE';
    const compactSql = `
      SELECT
        (SELECT json_build_object(
          'direct', COALESCE(SUM(direct_count), 0),
          'indirect', COALESCE(SUM(indirect_count), 0),
          'plannedDirect', COALESCE(SUM(planned_direct_count), 0),
          'plannedIndirect', COALESCE(SUM(planned_indirect_count), 0)
        ) FROM manpower WHERE ${scoped(perm.manpower, filters.manpower)}) AS manpower,
        (SELECT json_build_object(
          'openPositions', COALESCE(SUM(CASE WHEN number_of_positions IS NULL THEN 1 ELSE GREATEST(number_of_positions, 0) END), 0),
          'candidates', COALESCE(SUM(shortlisted), 0)
        ) FROM recruitment WHERE ${scoped(perm.recruitment, filters.recruitment)}) AS recruitment,
        (SELECT json_build_object(
          'absent', COALESCE(SUM(absent_days), 0),
          'available', COALESCE(SUM(employee_strength * total_working_days), 0)
        ) FROM attendance WHERE ${scoped(perm.attendance, filters.attendance)}) AS attendance,
        (SELECT json_build_object(
          'cost', COALESCE(SUM(bill_amount), 0),
          'units', COALESCE(SUM(GREATEST(0, COALESCE(closing_reading, 0) - COALESCE(opening_reading, 0))), 0),
          'solar', COALESCE(SUM(solar_generation), 0)
        ) FROM electricity WHERE ${scoped(perm.electricity, filters.electricity)}) AS electricity,
        (SELECT COALESCE(SUM(monthly_bill), 0) FROM canteen WHERE ${scoped(perm.canteen, filters.canteen)}) AS canteen_cost,
        (SELECT json_build_object(
          'joined', COALESCE(SUM(joined), 0)
        ) FROM hiring WHERE ${scoped(perm.hiring, filters.hiring)}) AS hiring,
        (SELECT COUNT(*) FROM separation WHERE ${scoped(perm.separation, filters.separation)}) AS separation_count,
        (SELECT json_build_object(
          'count', COUNT(*),
          'averageParticipation', COALESCE(ROUND(AVG(CASE WHEN eligible_employees > 0 THEN participants * 100.0 / eligible_employees ELSE 0 END)), 0)
        ) FROM engagement WHERE ${scoped(perm.engagement, filters.engagement)}) AS engagement,
        (SELECT COUNT(*) FROM training WHERE ${scoped(perm.training, filters.training)}) AS training_count,
        (SELECT json_build_object(
          'alreadyRetired', COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(${retirementAsOf}, date_of_birth)) >= 60),
          'futureRetirements', COUNT(*) FILTER (WHERE date_of_birth IS NOT NULL AND EXTRACT(YEAR FROM AGE(${retirementAsOf}, date_of_birth)) < 60),
          'retiringNext12Months', COUNT(*) FILTER (WHERE date_of_birth + INTERVAL '60 years' BETWEEN ${retirementAsOf} AND ${retirementAsOf} + INTERVAL '1 year')
        ) FROM retirement WHERE ${scoped(perm.retirement)}) AS retirement,
        (SELECT COUNT(*) FROM retirement WHERE ${scoped(perm.retirement, filters.retirement)}) AS retirement_count,
        (SELECT json_build_object(
          'purchased', COALESCE(SUM(total_coupons_purchased), 0),
          'available', COALESCE(SUM(total_coupons_available), 0)
        ) FROM healthcheck WHERE ${scoped(perm.healthcheck, filters.healthcheck)}) AS healthcheck,
        (SELECT COALESCE(json_agg(json_build_object(
          'unit', COALESCE(unit, '—'),
          'budget', budget,
          'taken', taken,
          'outstanding', outstanding
        ) ORDER BY unit), '[]'::json) FROM (
          SELECT unit,
                 ${loanBudgetAvailable ? 'SUM(COALESCE(budget_personal, 0) + COALESCE(budget_home, 0))' : 'NULL'} AS budget,
                 ${loanTakenExpression} AS taken,
                 ${loanOutstandingAvailable ? 'SUM(outstanding_till_jul26)' : 'NULL'} AS outstanding
          FROM loan_summary WHERE ${scoped(perm.loanSummary)} GROUP BY unit
        ) loan_units) AS loan_by_unit,
        (SELECT COALESCE(json_agg(latest_row), '[]'::json) FROM (
          SELECT to_char(date, 'YYYY-MM-DD') AS date,
                 'All Departments' AS "departmentProduction",
                 COALESCE(SUM(fixed_manpower), 0) AS "fixedManpower",
                 COALESCE(SUM(day_shift), 0) AS "dayShift",
                 COALESCE(SUM(night_shift), 0) AS "nightShift",
                 COALESCE(SUM(day_shift), 0) + COALESCE(SUM(night_shift), 0) AS total,
                 COALESCE(SUM(absent), 0) AS absent,
                 COALESCE(SUM(double_shift), 0) AS "doubleShift"
          FROM daily_manpower WHERE ${scoped(perm.manpower, filters.daily)}
          GROUP BY date ORDER BY date DESC LIMIT 1
        ) latest_row) AS daily_manpower_records,
        ${matrixCountSql} AS matrix_particular_count
    `;

    try {
      const { rows: [summary] } = await pool.query(compactSql, [companiesToQuery]);
      const manpower = summary.manpower || {};
      const recruitment = summary.recruitment || {};
      const attendance = summary.attendance || {};
      const electricity = summary.electricity || {};
      const retirement = summary.retirement || {};
      const healthcheck = summary.healthcheck || {};
      const engagement = summary.engagement || {};
      const totalManpower = Number(manpower.direct || 0) + Number(manpower.indirect || 0);
      const plannedManpower = Number(manpower.plannedDirect || 0) + Number(manpower.plannedIndirect || 0);
      const healthcheckPurchased = Number(healthcheck.purchased || 0);
      const healthcheckUsed = Math.max(0, healthcheckPurchased - Number(healthcheck.available || 0));
      const units = Number(electricity.units || 0);
      const solar = Number(electricity.solar || 0);
      return res.json({
        range,
        year,
        permissions: perm,
        kpis: {
          totalManpower,
          directManpower: Number(manpower.direct || 0),
          indirectManpower: Number(manpower.indirect || 0),
          plannedManpower,
          plannedDirectManpower: Number(manpower.plannedDirect || 0),
          plannedIndirectManpower: Number(manpower.plannedIndirect || 0),
          manpowerVariance: totalManpower - plannedManpower,
          openPositions: Number(recruitment.openPositions || 0),
          candidatesInPipeline: Number(recruitment.candidates || 0),
          newJoiners: Number(summary.hiring?.joined || 0),
          separations: Number(summary.separation_count || 0),
          absenteeism: Number(attendance.available) > 0 ? Number(((Number(attendance.absent || 0) / Number(attendance.available)) * 100).toFixed(1)) : 0,
          alreadyRetired: Number(retirement.alreadyRetired || 0),
          futureRetirements: Number(retirement.futureRetirements || 0),
          retiringNext12Months: Number(retirement.retiringNext12Months || 0),
          retirementsInPeriod: Number(summary.retirement_count || 0),
          electricityCost: Number(electricity.cost || 0),
          solarShare: pct(solar, units + solar),
          canteenCost: Number(summary.canteen_cost || 0),
          healthcheckPurchased,
          healthcheckAvailable: Number(healthcheck.available || 0),
          healthcheckUsed,
          healthcheckUsedPct: pct(healthcheckUsed, healthcheckPurchased),
          engagementCount: Number(engagement.count || 0),
          avgParticipation: Number(engagement.averageParticipation || 0),
          trainingsCount: Number(summary.training_count || 0),
        },
        dailyManpowerRecords: summary.daily_manpower_records || [],
        loanByUnit: summary.loan_by_unit || [],
        matrix: { particularCount: Number(summary.matrix_particular_count || 0) },
      });
    } catch (error) {
      console.error('Failed to load compact dashboard summary', error);
      return res.status(500).json({ error: 'Failed to load dashboard summary' });
    }
  }

  try {
    const [
      manpower,
      dailyManpower,
      recruitment,
      attendance,
      retirement,
      electricity,
      canteen,
      loanSummary,
      healthcheck,
      engagement,
      hiring,
      separation,
      training,
    ] = await Promise.all([

      // MANPOWER
      q(
        perm.manpower,
        `
        SELECT
          location,
          month,
          entry_date,
          direct_count,
          indirect_count,
          planned_direct_count,
          planned_indirect_count
        FROM manpower
        WHERE ${whereForDateOrMonth(
          range,
          'entry_date',
          "to_date(month, 'YYYY-MM')",
          year,
          requestedDate
        )}
        `
      ),

      // DAILY MANPOWER SHIFT BREAKDOWN
      q(
        perm.manpower,
        `
        SELECT date, department_production, fixed_manpower,
               day_shift, night_shift, absent, double_shift
        FROM daily_manpower
        WHERE ${whereFor(range, 'date', year, requestedDate)}
        ORDER BY date DESC, department_production ASC
        `
      ),

      // RECRUITMENT
      q(
        perm.recruitment,
        `
        SELECT month, opening_position, number_of_positions, department, location, shortlisted, offered, status
        FROM recruitment
        WHERE ${whereFor(
          range,
          "to_date(month, 'YYYY-MM')",
          year,
          requestedDate,
          { monthGranularity: true }
        )}
        ORDER BY to_date(month, 'YYYY-MM') ASC NULLS LAST
        `
      ),

      // ATTENDANCE
      q(
        perm.attendance,
        `
        SELECT
          absent_days,
          employee_strength,
          total_working_days
        FROM attendance
        WHERE ${whereFor(
          range,
          monthCol,
          year,
          requestedDate,
          { monthGranularity: true }
        )}
        `
      ),

      // RETIREMENT
      q(
        perm.retirement,
        `
        SELECT
          employee_name,
          employee_id,
          department,
          location,
          retirement_date,
          date_of_birth
        FROM retirement
        WHERE ${whereFor(range, 'COALESCE(last_working_day, retirement_date)', year, requestedDate)}
        `
      ),

      // ELECTRICITY
      q(
        perm.electricity,
        `
        SELECT
          bill_amount,
          opening_reading,
          closing_reading,
          solar_generation
        FROM electricity
        WHERE ${whereFor(
          range,
          monthCol,
          year,
          requestedDate,
          { monthGranularity: true }
        )}
        `
      ),

      // CANTEEN
      q(
        perm.canteen,
        `
        SELECT monthly_bill
        FROM canteen
        WHERE ${whereFor(
          range,
          monthCol,
          year,
          requestedDate
        )}
        `
      ),

      // LOAN SUMMARY
      q(
        perm.loanSummary,
        `
        SELECT
          unit,
          SUM(budget_personal) AS budget_personal,
          SUM(budget_home) AS budget_home,
          SUM(taken_personal) AS taken_personal,
          SUM(taken_home) AS taken_home,
          SUM(outstanding_till_jul26) AS outstanding_till_jul26
        FROM loan_summary
        GROUP BY unit
        ORDER BY unit
        `
      ),

      // HEALTH CHECK
      q(
        perm.healthcheck,
        `
        SELECT
          COALESCE(SUM(total_coupons_purchased), 0) AS total_coupons_purchased,
          COALESCE(SUM(total_coupons_available), 0) AS total_coupons_available
        FROM healthcheck
        WHERE ${whereFor(range, 'date_of_usage', year, requestedDate, { monthGranularity: range === 'selectedMonth' })}
        `
      ),

      // ENGAGEMENT
      q(
        perm.engagement,
        `
        SELECT
          eligible_employees,
          participants
        FROM engagement
        WHERE ${whereFor(
          range,
          'date',
          year,
          requestedDate
        )}
        `
      ),

      // HIRING
      q(
        perm.hiring,
        `
        SELECT COALESCE(to_char(date_of_joining, 'YYYY-MM'), month) AS month, department, location, joined
        FROM hiring
        WHERE ${whereForDateOrMonth(
          range,
          'date_of_joining',
          "to_date(month, 'YYYY-MM')",
          year,
          requestedDate
        )}
        ORDER BY COALESCE(date_of_joining, to_date(month, 'YYYY-MM')) ASC NULLS LAST
        `
      ),

      // SEPARATION
      q(
        perm.separation,
        `
        SELECT month, department, reason, mode, location, last_working_day, exit
        FROM separation
        WHERE ${whereForDateOrMonth(
          range,
          'last_working_day',
          "to_date(month, 'YYYY-MM')",
          year,
          requestedDate
        )}
        ORDER BY COALESCE(last_working_day, to_date(month, 'YYYY-MM')) ASC NULLS LAST
        `
      ),

      // TRAINING
      q(
        perm.training,
        `
        SELECT id
        FROM training
        WHERE ${whereFor(
          range,
          'training_date',
          year,
          requestedDate
        )}
        `
      ),
    ]);

    // =========================================================
    // MANPOWER
    // =========================================================

    const mpRows = manpower.rows;

    const directManpower = mpRows.reduce(
      (sum, r) => sum + (Number(r.direct_count) || 0),
      0
    );

    const indirectManpower = mpRows.reduce(
      (sum, r) => sum + (Number(r.indirect_count) || 0),
      0
    );

    const plannedDirectManpower = mpRows.reduce(
      (sum, r) =>
        sum + (Number(r.planned_direct_count) || 0),
      0
    );

    const plannedIndirectManpower = mpRows.reduce(
      (sum, r) =>
        sum + (Number(r.planned_indirect_count) || 0),
      0
    );

    const plannedManpower =
      plannedDirectManpower +
      plannedIndirectManpower;

    // Manpower by location
    const manpowerByLocationMap = {};

    mpRows.forEach((r) => {
      const location = r.location || '—';

      const total =
        (Number(r.direct_count) || 0) +
        (Number(r.indirect_count) || 0);

      manpowerByLocationMap[location] =
        (manpowerByLocationMap[location] || 0) + total;
    });

    // =========================================================
    // MONTHLY MANPOWER TREND
    // =========================================================

    const monthlyMap = {};

    mpRows.forEach((r) => {
      if (!r.month) return;

      if (!monthlyMap[r.month]) {
        monthlyMap[r.month] = {
          planned: 0,
          actual: 0,
        };
      }

      monthlyMap[r.month].planned +=
        (Number(r.planned_direct_count) || 0) +
        (Number(r.planned_indirect_count) || 0);

      monthlyMap[r.month].actual +=
        (Number(r.direct_count) || 0) +
        (Number(r.indirect_count) || 0);
    });

    const manpowerMonthlyTrend =
      Object.keys(monthlyMap)
        .sort()
        .slice(-12)
        .map((key) => {
          const [y, m] = key.split('-');
          const monthIndex = Number(m) - 1;

          return {
            month:
              monthIndex >= 0 && monthIndex < 12
                ? `${MONTH_NAMES[monthIndex]} ${y}`
                : key,

            planned: monthlyMap[key].planned,
            actual: monthlyMap[key].actual,
          };
        });

    // =========================================================
    // DAILY MANPOWER TREND
    // =========================================================

    const dailyMap = {};

    mpRows.forEach((r) => {
      if (!r.entry_date) return;

      const key = new Date(r.entry_date)
        .toISOString()
        .slice(0, 10);

      if (!dailyMap[key]) {
        dailyMap[key] = {
          direct: 0,
          indirect: 0,
        };
      }

      dailyMap[key].direct +=
        Number(r.direct_count) || 0;

      dailyMap[key].indirect +=
        Number(r.indirect_count) || 0;
    });

    const manpowerDailyTrend =
      Object.keys(dailyMap)
        .sort()
        .slice(-30)
        .map((key) => ({
          date: key.slice(5),
          fullDate: key,
          direct: dailyMap[key].direct,
          indirect: dailyMap[key].indirect,
        }));

    const dailyManpowerByDate = new Map();
    dailyManpower.rows.forEach((row) => {
      const date = String(row.date || '').slice(0, 10);
      if (!date) return;
      const record = dailyManpowerByDate.get(date) || {
        date,
        fullDate: date,
        departmentProduction: 'All Departments',
        fixedManpower: 0,
        dayShift: 0,
        nightShift: 0,
        total: 0,
        absent: 0,
        doubleShift: 0,
      };
      record.fixedManpower += Number(row.fixed_manpower) || 0;
      record.dayShift += Number(row.day_shift) || 0;
      record.nightShift += Number(row.night_shift) || 0;
      record.total += (Number(row.day_shift) || 0) + (Number(row.night_shift) || 0);
      record.absent += Number(row.absent) || 0;
      record.doubleShift += Number(row.double_shift) || 0;
      dailyManpowerByDate.set(date, record);
    });
    const dailyManpowerRecords = [...dailyManpowerByDate.values()]
      .sort((a, b) => b.date.localeCompare(a.date));

    // =========================================================
    // RECRUITMENT
    // =========================================================

    const recRows = recruitment.rows;

    const openPositions = recRows.reduce(
      (sum, row) => {
        const value = row.number_of_positions == null ? 1 : Number(row.number_of_positions);
        return sum + (Number.isFinite(value) ? Math.max(value, 0) : 1);
      },
      0
    );

    const candidatesInPipeline = recRows.reduce(
      (sum, row) => sum + (Number(row.shortlisted) || 0),
      0
    );

    const funnelCounts = {};

    RECRUITMENT_STAGES.forEach((stage) => {
      funnelCounts[stage] = 0;
    });

    recRows.forEach((r) => {
      if (r.status && funnelCounts[r.status] !== undefined) {
        funnelCounts[r.status]++;
      }
    });

    const monthlyRecruitment = {};
    recRows.forEach((row) => {
      if (!row.month) return;
      if (!monthlyRecruitment[row.month]) {
        monthlyRecruitment[row.month] = { shortlisted: 0, offered: 0 };
      }
      monthlyRecruitment[row.month].shortlisted += Number(row.shortlisted) || 0;
      monthlyRecruitment[row.month].offered += Number(row.offered) || 0;
    });

    const recruitmentMonthlyTrend = Object.keys(monthlyRecruitment)
      .sort()
      .map((month) => ({
        month,
        shortlisted: monthlyRecruitment[month].shortlisted,
        offered: monthlyRecruitment[month].offered,
      }));

    const monthlyHiring = {};
    hiring.rows.forEach((row) => {
      if (!row.month) return;
      if (!monthlyHiring[row.month]) monthlyHiring[row.month] = 0;
      monthlyHiring[row.month] += Number(row.joined) || 0;
    });

    const hiringMonthlyTrend = Object.keys(monthlyHiring)
      .sort()
      .map((month) => ({ month, joined: monthlyHiring[month] }));

    const monthlySeparation = {};
    separation.rows.forEach((row) => {
      const month = row.month || (row.last_working_day
        ? new Date(row.last_working_day).toISOString().slice(0, 7)
        : null);
      if (!month) return;
      if (!monthlySeparation[month]) monthlySeparation[month] = 0;
      if (String(row.exit || '').toLowerCase() !== 'no') {
        monthlySeparation[month]++;
      }
    });

    const separationMonthlyTrend = Object.keys(monthlySeparation)
      .sort()
      .map((month) => ({ month, separations: monthlySeparation[month] }));

    const successCount = recRows.filter(
      (r) =>
        ['Selected', 'Offer', 'Joined'].includes(r.status)
    ).length;

    const rejectedCount = recRows.filter(
      (r) =>
        ['Rejected', 'Not Joined'].includes(r.status)
    ).length;

    const inProgressCount =
      recRows.length -
      successCount -
      rejectedCount;

    // =========================================================
    // ATTENDANCE
    // =========================================================

    const attRows = attendance.rows;

    const totalAbsent = attRows.reduce(
      (sum, r) =>
        sum + (Number(r.absent_days) || 0),
      0
    );

    const totalAvailable = attRows.reduce(
      (sum, r) =>
        sum +
        (Number(r.employee_strength) || 0) *
        (Number(r.total_working_days) || 0),
      0
    );

    const absenteeism =
      totalAvailable > 0
        ? Number(
            (
              (totalAbsent / totalAvailable) *
              100
            ).toFixed(1)
          )
        : 0;

    // =========================================================
    // RETIREMENT
    // RETIREMENT AGE = 60
    // =========================================================

    const retirementRows = retirement.rows;

    const today = new Date();

    function calculateAge(dob) {
      if (!dob) return null;

      const birth = new Date(dob);

      let age =
        today.getFullYear() -
        birth.getFullYear();

      const monthDiff =
        today.getMonth() -
        birth.getMonth();

      if (
        monthDiff < 0 ||
        (
          monthDiff === 0 &&
          today.getDate() < birth.getDate()
        )
      ) {
        age--;
      }

      return age;
    }

    const alreadyRetired = retirementRows.filter(
      (r) => {
        const age = calculateAge(r.date_of_birth);

        return age !== null && age >= 60;
      }
    ).length;

    const futureRetirements = retirementRows.filter(
      (r) => {
        const age = calculateAge(r.date_of_birth);

        return age !== null && age < 60;
      }
    ).length;

    // Employees who will turn 60 within next 12 months
    const retiringNext12Months =
      retirementRows.filter((r) => {
        if (!r.date_of_birth) return false;

        const birth = new Date(r.date_of_birth);

        const retirementDate =
          new Date(
            birth.getFullYear() + 60,
            birth.getMonth(),
            birth.getDate()
          );

        const nextYear =
          new Date(
            today.getFullYear() + 1,
            today.getMonth(),
            today.getDate()
          );

        return (
          retirementDate >= today &&
          retirementDate <= nextYear
        );
      }).length;

    // =========================================================
    // ELECTRICITY
    // =========================================================

    const elRows = electricity.rows;

    const electricityCost = elRows.reduce(
      (sum, r) =>
        sum + (Number(r.bill_amount) || 0),
      0
    );

    const totalUnits = elRows.reduce(
      (sum, r) =>
        sum +
        Math.max(
          0,
          (Number(r.closing_reading) || 0) -
          (Number(r.opening_reading) || 0)
        ),
      0
    );

    const totalSolar = elRows.reduce(
      (sum, r) =>
        sum + (Number(r.solar_generation) || 0),
      0
    );

    const solarShare = pct(
      totalSolar,
      totalUnits + totalSolar
    );

    // =========================================================
    // CANTEEN
    // =========================================================

    const canteenCost = canteen.rows.reduce(
      (sum, r) =>
        sum + (Number(r.monthly_bill) || 0),
      0
    );

    const loanByUnit = loanSummary.rows.map((row) => ({
      unit: row.unit || '—',
      budget: (Number(row.budget_personal) || 0) + (Number(row.budget_home) || 0),
      taken: (Number(row.taken_personal) || 0) + (Number(row.taken_home) || 0),
      outstanding: Number(row.outstanding_till_jul26) || 0,
    }));

    // =========================================================
    // HEALTH CHECK
    // =========================================================

    const hcRow = healthcheck.rows[0];

    const healthcheckPurchased = hcRow
      ? Number(
          hcRow.total_coupons_purchased
        ) || 0
      : 0;

    const healthcheckAvailable = hcRow
      ? Number(
          hcRow.total_coupons_available
        ) || 0
      : 0;

    const healthcheckUsed =
      Math.max(
        0,
        healthcheckPurchased -
        healthcheckAvailable
      );

    const healthcheckUsedPct = pct(
      healthcheckUsed,
      healthcheckPurchased
    );

    // =========================================================
    // ENGAGEMENT
    // =========================================================

    const engRows = engagement.rows;

    const avgParticipation = engRows.length
      ? Math.round(
          engRows.reduce(
            (sum, r) =>
              sum +
              (
                Number(r.eligible_employees)
                  ? (
                      Number(r.participants) /
                      Number(r.eligible_employees)
                    ) * 100
                  : 0
              ),
            0
          ) / engRows.length
        )
      : 0;

    // =========================================================
    // RESPONSE
    // =========================================================

    res.json({
      range,
      year,
      permissions: perm,

      kpis: {
        // Manpower
        totalManpower:
          directManpower +
          indirectManpower,

        directManpower,
        indirectManpower,

        plannedManpower,
        plannedDirectManpower,
        plannedIndirectManpower,

        manpowerVariance:
          (
            directManpower +
            indirectManpower
          ) - plannedManpower,

        // Recruitment
        openPositions,
        candidatesInPipeline,

        // Hiring
        newJoiners:
          hiring.rows.reduce((sum, row) => sum + (Number(row.joined) || 0), 0),

        // Separation
        separations:
          separation.rows.length,

        // Attendance
        absenteeism,

        // Retirement
        retirementsInPeriod: retirementRows.length,
        alreadyRetired,
        futureRetirements,
        retiringNext12Months,

        // Electricity
        electricityCost,
        solarShare,

        // Canteen
        canteenCost,

        // Health Check
        healthcheckPurchased,
        healthcheckAvailable,
        healthcheckUsed,
        healthcheckUsedPct,

        // Engagement
        engagementCount:
          engRows.length,

        avgParticipation,

        // Training
        trainingsCount:
          training.rows.length,
      },

      // Manpower location
      manpowerByLocation:
        Object.entries(
          manpowerByLocationMap
        ).map(
          ([location, headcount]) => ({
            location,
            headcount,
          })
        ),

      // Manpower trends
      manpowerMonthlyTrend,
      manpowerDailyTrend,
      dailyManpowerRecords,
      recruitmentMonthlyTrend,
      hiringMonthlyTrend,
      separationMonthlyTrend,
      loanByUnit,

      // Planned vs Actual
      manpowerPlanVsActual: [
        {
          name: 'Planned',
          value: plannedManpower,
          pct: pct(
            plannedManpower,
            plannedManpower +
              directManpower +
              indirectManpower
          ),
        },
        {
          name: 'Actual',
          value:
            directManpower +
            indirectManpower,
          pct: pct(
            directManpower +
              indirectManpower,
            plannedManpower +
              directManpower +
              indirectManpower
          ),
        },
      ],

      // Recruitment
      recruitmentFunnel:
        RECRUITMENT_STAGES.map(
          (stage) => ({
            stage,
            count:
              funnelCounts[stage],
          })
        ),

      // Pie charts
      pies: {
        manpowerSplit: [
          {
            name: 'Direct',
            value: directManpower,
            pct: pct(
              directManpower,
              directManpower +
                indirectManpower
            ),
          },
          {
            name: 'Indirect',
            value: indirectManpower,
            pct: pct(
              indirectManpower,
              directManpower +
                indirectManpower
            ),
          },
        ],

        electricitySource: [
          {
            name: 'Grid',
            value: totalUnits,
            pct: pct(
              totalUnits,
              totalUnits +
                totalSolar
            ),
          },
          {
            name: 'Solar',
            value: totalSolar,
            pct: solarShare,
          },
        ],

        recruitmentOutcome: [
          {
            name:
              'Selected / Offer / Joined',
            value: successCount,
            pct: pct(
              successCount,
              recRows.length
            ),
          },
          {
            name:
              'Rejected / Not Joined',
            value: rejectedCount,
            pct: pct(
              rejectedCount,
              recRows.length
            ),
          },
          {
            name: 'In Progress',
            value: inProgressCount,
            pct: pct(
              inProgressCount,
              recRows.length
            ),
          },
        ],
      },
    });

  } catch (e) {
    console.error(
      'DASHBOARD ERROR:',
      e
    );

    res.status(500).json({
      error:
        'Failed to compute dashboard',
      details:
        process.env.NODE_ENV !== 'production'
          ? e.message
          : undefined,
    });
  }
});

module.exports = router;
