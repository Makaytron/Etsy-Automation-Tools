// Dates, sizes and numbers as Settings › General › Date and number format says.

export const DAY_MS = 24 * 60 * 60 * 1000;

function zone(format) {
  return format?.timezone && format.timezone !== 'browser' ? format.timezone : undefined;
}

/** A date (and time) in the chosen style: auto follows the interface language. */
export function formatDate(ms, format = {}, language = 'en', { time = false } = {}) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const timeZone = zone(format);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  const clock = time ? ` ${parts.hour}:${parts.minute}` : '';
  switch (format?.date) {
    case 'dd.mm.yyyy': return `${parts.day}.${parts.month}.${parts.year}${clock}`;
    case 'mm/dd/yyyy': return `${parts.month}/${parts.day}/${parts.year}${clock}`;
    case 'yyyy-mm-dd': return `${parts.year}-${parts.month}-${parts.day}${clock}`;
    case 'd-mmm-y': return new Intl.DateTimeFormat(language, { timeZone, day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(d);
    default: return new Intl.DateTimeFormat(language, { timeZone, dateStyle: 'medium', ...(time ? { timeStyle: 'short' } : {}) }).format(d);
  }
}

/** A number with the chosen separators: auto follows the interface language. */
export function formatNumber(value, format = {}, language = 'en', options = {}) {
  const locale = format?.number === 'dot' ? 'de-DE' : format?.number === 'comma' ? 'en-US' : language;
  try { return new Intl.NumberFormat(locale, options).format(value); } catch { return String(value); }
}

/** "1,2 MB", "86 KB" in the interface language. */
export function formatBytes(bytes, language = 'en') {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024 * 1024) return `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(Math.max(n ? 1 : 0, n / 1024))} KB`;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(n / (1024 * 1024))} MB`;
}

