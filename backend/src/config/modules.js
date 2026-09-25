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
    ],
  },

  // ------------------------------------------------------------
  // RECRUITMENT
  // ------------------------------------------------------------
  recruitment: {
    table: "recruitment",

    columns: [
      {
        js: "candidateName",
        db: "candidate_name",
        type: "text",
      },
      {
        js: "position",
        db: "position",
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
        js: "recruiter",
        db: "recruiter",
        type: "text",
      },
      {
        js: "source",
        db: "source",
        type: "text",
      },
      {
        js: "status",
        db: "status",
        type: "text",
      },
      {
        js: "applicationDate",
        db: "application_date",
        type: "date",
      },
      {
        js: "joiningDate",
        db: "joining_date",
        type: "date",
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
        js: "employeeName",
        db: "employee_name",
        type: "text",
      },
      {
        js: "joiningDate",
        db: "joining_date",
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
        js: "employmentType",
        db: "employment_type",
        type: "text",
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
        js: "employeeName",
        db: "employee_name",
        type: "text",
      },
      {
        js: "separationDate",
        db: "separation_date",
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
        js: "type",
        db: "type",
        type: "text",
      },
      {
        js: "reason",
        db: "reason",
        type: "text",
      },
    ],
  },

  // ------------------------------------------------------------
  // LOANS
  // ------------------------------------------------------------
  loans: {
    table: "loans",

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
        js: "loanType",
        db: "loan_type",
        type: "text",
      },
      {
        js: "sanctionedAmount",
        db: "sanctioned_amount",
        type: "number",
      },
      {
        js: "disbursedAmount",
        db: "disbursed_amount",
        type: "number",
      },
      {
        js: "monthlyRecovery",
        db: "monthly_recovery",
        type: "number",
      },
      {
        js: "totalRecovered",
        db: "total_recovered",
        type: "number",
      },
      {
        js: "startDate",
        db: "start_date",
        type: "date",
      },
      {
        js: "status",
        db: "status",
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
    table: "retirement",

    columns: [
      {
        js: "employeeName",
        db: "employee_name",
        type: "text",
      },
      {
        js: "employeeId",
        db: "employee_id",
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
        js: "dateOfBirth",
        db: "date_of_birth",
        type: "date",
      },
    ],

    fields: [
      {
        name: "employeeName",
        label: "Employee",
        type: "text",
      },
      {
        name: "employeeId",
        label: "Employee ID",
        type: "text",
      },
      {
        name: "department",
        label: "Department",
        type: "text",
      },
      {
        name: "location",
        label: "Location",
        type: "text",
      },
      {
        name: "dateOfBirth",
        label: "Date of Birth",
        type: "date",
      },
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
        js: "meals",
        db: "meals",
        type: "number",
      },
      {
        js: "employees",
        db: "employees",
        type: "number",
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
    ],
  },

  // ------------------------------------------------------------
  // HEALTH CHECK
  // ------------------------------------------------------------
  healthcheck: {
    table: "healthcheck",

    columns: [
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