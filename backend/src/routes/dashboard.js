const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { canView } = require('../config/roles');

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
  '15d': "(%COL%) >= (current_date - interval '15 days')",
  '30d': "(%COL%) >= (current_date - interval '30 days')",
  month: "date_trunc('month', (%COL%)) = date_trunc('month', current_date)",
  year: "date_trunc('year', (%COL%)) = date_trunc('year', current_date)",
};

const VALID_RANGES = Object.keys(RANGE_SQL);

function whereFor(range, colExpr, year, selectedDate) {
  if (selectedDate) {
    // Exact day picked in Daily mode — overrides range and year.
    return `(${colExpr})::date = '${selectedDate}'`;
  }

  if (year) {
    return `extract(year from (${colExpr})) = ${year}`;
  }

  const tmpl = RANGE_SQL[
    VALID_RANGES.includes(range) ? range : 'all'
  ];

  return tmpl.replace(/%COL%/g, colExpr);
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

  const manpowerDateCol =
    "COALESCE(entry_date, to_date(month, 'YYYY-MM'))";

  const perm = {
    manpower: canView(req.user.role, 'manpower'),
    recruitment: canView(req.user.role, 'recruitment'),
    hiring: canView(req.user.role, 'hiring'),
    separation: canView(req.user.role, 'separation'),
    retirement: canView(req.user.role, 'retirement'),
    electricity: canView(req.user.role, 'electricity'),
    canteen: canView(req.user.role, 'canteen'),
    healthcheck: canView(req.user.role, 'healthcheck'),
    engagement: canView(req.user.role, 'engagement'),
    training: canView(req.user.role, 'training'),
    attendance: canView(req.user.role, 'attendance'),
  };

  const q = (allowed, sql) =>
    allowed
      ? pool.query(sql)
      : Promise.resolve({ rows: [] });

  try {
    const [
      manpower,
      dailyManpower,
      recruitment,
      attendance,
      retirement,
      electricity,
      canteen,
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
        WHERE ${whereFor(
          range,
          manpowerDateCol,
          year,
          requestedDate
        )}
        `
      ),

      // DAILY MANPOWER SHIFT BREAKDOWN
      q(
        perm.manpower,
        `
        SELECT date, department, production, fixed_manpower,
               day_shift, night_shift, absent, double_shift
        FROM daily_manpower
        WHERE ${whereFor(range, 'date', year, requestedDate)}
        ORDER BY date DESC, department ASC
        `
      ),

      // RECRUITMENT
      q(
        perm.recruitment,
        `
        SELECT month, opening_position, department, location, shortlisted, offered
        FROM recruitment
        WHERE ${whereFor(
          range,
          "to_date(month, 'YYYY-MM')",
          year,
          requestedDate
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
          requestedDate
        )}
        `
      ),

      // RETIREMENT
      // Retirement is not filtered by dashboard range.
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
          requestedDate
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

      // HEALTH CHECK
      q(
        perm.healthcheck,
        `
        SELECT
          total_coupons_purchased,
          total_coupons_available
        FROM healthcheck
        ORDER BY as_of_date DESC NULLS LAST
        LIMIT 1
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
        SELECT month, department, location, joined
        FROM hiring
        WHERE ${whereFor(
          range,
          "to_date(month, 'YYYY-MM')",
          year,
          requestedDate
        )}
        ORDER BY to_date(month, 'YYYY-MM') ASC NULLS LAST
        `
      ),

      // SEPARATION
      q(
        perm.separation,
        `
        SELECT month, department, reason, mode, location, last_working_day, exit
        FROM separation
        WHERE ${whereFor(
          range,
          "COALESCE(last_working_day, to_date(month, 'YYYY-MM'))",
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

    const dailyManpowerRecords = dailyManpower.rows.map((row) => {
      const dayShift = Number(row.day_shift) || 0;
      const nightShift = Number(row.night_shift) || 0;
      return {
        date: String(row.date || '').slice(0, 10),
        department: row.department || '—',
        production: Number(row.production) || 0,
        fixedManpower: Number(row.fixed_manpower) || 0,
        dayShift,
        nightShift,
        total: dayShift + nightShift,
        absent: Number(row.absent) || 0,
        doubleShift: Number(row.double_shift) || 0,
      };
    });

    // =========================================================
    // RECRUITMENT
    // =========================================================

    const recRows = recruitment.rows;

    const openPositions = recRows.length;

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