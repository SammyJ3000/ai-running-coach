// Apple Health samples -> runs.
//
// Input (from the iPhone Shortcut, every field optional; times are ISO strings, epoch ms, or Shortcuts' London wall time):
//   workouts: [{ start, end, type, km, kcal }]          a watch workout, if the Shortcut can send them
//   dist:     [{ t, end, v }]                            Walking + Running Distance samples, v in km (or m if > 50)
//   hr:       [{ t, v }]                                 heart-rate samples, bpm
//   steps:    [{ t, end, v }]                            step samples, for cadence
//
// A run is either a running workout, or a stretch of distance samples with no gap over 3 minutes that covers at least 1 km
// at between 3:00 and 11:00 per km (11:00 keeps walk-run sessions in). Everything is worked out from the samples inside
// that window, so a run never needs typing in.

const { ms } = require('./healthtime');

const GAP = 3 * 60e3;              // a longer gap between distance samples ends the run
const MIN_RUN_KM = 1;
const FASTEST_PACE = 180, SLOWEST_PACE = 660;   // seconds per km: 3:00 to 11:00 (11:00 keeps walk run sessions in)
const SAME_RUN_MS = 120e3;         // two copies starting within 2 minutes are the same run
const FIVE_K_MIN_KM = 4.8;         // a run at least this long gives a 5K estimate from its average pace

// 5K time from a run's average pace, or null if the run is too short to say.
const est5k = (km, secs) => (km >= FIVE_K_MIN_KM && secs > 0 ? Math.round((secs / km) * 5) : null);

function km(v) { const x = Number(v); return x > 50 ? x / 1000 : x; }   // Shortcuts may send metres
function inWindow(list, a, b) { return (list || []).filter((s) => { const t = ms(s.t); return t >= a && t <= b; }); }

function stats(a, b, hr, steps) {
  const h = inWindow(hr, a, b).map((s) => Number(s.v)).filter((v) => v > 40 && v < 230);
  const st = (steps || []).filter((s) => { const t = ms(s.t), e = ms(s.end || s.t); return t >= a - 30e3 && e <= b + 30e3; });
  const stepCount = st.reduce((n, s) => n + Number(s.v || 0), 0);
  const mins = (b - a) / 60e3;
  return {
    hr_avg: h.length ? Math.round(h.reduce((x, y) => x + y, 0) / h.length) : null,
    hr_max: h.length ? Math.max(...h) : null,
    hr_series: inWindow(hr, a, b).map((s) => [Math.round((ms(s.t) - a) / 1000), Number(s.v)]),
    cadence: stepCount > 200 && mins > 5 ? Math.round(stepCount / mins) : null,
  };
}

function shape(a, b, dist, extra) {
  const secs = Math.round((b - a) / 1000);
  const pace = dist > 0 ? Math.round(secs / dist) : null;
  return {
    id: new Date(a).toISOString(),
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(a)),
    start: new Date(a).toISOString(), end: new Date(b).toISOString(),
    km: Math.round(dist * 100) / 100, secs, pace_s_per_km: pace,
    est_5k_secs: dist >= FIVE_K_MIN_KM && pace ? Math.round(pace * 5) : null,
    ...extra,
  };
}

function detectRuns(s) {
  const runs = [];
  for (const w of s.workouts || []) {
    if (!/run/i.test(w.type || '')) continue;
    const a = ms(w.start), b = ms(w.end);
    if (!(b > a)) continue;
    const d = w.km != null ? km(w.km) : inWindow(s.dist, a, b).reduce((n, x) => n + km(x.v), 0);
    runs.push(shape(a, b, d, { source: 'workout', ...stats(a, b, s.hr, s.steps) }));
  }
  // Distance stretches not already covered by a workout.
  const taken = (t) => runs.some((r) => t >= ms(r.start) - 60e3 && t <= ms(r.end) + 60e3);
  const d = (s.dist || []).map((x) => ({ a: ms(x.t), b: ms(x.end || x.t), v: km(x.v) })).filter((x) => x.a && x.v > 0 && !taken(x.a)).sort((x, y) => x.a - y.a);
  let g = [];
  const flush = () => {
    if (!g.length) return;
    const a = g[0].a, b = Math.max(...g.map((x) => x.b)), dist = g.reduce((n, x) => n + x.v, 0);
    const pace = (b - a) / 1000 / dist;
    if (dist >= MIN_RUN_KM && pace >= FASTEST_PACE && pace <= SLOWEST_PACE) runs.push(shape(a, b, dist, { source: 'distance', ...stats(a, b, s.hr, s.steps) }));
    g = [];
  };
  for (const x of d) { if (g.length && x.a - g[g.length - 1].b > GAP) flush(); g.push(x); }
  flush();
  return runs.sort((x, y) => x.start.localeCompare(y.start));
}

// New runs win over old copies of the same run (same start within 2 minutes).
function mergeRuns(old, fresh) {
  const out = [...old];
  for (const r of fresh) {
    const i = out.findIndex((o) => Math.abs(ms(o.start) - ms(r.start)) < SAME_RUN_MS);
    // A run already in the app (often from a watch screenshot, with splits and the watch's own 5K time) is richer than
    // what Apple Health sends again later, so the new copy only fills fields that are still empty.
    if (i >= 0) { const o = out[i]; const fill = Object.fromEntries(Object.entries(r).filter(([k, v]) => v != null && (o[k] == null || (Array.isArray(o[k]) && !o[k].length)))); out[i] = { ...o, ...fill }; } else out.push(r);
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}

module.exports = { detectRuns, mergeRuns, est5k, FIVE_K_MIN_KM };
