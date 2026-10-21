// Pure helpers (no React, no pdf.js) that turn the text pdf.js extracts from a
// PDF into Separation records. Kept separate so the logic is easy to test.

export const keyFor = (value) =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

// Extra heading names that are accepted for each Separation field.
export const SEPARATION_ALIASES = {
  employeeName: ['name', 'employee name', 'employee', 'emp name', 'name of employee', 'name of the employee'],
  month: ['month', 'separation month', 'month of separation'],
  department: ['department', 'dept', 'deptt', 'department name'],
  reason: ['reason', 'reason for leaving', 'reason of leaving', 'reason for separation', 'reason for exit'],
  mode: ['mode', 'mode of separation', 'separation mode'],
  location: ['location', 'plant', 'site'],
  lastWorkingDay: ['lwd', 'last working day', 'last working date', 'lwd date', 'date of leaving', 'relieving date', 'date of relieving'],
  exit: ['exit', 'exited', 'exit status'],
};

export const FIELD_ORDER = ['employeeName', 'month', 'department', 'reason', 'mode', 'location', 'lastWorkingDay', 'exit'];

export function fieldForHeader(text, fields) {
  const k = keyFor(text);
  if (!k) return null;
  for (const field of fields) {
    const candidates = [field.name, field.label, ...(SEPARATION_ALIASES[field.name] || [])].map(keyFor);
    if (candidates.includes(k)) return field.name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1) pdf.js text items -> lines of cells
//    item = { str, x, y, w }  (PDF coordinates: y grows upwards)
// ---------------------------------------------------------------------------
export function groupIntoLines(items, yTol = 3, gapTol = 4) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - item.y) <= yTol) last.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows
    .map((row) => {
      const ordered = row.items.sort((a, b) => a.x - b.x);
      const cells = [];
      let prevEnd = null;
      for (const item of ordered) {
        if (cells.length && prevEnd !== null && item.x - prevEnd <= gapTol) {
          const cell = cells[cells.length - 1];
          cell.text += (item.x - prevEnd > 1 ? ' ' : '') + item.str;
        } else {
          cells.push({ text: item.str, x: item.x });
        }
        prevEnd = item.x + (item.w || 0);
      }
      return cells
        .map((cell) => ({ ...cell, text: cell.text.replace(/\s+/g, ' ').trim() }))
        .filter((cell) => cell.text);
    })
    .filter((cells) => cells.length);
}

// ---------------------------------------------------------------------------
// 2) lines of cells -> raw rows { employeeName, month, department, ... }
// ---------------------------------------------------------------------------
const FOOTER_RE = /^(page|pg)\s*\d+(\s*(of|\/)\s*\d+)?$/i;

export function parseSeparationLines(lines, fields) {
  // number of DIFFERENT fields whose heading appears in this line
  const headerScore = (cells) =>
    new Set(cells.map((cell) => fieldForHeader(cell.text, fields)).filter(Boolean)).size;

  let headerIndex = -1;
  let best = 1; // need at least 2 matching headings
  lines.slice(0, 60).forEach((cells, index) => {
    const score = headerScore(cells);
    if (score > best) { best = score; headerIndex = index; }
  });

  const rows = [];
  const names = fields.map((field) => field.name);

  if (headerIndex >= 0) {
    // Column anchors = x position of every heading cell
    const anchors = lines[headerIndex]
      .map((cell) => ({ x: cell.x, field: fieldForHeader(cell.text, fields) }))
      .sort((a, b) => a.x - b.x);
    const nameField = anchors.some((a) => a.field === 'employeeName') ? 'employeeName' : null;
    const TOL = 15;

    lines.slice(headerIndex + 1).forEach((cells) => {
      if (headerScore(cells) >= 2) return; // header repeated on next page
      if (cells.length === 1 && FOOTER_RE.test(cells[0].text)) return;

      const row = {};
      cells.forEach((cell) => {
        let anchorIndex = 0;
        anchors.forEach((anchor, i) => { if (anchor.x <= cell.x + TOL) anchorIndex = i; });
        const field = anchors[anchorIndex].field;
        if (!field) return; // e.g. S.No. column
        row[field] = row[field] ? `${row[field]} ${cell.text}` : cell.text;
      });
      if (!Object.keys(row).length) return;

      const previous = rows[rows.length - 1];
      // A line without a Name is the wrapped text of the previous row
      if (nameField && !row[nameField] && previous) {
        Object.entries(row).forEach(([field, text]) => {
          previous[field] = previous[field] ? `${previous[field]} ${text}` : text;
        });
        return;
      }
      if (nameField && !row[nameField]) return;
      rows.push(row);
    });
    return { rows, headerFound: true };
  }

  // No heading row found: assign cells left-to-right in the field order
  lines.forEach((cells) => {
    if (cells.length === 1 && FOOTER_RE.test(cells[0].text)) return;
    const texts = cells.map((cell) => cell.text);
    if (/^\d+$/.test(texts[0]) && texts.length > 1) texts.shift(); // serial no.
    if (texts.length < 3) return;
    const row = {};
    FIELD_ORDER.filter((name) => names.includes(name)).forEach((name, i) => {
      if (texts[i] !== undefined) row[name] = texts[i];
    });
    rows.push(row);
  });
  return { rows, headerFound: false };
}

// ---------------------------------------------------------------------------
// 3) Value cleaning
// ---------------------------------------------------------------------------
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const pad = (n) => String(n).padStart(2, '0');
const fullYear = (y) => (String(y).length === 2 ? 2000 + Number(y) : Number(y));
const validDate = (y, m, d) => {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

export function normalizeDate(text) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  let m = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m && validDate(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/); // day first (dd/mm/yyyy)
  if (m) { const y = fullYear(m[3]); if (validDate(y, +m[2], +m[1])) return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  m = value.match(/^(\d{1,2})[\s\-./,']*([A-Za-z]{3,9})[\s\-./,']*(\d{2}|\d{4})$/); // 15-Aug-2026
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = fullYear(m[3]);
    if (validDate(y, MONTHS[m[2].toLowerCase()], +m[1])) return `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  }
  m = value.match(/^([A-Za-z]{3,9})[\s\-./,']*(\d{1,2})[\s\-./,']*(\d{4})$/); // Aug 15, 2026
  if (m && MONTHS[m[1].toLowerCase()]) {
    const y = +m[3];
    if (validDate(y, MONTHS[m[1].toLowerCase()], +m[2])) return `${y}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`;
  }
  return '';
}

export function normalizeMonth(text) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  let m = value.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${pad(m[2])}`;
  m = value.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${pad(m[1])}`;
  m = value.match(/^([A-Za-z]{3,9})[\s\-./,']*(\d{2}|\d{4})$/); // Aug-26, August 2026
  if (m && MONTHS[m[1].toLowerCase()]) return `${fullYear(m[2])}-${pad(MONTHS[m[1].toLowerCase()])}`;
  const date = normalizeDate(value); // a full date was given
  return date ? date.slice(0, 7) : '';
}

export function normalizeExit(text, fallback = 'Yes') {
  const k = keyFor(text);
  if (['yes', 'y', 'true', 'exited'].includes(k)) return 'Yes';
  if (['no', 'n', 'false'].includes(k)) return 'No';
  return fallback;
}

// options can be plain strings or { value, label } objects (like DEPARTMENTS).
// Returns the option's stored VALUE, or '' when nothing matches.
export function matchOption(text, options) {
  const k = keyFor(text);
  if (!k) return '';
  for (const option of options) {
    const value = typeof option === 'string' ? option : option.value;
    const label = typeof option === 'string' ? option : option.label;
    if (keyFor(value) === k || keyFor(label) === k) return value;
  }
  return '';
}

// Raw rows -> clean, editable records for the preview table
export function buildRecords(rawRows, { departmentOptions = [], defaultExit = 'Yes' } = {}) {
  return rawRows.map((raw) => {
    const lastWorkingDay = normalizeDate(raw.lastWorkingDay);
    return {
      employeeName: String(raw.employeeName || '').trim(),
      month: normalizeMonth(raw.month) || lastWorkingDay.slice(0, 7),
      department: matchOption(raw.department, departmentOptions),
      departmentRaw: String(raw.department || '').trim(),
      reason: String(raw.reason || '').trim(),
      mode: String(raw.mode || '').trim(),
      location: String(raw.location || '').trim(),
      lastWorkingDay,
      exit: normalizeExit(raw.exit, defaultExit),
      include: true,
    };
  });
}