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

// Strides are NOT quality: they count as part of easy running (a design decision).
const QUALITY = /interval|tempo|threshold|speed|hill|fartlek|race|time.?trial/i;

// Clamp a plan to the rules. Returns { plan, changes } where changes says what was cut and why (shown to the runner).
function enforce(plan, runs, checkins) {
  const changes = [];
  const knee = kneeStatus(checkins);
  const painFreeWeeks = weeksPainFree(checkins);
  const maxHr = Math.max(0, ...runs.map((r) => r.hr_max || 0)) || null;
  const z = maxHr ? hrZones(maxHr) : null;
  const hrCap = z ? (painFreeWeeks < COMEBACK_WEEKS ? z.recovery_cap : z.easy_cap) : null;   // 76% of max in the comeback, 79% after
  const pool = [...runs];   // real runs plus the plan's own earlier sessions, so the cap builds week by week
  for (const week of plan.weeks || []) {
    let quality = 0;
    for (const s of week.sessions || []) {
      if (s.type === 'rest' || s.type === 'cross') continue;
      const base = longest30(pool, s.date);
      const cap = base > 0 ? base * GROWTH : START_KM;
      if (knee.level === 'stop' || knee.level === 'walk') {
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
      }
      if (s.km && cap > 0 && s.km > cap + 0.05) {
        changes.push(`${s.date}: ${s.km} km → ${cap.toFixed(1)} km (${base > 0 ? 'no run more than 10% longer than your longest in 30 days' : 'no recent runs: 3 km at most'})`);
        s.km = Math.round(cap * 10) / 10; s.rule = 'ten-percent';
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

module.exports = { enforce, kneeStatus, longest30, weeksPainFree, BASELINE_PAIN };
