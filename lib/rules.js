// The knee rules. Claude plans the training; these rules check every plan before the runner sees it, so a plan can
// never break them however the model words it. Sources:
//   - NHS return-to-running: walk briskly 30 min pain-free first, walk-run on alternate days, don't run through knee pain,
//     see a GP/physio if pain lasts more than ~48 h or the joint swells.
//   - BJSM 2025 (5,205 runners): risk rose when a single run was more than 10% longer than the longest run in the last 30 days.
//   - Design decisions: knee pain above the runner's everyday baseline (BASELINE_PAIN) = no run that day (walk only);
//     comeback easy runs capped at 76% of max HR until 3 pain-free weeks, then 79%; strides count as easy running.
// Not medical advice: the coach is cautious by design.

const DAY = 864e5;
const { hrZones } = require('./paces');
const BASELINE_PAIN = 2;   // the runner's everyday knee level (example default); anything above it the next morning means no run that day
const STOP_PAIN = 5;       // this much pain or more: no running until it settles
const GROWTH = 1.1;        // no run more than 10% longer than the longest in the last 30 days
const START_KM = 3;        // with no runs in 30 days, start from this distance at most
const COMEBACK_WEEKS = 3;  // pain free weeks before speed work and the higher heart rate cap
const DEFAULT_PACE_S_PER_KM = 540;   // 9:00 per km, about an early walk run session: turns the distance cap into minutes when there are no runs to take a pace from
const PACE_RUNS = 10;      // the runner's usual pace is the median of this many most recent runs

// Every session type the plan prompt allows. Anything else is checked as a run (or as cross training if it plainly is not running).
const SESSION_TYPES = ['easy', 'walk-run', 'long', 'strides', 'tempo', 'intervals', 'test', 'walk', 'rest', 'cross'];
const OFF_TYPES = ['rest', 'cross'];   // not running, so the running rules skip them, unless they read as a run

function longest30(runs, onDate) {
  const t = Date.parse(onDate + 'T23:59:59Z');   // whole day, so an evening run on the plan date counts
  const recent = runs.filter((r) => { const x = Date.parse(r.start); return x <= t && x >= t - 30 * DAY; });
  return recent.reduce((m, r) => Math.max(m, r.km || 0), 0);
}

// What the latest knee check-in allows. pain is 0-10 (during or after), swelling yes/no, lasted48 = still sore 48 h later.
function kneeStatus(checkins) {
  const last = [...(checkins || [])].sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!last) return { level: 'unknown', note: 'No knee check-in yet.' };
  if (last.swelling || last.lasted48 || last.pain >= STOP_PAIN) return { level: 'stop', note: 'Pain, swelling or soreness that lasted 48 h: no running until it settles. If it keeps happening, see a physio.', last };
  if (last.pain > BASELINE_PAIN) return { level: 'walk', note: 'Knee above its everyday level: no running today, walk only. Check again tomorrow morning.', last };
  return { level: 'ok', note: 'Knee fine.', last };
}

// Strides are NOT quality: they count as part of easy running (a design decision). Tests and time trials are quality.
const QUALITY = /interval|tempo|threshold|speed|hill|fartlek|race|time.?trial|\btest\b/i;
// How a title reads. "No running" is not a run; a bike, swim or gym session is not running even with km on it.
const RUN_WORDS = /\b(run|runs|running|jog|jogging|strides?)\b/i;
const NOT_RUN_WORDS = /\b(bike|biking|cycl\w*|spin\w*|swim\w*|row\w*|elliptical|cross.?train\w*|yoga|pilates|strength|gym|mobility|stretch\w*|rest|walk\w*)\b/i;
function readsAsRun(s) {
  const title = String(s.title || '').replace(/\bno\s+(running|runs?|jogging)\b/gi, '');
  if (RUN_WORDS.test(title)) return true;
  return !NOT_RUN_WORDS.test(title) && (s.km > 0 || QUALITY.test(title));
}

// The runner's usual pace in seconds per km: the median of the most recent runs, or DEFAULT_PACE_S_PER_KM without any.
function usualPace(runs) {
  const paces = [...runs].filter((r) => r.km > 0 && r.secs > 0).sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .slice(-PACE_RUNS).map((r) => r.secs / r.km).sort((a, b) => a - b);
  if (!paces.length) return DEFAULT_PACE_S_PER_KM;
  const m = paces.length >> 1;
  return paces.length % 2 ? paces[m] : (paces[m - 1] + paces[m]) / 2;
}
const mmss = (secs) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;

// Shape check for the plan the model wrote. Returns a list of problems; an empty list means the plan can be enforced.
function validatePlan(plan) {
  const problems = [];
  const optNum = (v) => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return ['the plan is not an object'];
  if (!Array.isArray(plan.weeks) || !plan.weeks.length) return ['the plan has no weeks list'];
  plan.weeks.forEach((w, i) => {
    if (!w || typeof w !== 'object' || !Array.isArray(w.sessions)) { problems.push(`week ${i + 1} has no sessions list`); return; }
    w.sessions.forEach((s, j) => {
      const at = `week ${i + 1} session ${j + 1}`;
      if (!s || typeof s !== 'object' || Array.isArray(s)) { problems.push(`${at} is not an object`); return; }
      if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || Number.isNaN(Date.parse(s.date))) problems.push(`${at}: date must be YYYY-MM-DD`);
      if (typeof s.type !== 'string' || !s.type.trim()) problems.push(`${at}: type must be a string`);
      if (typeof s.title !== 'string' || !s.title.trim()) problems.push(`${at}: title must be a string`);
      for (const k of ['km', 'minutes', 'hr_cap']) if (!optNum(s[k])) problems.push(`${at}: ${k} must be a number of 0 or more, or null`);
    });
  });
  return problems;
}

// Clamp a plan to the rules. Returns { plan, changes } where changes says what was cut and why (shown to the runner).
// Throws if the plan fails validatePlan, so a malformed plan can never slip past the rules.
function enforce(plan, runs, checkins) {
  const problems = validatePlan(plan);
  if (problems.length) throw new Error('invalid plan: ' + problems.join('; '));
  const changes = [];
  const knee = kneeStatus(checkins);
  const painFreeWeeks = weeksPainFree(checkins);
  const maxHr = Math.max(0, ...runs.map((r) => r.hr_max || 0)) || null;
  const z = maxHr ? hrZones(maxHr) : null;
  const hrCap = z ? (painFreeWeeks < COMEBACK_WEEKS ? z.recovery_cap : z.easy_cap) : null;   // 76% of max in the comeback, 79% after
  const pace = usualPace(runs);
  const pool = [...runs];   // real runs plus the plan's own earlier sessions, so the cap builds week by week
  const toEasyRun = (s, why) => {
    changes.push(`${s.date}: ${s.title} → easy run (${why})`);
    Object.assign(s, { type: 'easy', title: 'Easy run', structure: 'Conversational pace the whole way.', rule: 'type' });
  };
  for (const week of plan.weeks) {
    let quality = 0;
    for (const s of week.sessions) {
      // Session types: only the listed ones; rest and cross are only skipped when they are plainly not a run.
      if (!SESSION_TYPES.includes(s.type)) {
        const as = readsAsRun(s) || !NOT_RUN_WORDS.test(s.title) ? null : /\bwalk/i.test(s.title) ? 'walk' : /\brest\b/i.test(s.title) ? 'rest' : 'cross';
        if (as) {
          changes.push(`${s.date}: ${s.title} → ${as === 'cross' ? 'cross training' : as} (unknown session type "${s.type}")`);
          s.type = as; s.rule = 'type';
        } else toEasyRun(s, `unknown session type "${s.type}"`);
      } else if (OFF_TYPES.includes(s.type) && readsAsRun(s)) toEasyRun(s, `labelled ${s.type} but it reads as a run`);
      if (OFF_TYPES.includes(s.type)) continue;
      const walking = s.type === 'walk' && !readsAsRun(s);
      const base = longest30(pool, s.date);
      const cap = base > 0 ? base * GROWTH : START_KM;
      if (knee.level === 'stop' || knee.level === 'walk') {
        // Until the next check in and a new plan, every running session in the plan is a walk.
        changes.push(`${s.date}: ${s.title} → walk only (knee check-in)`);
        Object.assign(s, { type: 'walk', title: 'Easy walk', km: null, minutes: Math.min(s.minutes || 30, 30), structure: 'Brisk walk, no running. Check the knee tomorrow.', rule: 'knee' });
        continue;
      }
      if (QUALITY.test(s.type + ' ' + s.title)) {
        quality++;
        if (painFreeWeeks < COMEBACK_WEEKS || quality > 1) {
          changes.push(`${s.date}: ${s.title} → easy run (${painFreeWeeks < COMEBACK_WEEKS ? 'speed work waits for 3 pain-free weeks' : 'one hard session a week'})`);
          Object.assign(s, { type: 'easy', title: 'Easy run', structure: 'Conversational pace the whole way.', rule: 'quality' });
        }
      }
      if (hrCap && s.hr_cap != null && s.hr_cap > hrCap) {
        changes.push(`${s.date}: heart-rate cap ${s.hr_cap} → ${hrCap} bpm (${painFreeWeeks < COMEBACK_WEEKS ? 'comeback easy runs stay under 76% of max' : 'easy runs stay under 79% of max'})`);
        s.hr_cap = hrCap; s.rule = s.rule || 'hr-cap';
      } else if (hrCap && s.hr_cap == null && !walking) {
        changes.push(`${s.date}: heart-rate cap added, ${hrCap} bpm (${painFreeWeeks < COMEBACK_WEEKS ? 'comeback runs stay under 76% of max' : 'easy runs stay under 79% of max'})`);
        s.hr_cap = hrCap; s.rule = s.rule || 'hr-cap';
      }
      if (s.km && cap > 0 && s.km > cap + 0.05) {
        changes.push(`${s.date}: ${s.km} km → ${cap.toFixed(1)} km (${base > 0 ? 'no run more than 10% longer than your longest in 30 days' : 'no recent runs: 3 km at most'})`);
        s.km = Math.round(cap * 10) / 10; s.rule = 'ten-percent';
      }
      // A run given in minutes only: the same distance cap, turned into minutes at the runner's usual pace.
      if (!s.km && s.minutes && !walking) {
        const maxMin = Math.floor((cap * pace) / 60);
        if (s.minutes > maxMin) {
          changes.push(`${s.date}: ${s.minutes} min → ${maxMin} min (${base > 0 ? 'no run more than 10% longer than your longest in 30 days' : 'no recent runs: 3 km at most'}, at your usual ${mmss(pace)} per km)`);
          s.minutes = maxMin; s.rule = 'ten-percent';
        }
        pool.push({ start: s.date + 'T12:00:00Z', km: Math.round(((s.minutes * 60) / pace) * 100) / 100 });
      }
      if (s.km) pool.push({ start: s.date + 'T12:00:00Z', km: s.km });
    }
  }
  return { plan, changes, knee };
}

function weeksPainFree(checkins) {
  const sorted = [...(checkins || [])].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) return 0;
  const bad = sorted.find((c) => c.pain > BASELINE_PAIN || c.swelling || c.lasted48);
  const since = bad ? Date.parse(bad.date) : Date.parse(sorted[sorted.length - 1].date);
  return Math.floor((Date.now() - since) / (7 * DAY));
}

module.exports = { enforce, validatePlan, kneeStatus, longest30, weeksPainFree, usualPace, SESSION_TYPES, BASELINE_PAIN, DEFAULT_PACE_S_PER_KM };
