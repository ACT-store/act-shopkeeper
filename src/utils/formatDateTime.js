/**
 * Timezone-preserving datetime formatter.
 *
 * Timestamps stored by nowWithTz() carry the original UTC offset, e.g.:
 *   "2024-03-15T10:32:00+14:00"
 *
 * We extract the LOCAL time/date from the string itself (the part before the
 * +/- offset), so every device shows the time AS THE ENTERING USER saw it —
 * regardless of the viewing device's own timezone.
 *
 * If the timestamp is a plain UTC ISO (legacy data without offset, ending in
 * "Z" or with no offset), we fall back to the device's local interpretation
 * via Date() — same behaviour as before.
 */

/**
 * Parse the wall-clock parts directly from an ISO string that has a UTC offset.
 * Returns null if the string doesn't have the expected format.
 *
 * "2024-03-15T10:32:00+14:00" → { year:2024, month:3, day:15, hour:10, min:32 }
 */
function parseWallClock(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return null;
  // Match: YYYY-MM-DDTHH:MM[:SS][±HH:MM]  (offset required — not Z)
  const m = isoStr.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?([+-]\d{2}:\d{2})$/
  );
  if (!m) return null;
  return {
    year:  parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day:   parseInt(m[3], 10),
    hour:  parseInt(m[4], 10),
    min:   parseInt(m[5], 10),
    offset: m[6], // e.g. "+14:00"
  };
}

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * Format a timestamp string as "DD/MM/YYYY".
 * Preserves the original wall-clock date if a UTC offset is embedded.
 */
export function formatDate(raw) {
  if (!raw) return 'N/A';
  // Firestore Timestamp object
  if (raw && typeof raw === 'object' && raw.seconds) {
    const d = new Date(raw.seconds * 1000);
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
  }
  const wc = parseWallClock(raw);
  if (wc) return `${pad2(wc.day)}/${pad2(wc.month)}/${wc.year}`;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 'N/A';
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
}

/**
 * Format a timestamp string as "hh:MM AM/PM".
 * Preserves the original wall-clock time if a UTC offset is embedded.
 */
export function formatTime(raw) {
  if (!raw) return '—';
  if (raw && typeof raw === 'object' && raw.seconds) {
    const d = new Date(raw.seconds * 1000);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  const wc = parseWallClock(raw);
  if (wc) {
    const h12 = wc.hour % 12 || 12;
    const ampm = wc.hour < 12 ? 'AM' : 'PM';
    return `${pad2(h12)}:${pad2(wc.min)} ${ampm}`;
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Format a timestamp string as both date and time.
 * Returns { date: "DD/MM/YYYY", time: "hh:MM AM/PM" }
 */
export function formatDateTime(raw) {
  return { date: formatDate(raw), time: formatTime(raw) };
}

/**
 * Return a sortable numeric value from any timestamp string.
 * Handles both offset-aware ("2024-03-15T10:32:00+14:00") and plain ISO strings.
 * Offset-aware strings are converted to true UTC epoch for correct cross-timezone ordering.
 */
export function toSortKey(raw) {
  if (!raw) return 0;
  if (raw && typeof raw === 'object' && raw.seconds) return raw.seconds * 1000;
  const d = new Date(raw); // JS Date() correctly handles offset ISO strings
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
