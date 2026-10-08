/**
 * Robust date formatting for ticket timestamps.
 *
 * Root cause it defends against: some seeded rows carry a malformed ISO string
 * with a DOUBLE timezone designator, e.g. `2026-06-17T16:35:31+00:00Z`
 * (offset + trailing Z). `new Date()` rejects that as Invalid Date, and a
 * try/catch can't help because the Date constructor never throws — it just
 * produces an invalid Date whose toLocaleString() prints "Invalid Date".
 * (Manually created tickets are clean `...Z`, which is why they rendered fine.)
 *
 * Fix: normalize `([+-]HH:?MM)Z$` -> `$1` before parsing, validate with
 * isNaN, and render an em dash for null/undefined/garbage instead of
 * "Invalid Date". No hard-coded dates anywhere.
 */
export function parseTicketDate(value) {
  if (value == null || value === '') return null;
  let s = String(value).trim();
  // Collapse a doubled timezone designator: "+00:00Z" -> "+00:00" (same for +0000Z).
  s = s.replace(/([+-]\d{2}:?\d{2})Z$/, '$1');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value) {
  const d = parseTicketDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(value) {
  const d = parseTicketDate(value);
  if (!d) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
