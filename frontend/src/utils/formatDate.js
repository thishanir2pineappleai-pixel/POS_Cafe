// Date helpers for the Sales module. Dates are plain local Date objects; ISO strings are yyyy-mm-dd.
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const isSameDay = (a, b) => Boolean(a && b) && toISO(a) === toISO(b);

export const formatLong = (d) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; // 21 Mar 2026
export const formatDots = (d) => `${pad(d.getDate())}.${MONTHS[d.getMonth()]}.${d.getFullYear()}`; // 01.May.2026
export const formatSlash = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; // 24/03/2026

// Parses dd/mm/yyyy; returns null when the text is not a real date.
export function parseSlash(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]) ? d : null;
}
