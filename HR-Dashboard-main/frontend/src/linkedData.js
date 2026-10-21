// frontend/src/linkedData.js
// Holds the Separation + Joined records so Recruitment Analysis columns can be
// derived from them. RecruitmentAnalysis.jsx fills it before the table renders.

// Retention checkpoints (months). Change here and the column headings follow.
export const RETAIN_SHORT_MONTHS = 6;
export const RETAIN_LONG_MONTHS = 12;
export const EARLY_EXIT_DAYS = 90;

const linked = { separation: [], hiring: [] };
export const setLinked = (key, rows) => { linked[key] = Array.isArray(rows) ? rows : []; };
export const getLinked = (key) => linked[key];

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const toUtc = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};
const addMonths = (ms, n) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
};
const DAY = 86400000;

// Separation record for this candidate (matched on name), latest exit wins.
export function findSeparation(candidateName) {
  const n = norm(candidateName);
  if (!n) return null;
  const hits = linked.separation.filter(
    (r) => norm(r.employeeName ?? r.candidateName ?? r.name) === n
  );
  hits.sort((a, b) => String(b.lastWorkingDay || '').localeCompare(String(a.lastWorkingDay || '')));
  return hits[0] || null;
}

// Joined-tab record for this candidate (matched on name), latest DOJ wins.
export function findJoined(candidateName) {
  const n = norm(candidateName);
  if (!n) return null;
  const hits = linked.hiring.filter((r) => norm(r.employeeName) === n);
  hits.sort((a, b) => String(b.dateOfJoining || '').localeCompare(String(a.dateOfJoining || '')));
  return hits[0] || null;
}

// Start of employment: the Hiring Date typed here, else the Joined tab's DOJ.
// A candidate counts as joined if marked Yes here or found in the Joined tab.
function tenureStart(r) {
  const joinedRec = findJoined(r.candidateName);
  if (r.joined !== 'Yes' && !joinedRec) return null;
  const start = toUtc(r.hiringDate);
  return start !== null ? start : toUtc(joinedRec?.dateOfJoining);
}

export function timeToFill(r) {
  const a = toUtc(r.mrfDate), b = toUtc(r.hiringDate) ?? toUtc(findJoined(r.candidateName)?.dateOfJoining);
  return a !== null && b !== null && b >= a ? Math.round((b - a) / DAY) : null;
}

export function retained(r, months) {
  const start = tenureStart(r);
  if (start === null) return '—';
  const target = addMonths(start, months);
  const lwd = toUtc(findSeparation(r.candidateName)?.lastWorkingDay);
  if (lwd !== null) return lwd < target ? 'No' : 'Yes';
  return Date.now() >= target ? 'Yes' : 'Pending';
}

export function leftWithinDays(r, days = EARLY_EXIT_DAYS) {
  const start = tenureStart(r);
  if (start === null) return '—';
  const lwd = toUtc(findSeparation(r.candidateName)?.lastWorkingDay);
  return lwd !== null && lwd - start <= days * DAY ? 'Yes' : 'No';
}