// The maths a coach does with a calculator, so the AI never guesses it.
// Fitness score (VDOT) from a race result, training paces from that score, race predictions, and heart rate zones.
// Formulas: Daniels & Gilbert (1979) oxygen cost and time-to-exhaustion equations, as used in Daniels' Running Formula.
// Pace bands are % of VO2max as commonly quoted for Daniels' training intensities. Heart rate zones are % of max HR.

const { FIVE_K_MIN_KM } = require('./runs');

const DAY = 864e5;
const RECENT_DAYS = 60;      // runs older than this don't set the fitness score
const VDOT_LIFT_DAYS = 21;   // the score goes up at most once every 3 weeks

const vo2 = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v;                 // v in metres per minute -> ml/kg/min
const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t in minutes
const speedFor = (vo2Target) => { const a = 0.000104, b = 0.182258, c = -4.6 - vo2Target; return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); }; // m/min

// VDOT from a race: metres and seconds.
function vdot(metres, secs) { const t = secs / 60; return vo2(metres / t) / pctMax(t); }

// Seconds per km at a given % of VDOT.
const paceAt = (v, pct) => 60000 / speedFor(v * pct);

// Predicted race time (seconds) for a distance at a VDOT: solve vdot(d, t) = v by bisection.
function predict(v, metres) {
  let lo = 60, hi = 60 * 60 * 10;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (vdot(metres, mid) > v) lo = mid; else hi = mid; }
  return Math.round((lo + hi) / 2);
}

const BANDS = {
  easy:      { pct: [0.62, 0.70], what: 'Easy and long runs. You can talk in full sentences.' },
  marathon:  { pct: [0.80, 0.80], what: 'Steady. Not needed for a 5K block, shown for reference.' },
  threshold: { pct: [0.86, 0.88], what: 'Comfortably hard, about an hour race pace. Tempo runs and cruise intervals.' },
  interval:  { pct: [0.975, 1.0], what: 'Hard, about 3K to 5K race pace. Reps of 3 to 5 minutes.' },
  repetition:{ pct: [1.05, 1.10], what: 'Fast and relaxed. Short reps of 200 to 400 m with full recovery. Form and speed.' },
};

function trainingPaces(v) {
  const out = {};
  for (const [k, b] of Object.entries(BANDS)) {
    const fast = Math.round(paceAt(v, b.pct[1])), slow = Math.round(paceAt(v, b.pct[0]));
    out[k] = { fast_s_per_km: fast, slow_s_per_km: slow, what: b.what };
  }
  return out;
}

// Heart rate zones from max HR (no resting HR yet). Easy stays under ~79% of max (Daniels' E ceiling).
// recovery_cap = 76% of max (a common recovery-run ceiling): the coach's easy cap while the knee recovers.
function hrZones(max) {
  const z = (a, b) => [Math.round(max * a), Math.round(max * b)];
  return { max, easy: z(0.65, 0.79), steady: z(0.80, 0.87), threshold: z(0.88, 0.92), interval: z(0.95, 1.0), easy_cap: Math.round(max * 0.79), recovery_cap: Math.round(max * 0.76) };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// Everything the coach needs, from the runs and the goal. Uses the best 5K-ish run in the last RECENT_DAYS days.
function numbers(runs, goal, today) {
  const cutoff = new Date(new Date(today) - RECENT_DAYS * DAY).toISOString().slice(0, 10);
  const recent = runs.filter((r) => r.date >= cutoff && r.km >= 3);
  if (!recent.length) return null;
  const scored = recent.map((r) => ({ r, v: r.est_5k_secs && r.km >= FIVE_K_MIN_KM ? vdot(5000, r.est_5k_secs) : vdot(r.km * 1000, r.secs) }));
  // Raise training VDOT no more often than every 3rd week (a design decision). Walk the runs in date order;
  // a better run only lifts the score if the last lift was VDOT_LIFT_DAYS or more earlier, otherwise it waits for the next qualifying run.
  const inOrder = [...scored].sort((a, b) => a.r.date.localeCompare(b.r.date));
  let best = inOrder[0], liftedOn = inOrder[0].r.date, held = null;
  for (const s of inOrder.slice(1)) {
    if (s.v <= best.v) continue;
    if ((Date.parse(s.r.date) - Date.parse(liftedOn)) / DAY >= VDOT_LIFT_DAYS) { best = s; liftedOn = s.r.date; held = null; }
    else held = s;
  }
  const v = Math.round(best.v * 10) / 10;
  const goalV = goal && goal.pb_secs ? Math.round(vdot(5000, goal.pb_secs) * 10) / 10 : null;
  const maxHr = Math.max(0, ...runs.map((r) => r.hr_max || 0)) || null;
  const paces = trainingPaces(v);
  return {
    based_on: `${best.r.date} run, ${best.r.km} km${best.r.est_5k_secs ? `, 5K in ${fmt(best.r.est_5k_secs)}` : ''}`,
    vdot: v,
    vdot_held: held ? `A ${held.r.date} run scored ${Math.round(held.v * 10) / 10}, but paces only go up every 3 weeks (Daniels). It counts from ${new Date(Date.parse(liftedOn) + VDOT_LIFT_DAYS * DAY).toISOString().slice(0, 10)} if you repeat it.` : null,
    goal_vdot: goalV,
    vdot_gap: goalV ? Math.round((goalV - v) * 10) / 10 : null,
    predicted: { '5k': fmt(predict(v, 5000)), '10k': fmt(predict(v, 10000)) },
    paces: Object.fromEntries(Object.entries(paces).map(([k, p]) => [k, { range: `${fmt(p.fast_s_per_km)}–${fmt(p.slow_s_per_km)}/km`, ...p }])),
    hr: maxHr ? hrZones(maxHr) : null,
    note: 'Calculated, not estimated. Use these exact paces and zones. Easy is a ceiling on effort, so slower is always fine when coming back from injury.',
  };
}

module.exports = { vdot, predict, trainingPaces, hrZones, numbers, fmt };
