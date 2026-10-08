// Maps each module key to its DB table and the columns exposed to the API.
//
// js   = camelCase field name used in request/response JSON
// db   = actual PostgreSQL column name
// type = 'text' | 'number' | 'date'
//
// The type drives input validation/coercion.

const MODULES = {
  // ------------------------------------------------------------
  // MANPOWER
  // ------------------------------------------------------------
    manpower: {
    table: "manpower",

    columns: [
      {
        js: "month",
        db: "month",
        type: "text",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "department",
        db: "department",
        type: "text",
      },
      {
        js: "plannedDirectCount",
        db: "planned_direct_count",
        type: "number",
      },
      {
        js: "plannedIndirectCount",
        db: "planned_indirect_count",
        type: "number",
      },
      {
        js: "directCount",
        db: "direct_count",
        type: "number",
      },
      {
        js: "indirectCount",
        db: "indirect_count",
        type: "number",
      },
      {
        js: "plannedCostPerPerson",
        db: "planned_cost_per_person",
        type: "number",
      },
      {
        js: "actualCostPerPerson",
        db: "actual_cost_per_person",
        type: "number",
      },
      {
        js: "entryDate",
        db: "entry_date",
        type: "date",
      },
    ],
  },
  dailyManpower: {
  table: 'daily_manpower',
  columns: [
    { js: 'date', db: 'date', type: 'date' },
    { js: 'departmentType', db: 'department_type', type: 'text' },
    { js: 'departmentProduction', db: 'department_production', type: 'text' },
    { js: 'fixedManpower', db: 'fixed_manpower', type: 'number' },
    { js: 'dayShift', db: 'day_shift', type: 'number' },
    { js: 'nightShift', db: 'night_shift', type: 'number' },
    { js: 'absent', db: 'absent', type: 'number' },
    { js: 'doubleShift', db: 'double_shift', type: 'number' },
  ]
},
  // ------------------------------------------------------------
  // RECRUITMENT
  // ------------------------------------------------------------
  recruitment: {
    table: "recruitment",

    columns: [
      {
        js: "openingType",
        db: "opening_type",
        type: "text",
      },
      {
        js: "openingPosition",
        db: "opening_position",
        type: "text",
      },
      {
        js: "numberOfPositions",
        db: "number_of_positions",
        type: "number",
      },
      {
        js: "remarks",
        db: "remarks",
        type: "text",
      },
      {
        js: "month",
        db: "month",
        type: "month",
      },
      {
        js: "department",
        db: "department",
        type: "text",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "shortlisted",
        db: "shortlisted",
        type: "number",
      },
      {
        js: "offered",
        db: "offered",
        type: "number",
      },
      {
        js: "status",
        db: "status",
        type: "select",
        options: [
          'Requirement', 'Sourcing', 'Screening', 'Shortlisted',
          'Interview Scheduled', 'Interviewed', 'Selected', 'Offer',
          'Joined', 'Rejected', 'Not Joined',
        ],
      },
    ],
  },

  // ------------------------------------------------------------
  // HIRING
  // ------------------------------------------------------------
  hiring: {
    table: "hiring",

    columns: [
      {
        js: "month",
        db: "month",
        type: "month",
      },
      {
        js: "department",
        db: "department",
        type: "text",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "joined",
        db: "joined",
        type: "number",
      },
    ],
  },

  // ------------------------------------------------------------
  // SEPARATION
  // ------------------------------------------------------------
  separation: {
    table: "separation",

    columns: [
      {
        js: "month",
        db: "month",
        type: "month",
      },
      {
        js: "department",
        db: "department",
        type: "text",
      },
      {
        js: "reason",
        db: "reason",
        type: "text",
      },
      {
        js: "mode",
        db: "mode",
        type: "text",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "lastWorkingDay",
        db: "last_working_day",
        type: "date",
      },
      {
        js: "exit",
        db: "exit",
        type: "text",
      },
    ],
  },

  // ------------------------------------------------------------
  // LOAN SUMMARY
  // ------------------------------------------------------------
  loanSummary: {
    table: "loan_summary",

    columns: [
      {
        js: "unit",
        db: "unit",
        type: "text",
      },
      {
        js: "budgetPersonal",
        db: "budget_personal",
        type: "number",
      },
      {
        js: "budgetHome",
        db: "budget_home",
        type: "number",
      },
      {
        js: "availablePersonal",
        db: "available_personal",
        type: "number",
      },
      {
        js: "availableHome",
        db: "available_home",
        type: "number",
      },
      {
        js: "takenPersonal",
        db: "taken_personal",
        type: "number",
      },
      {
        js: "takenHome",
        db: "taken_home",
        type: "number",
      },
      {
        js: "recoveredFY2526",
        db: "recovered_fy2526",
        type: "number",
      },
      {
        js: "takenFY2526",
        db: "taken_fy2526",
        type: "number",
      },
      {
        js: "takenFY2425",
        db: "taken_fy2425",
        type: "number",
      },
      {
        js: "outstandingTillJul26",
        db: "outstanding_till_jul26",
        type: "number",
      },
    ],
  },

  // ------------------------------------------------------------
  // RETIREMENT
  // ------------------------------------------------------------
   retirement: {
    table: 'retirement',
    columns: [
      { js: 'employeeName', db: 'employee_name', type: 'text' },
      { js: 'employeeId', db: 'employee_id', type: 'text' },
      { js: 'designation', db: 'designation', type: 'text' },
      { js: 'department', db: 'department', type: 'text' },
      { js: 'location', db: 'location', type: 'text' },
      { js: 'criticality', db: 'criticality', type: 'text' },
      { js: 'dateOfBirth', db: 'date_of_birth', type: 'date' },
      { js: 'lastWorkingDay', db: 'last_working_day', type: 'date' },
    ],
  },

  // ------------------------------------------------------------
  // ELECTRICITY
  // ------------------------------------------------------------
  electricity: {
    table: "electricity",

    columns: [
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "month",
        db: "month",
        type: "text",
      },
      {
        js: "openingReading",
        db: "opening_reading",
        type: "number",
      },
      {
        js: "closingReading",
        db: "closing_reading",
        type: "number",
      },
      {
        js: "solarGeneration",
        db: "solar_generation",
        type: "number",
      },
      {
        js: "billAmount",
        db: "bill_amount",
        type: "number",
      },
      {
        js: "remarks",
        db: "remarks",
        type: "text",
      },
    ],
  },

  // ------------------------------------------------------------
  // CANTEEN
  // ------------------------------------------------------------
  canteen: {
    table: "canteen",

    columns: [
      {
        js: "month",
        db: "month",
        type: "text",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "monthlyBill",
        db: "monthly_bill",
        type: "number",
      },
      {
        js: "employeeRecovery",
        db: "employee_recovery",
        type: "number",
      },
      {
        js: "managementCoupon",
        db: "management_coupon",
        type: "number",
      },
      {
        js: "visitorsCustomers",
        db: "visitors_customers",
        type: "number",
      },
    ],
  },

  // ------------------------------------------------------------
  // HEALTH CHECK
  // ------------------------------------------------------------
  healthcheck: {
    table: "healthcheck",

    columns: [
      {
        js: "employeeName",
        db: "employee_name",
        type: "text",
      },
      {
        js: "department",
        db: "department",
        type: "text",
      },
      {
        js: "designation",
        db: "designation",
        type: "text",
      },
      {
        js: "dateOfUsage",
        db: "date_of_usage",
        type: "date",
      },
      {
        js: "period",
        db: "period",
        type: "text",
      },
      {
        js: "asOfDate",
        db: "as_of_date",
        type: "date",
      },
      {
        js: "totalCouponsPurchased",
        db: "total_coupons_purchased",
        type: "number",
      },
      {
        js: "totalCouponsAvailable",
        db: "total_coupons_available",
        type: "number",
      },
      {
        js: "couponsAvailableHO",
        db: "coupons_available_ho",
        type: "number",
      },
      {
        js: "couponsAvailableIndustries",
        db: "coupons_available_industries",
        type: "number",
      },
    ],
  },

  // ------------------------------------------------------------
  // ENGAGEMENT
  // ------------------------------------------------------------
  engagement: {
    table: "engagement",

    columns: [
      {
        js: "activityName",
        db: "activity_name",
        type: "text",
      },
      {
        js: "date",
        db: "date",
        type: "date",
      },
      {
        js: "department",
        db: "department",
        type: "text",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "eligibleEmployees",
        db: "eligible_employees",
        type: "number",
      },
      {
        js: "participants",
        db: "participants",
        type: "number",
      },
      {
        js: "organizer",
        db: "organizer",
        type: "text",
      },
      {
        js: "cost",
        db: "cost",
        type: "number",
      },
      {
        js: "status",
        db: "status",
        type: "text",
      },
    ],
  },

  // ------------------------------------------------------------
  // TRAINING
  // ------------------------------------------------------------
  training: {
    table: "training",

    columns: [
      {
        js: "section",
        db: "section",
        type: "text",
      },
      {
        js: "trainingName",
        db: "training_name",
        type: "text",
      },
      {
        js: "trainingDate",
        db: "training_date",
        type: "date",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "trainer",
        db: "trainer",
        type: "text",
      },
      {
        js: "numberOfPeople",
        db: "number_of_people",
        type: "number",
      },
      {
        js: "averageRating",
        db: "average_rating",
        type: "number",
      },
      {
        js: "remarks",
        db: "remarks",
        type: "text",
      },
    ],
  },

  // ------------------------------------------------------------
  // ATTENDANCE
  // ------------------------------------------------------------
  attendance: {
    table: "attendance",

    columns: [
      {
        js: "month",
        db: "month",
        type: "text",
      },
      {
        js: "department",
        db: "department",
        type: "text",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "totalWorkingDays",
        db: "total_working_days",
        type: "number",
      },
      {
        js: "employeeStrength",
        db: "employee_strength",
        type: "number",
      },
      {
        js: "absentDays",
        db: "absent_days",
        type: "number",
      },
      {
        js: "leave",
        db: "leave_days",
        type: "number",
      },
    ],
  },

  // ------------------------------------------------------------
  // USER MANAGEMENT
  // ------------------------------------------------------------
  usersmgmt: {
    table: "users",

    columns: [
      {
        js: "name",
        db: "name",
        type: "text",
      },
      {
        js: "email",
        db: "email",
        type: "text",
      },
      {
        js: "department",
        db: "department",
        type: "text",
      },
      {
        js: "designation",
        db: "designation",
        type: "text",
      },
      {
        js: "location",
        db: "location",
        type: "text",
      },
      {
        js: "role",
        db: "role",
        type: "text",
      },
      {
        js: "status",
        db: "status",
        type: "text",
      },
    ],
  },
};

module.exports = { MODULES };