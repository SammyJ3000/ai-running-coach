// Timestamps from Apple Health and the iPhone Shortcut -> epoch milliseconds.
//
// The Shortcut sends ISO strings (with an offset), epoch ms, or Shortcuts' own date text with no zone, which is
// London wall time. ms() reads all of them.

const TZ = 'Europe/London';

// Shortcuts sends dates like "10 Nov 2026 at 02:13" or "10/11/2026, 02:13" with no zone: those are London wall time.
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function londonWall(y, mo, d, h, mi, s) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(guess)).map((x) => [x.type, Number(x.value)]));
  const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return guess - (shown - guess);
}
function ms(t) {
  if (typeof t === 'number') return t;
  if (typeof t !== 'string') return NaN;
  const s = t.trim();
  if (/\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/.test(s)) {
    return Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4'));
  }
  // iPhones set to the 12-hour clock send "2:08 pm" (sometimes with a narrow no-break space): honour the am/pm.
  const AP = '(?:[\\s\\u202f\\u00a0]*([ap])\\.?m\\.?)?';
  const h24 = (h, ap) => (!ap ? h : (h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0));
  let m = s.match(new RegExp('^(\\d{1,2}) ([A-Za-z]{3})[a-z]* (\\d{4})(?:,| at)? (\\d{1,2}):(\\d{2})(?::(\\d{2}))?' + AP, 'i'));
  if (m) return londonWall(+m[3], MONTHS[m[2].toLowerCase()], +m[1], h24(+m[4], m[7]), +m[5], +(m[6] || 0));
  m = s.match(new RegExp('^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4}),? (\\d{1,2}):(\\d{2})(?::(\\d{2}))?' + AP, 'i'));
  if (m) return londonWall(+m[3], +m[2] - 1, +m[1], h24(+m[4], m[7]), +m[5], +(m[6] || 0));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return londonWall(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return Date.parse(s);
}

module.exports = { ms };
