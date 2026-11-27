// Formatting for times, dates and distances, and reading the splits a run arrives with. Plain functions, no React.
/* exported dayName, dayNum, inDays, iso, kmFmt, kmLabel, mmss, pace, splitSecs, splitText, t */

const t = (s) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const pace = (s) => (s ? `${t(s)}/km` : '–');
const iso = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const dayName = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
const dayNum = (d) => new Date(d + 'T12:00:00').getDate();
const mmss = (x) => t(Math.round(x));
const daysTo = (d) => Math.round((new Date(d + 'T12:00:00') - new Date(iso() + 'T12:00:00')) / 864e5);
const inDays = (d) => { const n = daysTo(d); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; };
const kmLabel = (k) => (Number.isInteger(k) ? k : Math.round(k * 10) / 10);
const kmFmt = (k) => (x) => (Number.isInteger(kmLabel(k)) ? String(Math.round(x)) : x.toFixed(1));

// A split can arrive as seconds, a "5:41" string, or an object from the screenshot reader.
const splitSecs = (run) => (Array.isArray(run.splits) ? run.splits : []).map((x) => (typeof x === 'number' ? x : x && x.secs)).filter((x) => typeof x === 'number');
const splitText = (s) => (typeof s === 'number' ? t(s) : typeof s === 'string' ? s : s && (s.pace || (s.pace_s_per_km != null ? t(s.pace_s_per_km) : s.secs != null ? t(s.secs) : s.time)) || '–');
