import {
  Factory, Briefcase, UserPlus, UserMinus, Landmark, Wallet, CalendarClock, Zap,
  UtensilsCrossed, HeartPulse, PartyPopper, ClipboardList, Shield, CalendarDays,
} from 'lucide-react';

export const C = {
  ink: '#20242A',       // primary text (dark charcoal, not pure black)
  panel: '#FFFFFF',     // sidebar / header background
  paper: '#F5F3EE',     // page background (warm light)
  card: '#FFFFFF',
  line: '#E1DDD2',
  steel: '#3E5C73',     // primary accent
  steelTint: '#EAF0F4', // light steel wash for active nav / badges
  amber: '#C97F1E',
  amberTint: '#FBF1DF',
  rust: '#B04A34',
  moss: '#4B7A67',
  ink2: '#6B6F76',
};

export const FONT_HEAD = "'Barlow Semi Condensed', 'Arial Narrow', sans-serif";
export const FONT_BODY = "'Inter', system-ui, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', 'Courier New', monospace";


export const RECRUITMENT_STAGES = [
  'Requirement', 'Sourcing', 'Screening', 'Shortlisted', 'Interview Scheduled',
  'Interviewed', 'Selected', 'Offer', 'Joined', 'Rejected', 'Not Joined',
];

// Master Department list — used everywhere a "Department" dropdown appears.
export const DEPARTMENTS = [
  'ACCOUNT & FINANCE', 'ADMIN', 'CEO OFFICE', 'Civil Maintainance', 'DISPATCH',
  'EXPORTS', 'HUMAN RESOURCE', 'INVENTORY CONTROL', 'IT', 'LOGISTICS',
  'MAINTENANCE', 'MARKETING', 'O & M', 'PENTRY', 'PRODUCTION', 'PROJECTS',
  'PURCHASE', 'QC_SHOP FLOOR', 'QUALITY CONTROL', 'R&D', 'SALES',
  'SALES_CENTRAL', 'Sales_HO', 'Sales_Hyderabad', 'TOOL ROOM', 'WAREHOUSE',
  'Water Meter',
];

// Master Designation list — used for the Designation dropdown (User Management).
export const DESIGNATIONS = [
  'A.G.M', 'AREA MANAGER', 'Area Manager (Lanscape & Automation)', 'ASSISTANT',
  'ASSISTANT MANAGER', 'Assistant Technical Manager Automation',
  'ASST. MANAGER MARKETING', 'AUTOMATION TECHNICIAN', 'BLEDER', 'COORDINATOR',
  'Deputy General Manager', 'DEPUTY MANAGER', 'DEPUTY MANAGER MARKETING',
  'DESIGN ENGINEER', 'DESIGNER', 'DIRECTOR', 'DRIVER', 'ELECTRICIAN',
  'ENGINEER', 'EXECUTIVE', 'GENERAL MANAGER', 'GUARD', 'HELPER', 'HOD',
  'INSPECTOR', 'Junior Executive', 'JUNIOR TECHNICIAN', 'LAB ASSISTANT',
  'LAB INCHARGE', 'MANAGER', 'MANAGING DIRECTOR', 'Mgt.-Trainee',
  'OFFICER SECURITY', 'OPERATOR', 'PAINTER', 'Peon', 'PLUMBER', 'PRESIDENT',
  'QUALITY INSPECTOR', 'Receptionist', 'REGIONAL MANAGER',
  'RESPONSE EXECUTIVE', 'SALES CORDINATOR', 'Sales Engineer',
  'Sales Engineer (Smart Irrigation)', 'SALES EXECUTIVE', 'Sales Head',
  'Sales Technician', 'Sales Technician (Automation)', 'Site Supervisor',
  'Site Supervisor ( Automation)', 'Sn.Supervisor', 'SR. AUTOMATION TECHNICIAN',
  'Sr. Designer', 'SR. ENGINEER', 'SR. EXECUTIVE', 'SR. MANAGER',
  'Sr. Sales Coordinator', 'Sr. Site Supervisor', 'Sr. Technician',
  'STORE ASSISTANT', 'STORE EXECUTIVE', 'SUPERVISOR', 'TEAM MEMBER -IB',
  'TECHNICIAN', 'Technician cum Driver', 'Territory Manager', 'WORKER',
  'Zonal Head', 'ZONAL MANAGER',
];

// Manpower Plan vs Actual: each record carries both the planned headcount
// and the actual headcount for that month/location/department, so variance
// can be computed directly instead of needing two separate rows.

// Must match backend/src/config/roles.js — this static object is now only
// the FIRST-RUN SEED / offline fallback. Once logged in, the app uses the
// live, admin-editable permissions returned by the server (user.roleAccess)
// in preference to this. See ROLE_META below for admin-editable metadata.
export const ROLES = {
  Administrator: { modules: 'all', edit: 'all' },
    'HR Manager': {
    modules: ['dashboard', 'manpower', 'recruitment', 'hiring', 'separation', 'loans', 'retirement', 'healthcheck', 'engagement', 'training', 'attendance'],
    edit: ['manpower', 'recruitment', 'hiring', 'separation', 'loans', 'retirement', 'healthcheck', 'engagement', 'training', 'attendance'],
  },

  'Plant Head': {
    modules: ['dashboard', 'manpower', 'attendance', 'engagement', 'healthcheck', 'retirement'],
    edit: ['manpower', 'attendance', 'engagement','training', 'healthcheck'],
  },
  Recruiter: { modules: ['dashboard', 'recruitment', 'hiring'], edit: ['recruitment', 'hiring'] },
    'Finance & Accounts': { modules: ['dashboard', 'loans', 'loanSummary', 'electricity', 'canteen'], edit: ['loans', 'loanSummary', 'electricity', 'canteen'] },
  'Plant Operations': { modules: ['dashboard', 'electricity', 'canteen', 'attendance'], edit: ['electricity', 'canteen', 'training', 'attendance'] },
  Management: { modules: 'all', edit: [] },
  // Public self-signup default only — excludes Audit Trail and User
  // Management (staff emails/roles) since these shouldn't be public.
   Viewer: {
    modules: ['dashboard', 'manpower', 'recruitment', 'hiring', 'separation', 'loans', 'loanSummary', 'retirement', 'electricity', 'canteen', 'healthcheck', 'engagement','training', 'attendance'],
    edit: [],
  },
};

// Roles an Administrator can hand out via User Management. Viewer is excluded —
// it is only ever granted through public self-signup (enforced server-side too).
export const ASSIGNABLE_ROLES = Object.keys(ROLES).filter((r) => r !== 'Viewer');

// Must match backend/src/config/modules.js field names (js side)
export const MODULES = [
   { key: 'manpower', label: 'Manpower', icon: Factory, showTotals: true, wrapHeaders: true, fields: [
    { name: 'month', label: 'Month', type: 'month' },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
    { name: 'plannedDirectCount', label: 'Planned Direct', type: 'number' },
    { name: 'plannedIndirectCount', label: 'Planned Indirect', type: 'number' },
    { name: 'directCount', label: 'Actual Direct', type: 'number' },
    { name: 'indirectCount', label: 'Actual Indirect', type: 'number' },
    { name: 'plannedCostPerPerson', label: 'Planned Cost / Person (₹)', type: 'number' },
    { name: 'actualCostPerPerson', label: 'Actual Cost / Person (₹)', type: 'number' },
  ]},
  { key: 'recruitment', label: 'Recruitment', icon: Briefcase, showTotals: true, wrapHeaders: true, fields: [
    { name: 'candidateName', label: 'Candidate', type: 'text' },
    { name: 'position', label: 'Position', type: 'text' },
    { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'recruiter', label: 'Recruiter', type: 'text' },
    { name: 'source', label: 'Source', type: 'text' },
    { name: 'status', label: 'Stage', type: 'select', options: RECRUITMENT_STAGES },
    { name: 'applicationDate', label: 'Applied', type: 'date' },
    { name: 'joiningDate', label: 'Joining Date', type: 'date' },
  ]},
  { key: 'hiring', label: 'Hiring', icon: UserPlus, showTotals: true, wrapHeaders: true, fields: [
    { name: 'employeeName', label: 'Employee', type: 'text' },
    { name: 'joiningDate', label: 'Joining Date', type: 'date' },
    { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'employmentType', label: 'Employment Type', type: 'text' },
  ]},
  { key: 'separation', label: 'Separation', icon: UserMinus, showTotals: true, wrapHeaders: true, fields: [
    { name: 'employeeName', label: 'Employee', type: 'text' },
    { name: 'separationDate', label: 'Separation Date', type: 'date' },
    { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'type', label: 'Type', type: 'select', options: ['Resignation', 'Termination', 'Retirement', 'Other'] },
    { name: 'reason', label: 'Reason', type: 'text' },
  ]},
  { key: 'loans', label: 'Loans', icon: Landmark, showTotals: true, wrapHeaders: true, fields: [   
     { name: 'employeeName', label: 'Employee', type: 'text' },
    { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
    { name: 'loanType', label: 'Loan Type', type: 'text' },
    { name: 'sanctionedAmount', label: 'Sanctioned', type: 'number' },
    { name: 'disbursedAmount', label: 'Disbursed', type: 'number' },
    { name: 'monthlyRecovery', label: 'Monthly Recovery', type: 'number' },
    { name: 'totalRecovered', label: 'Total Recovered', type: 'number' },
    { name: 'startDate', label: 'Start Date', type: 'date' },
       { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Closed'] },
  ]},
  { key: 'loanSummary', label: 'Loan Summary', icon: Wallet, showTotals: true,  wrapHeaders: true, columnGroups: [
    { title: 'Budget & Corpus Position', fields: ['unit', 'budgetPersonal', 'budgetHome', 'availablePersonal', 'availableHome', 'takenPersonal', 'takenHome'] },
    { title: 'Recovery & Outstanding', fields: ['unit', 'recoveredFY2526', 'takenFY2526', 'takenFY2425', 'outstandingTillJul26'] },
  ], fields: [
        { name: 'unit', label: 'Unit', type: 'select', options: ['Industries (Factory)', 'Corporate', 'Sales'] },
    { name: 'budgetPersonal', label: 'Budget FY26-27 – Personal (₹ Lac)', type: 'number' },
    { name: 'budgetHome', label: 'Budget FY26-27 – Home (₹ Lac)', type: 'number' },
    { name: 'availablePersonal', label: 'Available Corpus Till Aug-26 – Personal (₹ Lac)', type: 'number' },
    { name: 'availableHome', label: 'Available Corpus Till Aug-26 – Home (₹ Lac)', type: 'number' },
    { name: 'takenPersonal', label: 'Loan Taken Till Aug-26 – Personal (₹ Lac)', type: 'number' },
    { name: 'takenHome', label: 'Loan Taken Till Aug-26 – Home (₹ Lac)', type: 'number' },
    { name: 'recoveredFY2526', label: 'Amount Recovered FY25-26 (₹ Lac)', type: 'number' },
    { name: 'takenFY2526', label: 'Loan Taken FY25-26 (₹ Lac)', type: 'number' },
    { name: 'takenFY2425', label: 'Loan Taken FY24-25 (₹ Lac)', type: 'number' },
    { name: 'outstandingTillJul26', label: 'Total Outstanding Till Jul-26 (₹ Lac)', type: 'number' },
  ]},
  {
  key: 'retirement',
  label: 'Retirement',
  icon: CalendarClock,
  fields: [
    {
      name: 'employeeName',
      label: 'Employee',
      type: 'text'
    },
    {
      name: 'employeeId',
      label: 'Employee ID',
      type: 'text'
    },
    {
      name: 'department',
      label: 'Department',
      type: 'text'
    },
    {
      name: 'location',
      label: 'Location',
      type: 'text'
    },
    {
      name: 'dateOfBirth',
      label: 'Date of Birth',
      type: 'date'
    }
  ]
},
  { key: 'electricity', label: 'Electricity', icon: Zap, showTotals: true, wrapHeaders: true, fields: [
    { name: 'location', label: 'Location / Plant', type: 'text' },
    { name: 'month', label: 'Month', type: 'month' },
    { name: 'openingReading', label: 'Opening Reading', type: 'number' },
    { name: 'closingReading', label: 'Closing Reading', type: 'number' },
    { name: 'solarGeneration', label: 'Solar Generation (units)', type: 'number' },
    { name: 'billAmount', label: 'Bill Amount', type: 'number' },
  ]},
  { key: 'canteen', label: 'Canteen', icon: UtensilsCrossed, showTotals: true, wrapHeaders: true, fields: [
    { name: 'month', label: 'Month', type: 'month' },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'meals', label: 'Meals Served', type: 'number' },
    { name: 'employees', label: 'Employees Covered', type: 'number' },
    { name: 'monthlyBill', label: 'Monthly Bill', type: 'number' },
    { name: 'employeeRecovery', label: 'Employee Recovery', type: 'number' },
  ]},
  {
  key: 'healthcheck',
  label: 'Health Check',
  icon: HeartPulse,
  showTotals: true,
  wrapHeaders: true,

  fields: [
    {
      name: 'period',
      label: 'Month / Period',
      type: 'text'
    },
    {
      name: 'asOfDate',
      label: 'As of Date',
      type: 'date'
    },
    {
      name: 'totalCouponsPurchased',
      label: 'Total No. Coupons Purchased',
      type: 'number'
    },
    {
      name: 'totalCouponsAvailable',
      label: 'Total No. of Coupons Available',
      type: 'number'
    },
    {
      name: 'couponsAvailableHO',
      label: 'No. of Coupons Available (HO)',
      type: 'number'
    },
    {
      name: 'couponsAvailableIndustries',
      label: 'No. of Coupons Available (Industries)',
      type: 'number'
    }
  ]
},
  { key: 'engagement', label: 'Engagement', icon: PartyPopper, showTotals: true, wrapHeaders: true, fields: [
    { name: 'activityName', label: 'Activity', type: 'text' },
    { name: 'date', label: 'Date', type: 'date' },
    { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'eligibleEmployees', label: 'Eligible Employees', type: 'number' },
    { name: 'participants', label: 'Participants', type: 'number' },
    { name: 'organizer', label: 'Organizer', type: 'text' },
    { name: 'cost', label: 'Cost', type: 'number' },
    { name: 'status', label: 'Status', type: 'select', options: ['Last Month', 'Current Month', 'Next Month', 'Completed'] },
  ]},
  {
  key: 'training',
  label: 'Training',
  icon: CalendarDays,
  showTotals: true, wrapHeaders: true, fields: [
    { name: 'trainingName', label: 'Training Name', type: 'text' },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'trainingDate', label: 'Training Date', type: 'date' },
  ],
},
  { key: 'attendance', label: 'Attendance', icon: ClipboardList, showTotals: true, wrapHeaders: true, fields: [
    { name: 'month', label: 'Month', type: 'month' },
    { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'totalWorkingDays', label: 'Working Days', type: 'number' },
    { name: 'employeeStrength', label: 'Employee Strength', type: 'number' },
    { name: 'absentDays', label: 'Absent Employee-Days', type: 'number' },
    { name: 'leave', label: 'Leave Days', type: 'number' },
  ]},
  
  { key: 'usersmgmt', label: 'User Management', icon: Shield, showTotals: true, wrapHeaders: true, fields: [
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'email', label: 'Email', type: 'text' },
    { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS },
    { name: 'designation', label: 'Designation', type: 'select', options: DESIGNATIONS },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'role', label: 'Assigned Role', type: 'select', options: ASSIGNABLE_ROLES },
    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Pending', 'Inactive'] },
    { name: 'password', label: 'Set Password (optional)', type: 'password' },
  ]},
];

export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.key, m]));
export const ALL_KEYS = MODULES.map((m) => m.key);

export function fmtMoney(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Live "auto-calculated" fields — computed in the browser from whatever the
// user has typed so far (no save needed to see them). Shown in the Add/Edit
// form as read-only rows, and as extra read-only columns in the table.
// Each computed entry may also carry a `total(rows)` roll-up used for the
// section Total row and for the Monthly / Quarterly / Half-Yearly / Annual
// period summary. For additive values (counts, money) it sums the same
// underlying components across every row instead of adding the already-
// formatted per-row strings; for rate/percentage values it recomputes the
// ratio from the aggregated totals (a correct weighted figure, not a plain
// average of per-row percentages).
export const COMPUTED = {
  manpower: [
    {
      name: 'plannedTotal',
      label: 'Planned Total',
      compute: (v) => (num(v.plannedDirectCount) + num(v.plannedIndirectCount)).toLocaleString('en-IN'),
      total: (rows) => rows.reduce((s, v) => s + num(v.plannedDirectCount) + num(v.plannedIndirectCount), 0).toLocaleString('en-IN'),
    },
    {
      name: 'totalHeadcount',
      label: 'Actual Total',
      compute: (v) => (num(v.directCount) + num(v.indirectCount)).toLocaleString('en-IN'),
      total: (rows) => rows.reduce((s, v) => s + num(v.directCount) + num(v.indirectCount), 0).toLocaleString('en-IN'),
    },
    {
      name: 'variance',
      label: 'Variance (Actual − Planned)',
      compute: (v) => {
        const planned = num(v.plannedDirectCount) + num(v.plannedIndirectCount);
        const actual = num(v.directCount) + num(v.indirectCount);
        const diff = actual - planned;
        return `${diff > 0 ? '+' : ''}${diff.toLocaleString('en-IN')}`;
      },
      total: (rows) => {
        const planned = rows.reduce((s, v) => s + num(v.plannedDirectCount) + num(v.plannedIndirectCount), 0);
        const actual = rows.reduce((s, v) => s + num(v.directCount) + num(v.indirectCount), 0);
        const diff = actual - planned;
        return `${diff > 0 ? '+' : ''}${diff.toLocaleString('en-IN')}`;
      },
    },
    {
      name: 'plannedCost',
      label: 'Planned Cost (Headcount × Cost/Person)',
      compute: (v) => fmtMoney((num(v.plannedDirectCount) + num(v.plannedIndirectCount)) * num(v.plannedCostPerPerson)),
      total: (rows) => fmtMoney(rows.reduce((s, v) => s + (num(v.plannedDirectCount) + num(v.plannedIndirectCount)) * num(v.plannedCostPerPerson), 0)),
    },
    {
      name: 'actualCost',
      label: 'Actual Cost (Headcount × Cost/Person)',
      compute: (v) => fmtMoney((num(v.directCount) + num(v.indirectCount)) * num(v.actualCostPerPerson)),
      total: (rows) => fmtMoney(rows.reduce((s, v) => s + (num(v.directCount) + num(v.indirectCount)) * num(v.actualCostPerPerson), 0)),
    },
  ],
  retirement: [
  {
    name: 'age',
    label: 'Age as on Date',
    compute: (row) => {
      if (!row.dateOfBirth) return '—';

      const dob = new Date(row.dateOfBirth);
      const today = new Date();

      let age = today.getFullYear() - dob.getFullYear();

      const monthDiff = today.getMonth() - dob.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < dob.getDate())
      ) {
        age--;
      }

      return age >= 0 ? `${age} Years` : '—';
    }
  }
],
  loans: [
    {
      name: 'outstanding',
      label: 'Outstanding Amount',
      compute: (v) => fmtMoney(Math.max(0, num(v.disbursedAmount) - num(v.totalRecovered))),
      total: (rows) => fmtMoney(rows.reduce((s, v) => s + Math.max(0, num(v.disbursedAmount) - num(v.totalRecovered)), 0)),
    },
  ],
  electricity: [
    {
      name: 'consumption',
      label: 'Consumption (units)',
      compute: (v) => {
        const units = num(v.closingReading) - num(v.openingReading);
        return units >= 0 && (v.openingReading || v.closingReading) ? units.toLocaleString('en-IN') : '—';
      },
      total: (rows) => rows.reduce((s, v) => s + Math.max(0, num(v.closingReading) - num(v.openingReading)), 0).toLocaleString('en-IN'),
    },
    {
      name: 'costPerUnit',
      label: 'Cost per Unit',
      compute: (v) => {
        const units = num(v.closingReading) - num(v.openingReading);
        return units > 0 ? '₹' + (num(v.billAmount) / units).toFixed(2) : '—';
      },
      total: (rows) => {
        const units = rows.reduce((s, v) => s + Math.max(0, num(v.closingReading) - num(v.openingReading)), 0);
        const bill = rows.reduce((s, v) => s + num(v.billAmount), 0);
        return units > 0 ? '₹' + (bill / units).toFixed(2) : '—';
      },
    },
  ],
  canteen: [
    {
      name: 'companyContribution',
      label: 'Company Contribution',
      compute: (v) => fmtMoney(Math.max(0, num(v.monthlyBill) - num(v.employeeRecovery))),
      total: (rows) => fmtMoney(rows.reduce((s, v) => s + Math.max(0, num(v.monthlyBill) - num(v.employeeRecovery)), 0)),
    },
    {
      name: 'costPerMeal',
      label: 'Cost per Meal',
      compute: (v) => (num(v.meals) > 0 ? '₹' + (num(v.monthlyBill) / num(v.meals)).toFixed(2) : '—'),
      total: (rows) => {
        const meals = rows.reduce((s, v) => s + num(v.meals), 0);
        const bill = rows.reduce((s, v) => s + num(v.monthlyBill), 0);
        return meals > 0 ? '₹' + (bill / meals).toFixed(2) : '—';
      },
    },
  ],

  attendance: [
    {
      name: 'absenteeismPct',
      label: 'Absenteeism %',
      compute: (v) => {
        const available = num(v.totalWorkingDays) * num(v.employeeStrength);
        return available > 0 ? ((num(v.absentDays) / available) * 100).toFixed(1) + '%' : '—';
      },
      total: (rows) => {
        const available = rows.reduce((s, v) => s + num(v.totalWorkingDays) * num(v.employeeStrength), 0);
        const absent = rows.reduce((s, v) => s + num(v.absentDays), 0);
        return available > 0 ? ((absent / available) * 100).toFixed(1) + '%' : '—';
      },
    },
  ],
  engagement: [
    {
      name: 'participationPct',
      label: 'Participation %',
      compute: (v) => (num(v.eligibleEmployees) > 0 ? ((num(v.participants) / num(v.eligibleEmployees)) * 100).toFixed(1) + '%' : '—'),
      total: (rows) => {
        const eligible = rows.reduce((s, v) => s + num(v.eligibleEmployees), 0);
        const participants = rows.reduce((s, v) => s + num(v.participants), 0);
        return eligible > 0 ? ((participants / eligible) * 100).toFixed(1) + '%' : '—';
      },
    },
  ],
};
// One summary chart per module, shown at the top of that module's own page
// (not the dashboard). "bar" groups records by a field and sums/counts a
// value; "pie" does the same but renders as a percentage pie.
export const CHARTS = {
    manpower: {
      type: 'bar',
      title: 'Planned vs Actual headcount by location',
      groupBy: 'location',
      series: [
        { key: 'planned', label: 'Planned', fields: ['plannedDirectCount', 'plannedIndirectCount'] },
        { key: 'actual', label: 'Actual', fields: ['directCount', 'indirectCount'] },
      ],
    },
  recruitment: { type: 'pie', title: 'Candidates by stage', groupBy: 'status', aggregate: 'count' },
  hiring: { type: 'bar', title: 'New joiners by department', groupBy: 'department', aggregate: 'count' },
  separation: { type: 'pie', title: 'Separations by type', groupBy: 'type', aggregate: 'count' },
    loans: { type: 'pie', title: 'Loans by status', groupBy: 'status', aggregate: 'count' },
  loanSummary: { type: 'bar', title: 'Outstanding by unit (₹ Lac)', groupBy: 'unit', aggregate: 'sum', valueField: 'outstandingTillJul26' },
  electricity: { type: 'bar', title: 'Bill amount by location', groupBy: 'location', aggregate: 'sum', valueField: 'billAmount' },
  canteen: { type: 'bar', title: 'Monthly bill by location', groupBy: 'location', aggregate: 'sum', valueField: 'monthlyBill' },
  healthcheck: { type: 'pie', title: 'Status breakdown', groupBy: 'status', aggregate: 'count' },
  engagement: { type: 'bar', title: 'Participants by activity', groupBy: 'activityName', aggregate: 'sum', valueField: 'participants' },
  attendance: { type: 'bar', title: 'Absent days by department', groupBy: 'department', aggregate: 'sum', valueField: 'absentDays' },
  usersmgmt: { type: 'pie', title: 'Accounts by role', groupBy: 'role', aggregate: 'count' },
};
