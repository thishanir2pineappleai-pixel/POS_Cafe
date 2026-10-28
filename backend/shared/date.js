// Calendar-date helpers for Sales Management. Dates are 'YYYY-MM-DD' strings and order times are
// naive business-local 'YYYY-MM-DDTHH:mm:ss' strings (PENDING APPROVAL: time zone handling).
// ISO strings sort and compare correctly as plain strings.

// Returns the same 'YYYY-MM-DD' text when it is a real calendar date, otherwise null.
function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? value : null;
}

const dateOf = (placedAt) => placedAt.slice(0, 10);
const hourOf = (placedAt) => Number(placedAt.slice(11, 13));

// 0 -> "12:00 AM", 19 -> "7:00 PM"
const hourLabel = (hour) => `${((hour + 11) % 12) + 1}:00 ${hour % 24 < 12 ? 'AM' : 'PM'}`;

// '2026-03-21T12:55:00' -> "12:55 PM"
function timeLabel(placedAt) {
  const hour = hourOf(placedAt);
  return `${((hour + 11) % 12) + 1}:${placedAt.slice(14, 16)} ${hour < 12 ? 'AM' : 'PM'}`;
}

const inDateRange = (date, { from, to }) => (!from || date >= from) && (!to || date <= to);

const pad = (n) => String(n).padStart(2, '0');
// 'YYYY-MM-DD' of a millisecond timestamp in the server's local time (the business-local day).
const localDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (date, days) => {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};
// Monday of the week that contains `date`.
const weekStart = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -weekday);
};

// First and last day of the month that contains `date`.
const monthRange = (date) => {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
};

// 'HH:mm' (00:00-23:59) or null.
const parseTime = (value) => (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null);
const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
// 'YYYY-MM' (a real month) or null.
const parseMonth = (value) => (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null);
// 'YYYY-MM-DDTHH:mm:ss' of a millisecond timestamp in the server's local time, like the order times.
const localDateTime = (ms) => {
  const d = new Date(ms);
  return `${localDate(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const localMinutes = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// 'mon'..'sun' of a 'YYYY-MM-DD' date.
const weekdayOf = (date) => { const [y, m, d] = date.split('-').map(Number); return DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
// A shift runs from start (inclusive) to end (exclusive); when end is earlier than start it runs past midnight.
const shiftCovers = (start, end, minutes) => {
  const s = minutesOf(start);
  const e = minutesOf(end);
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
};
const previousMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
};

module.exports = {
  parseDateOnly, dateOf, hourOf, hourLabel, timeLabel, inDateRange, localDate, addDays, weekStart, monthRange,
  parseTime, minutesOf, parseMonth, localDateTime, localMinutes, weekdayOf, shiftCovers, previousMonth,
};
