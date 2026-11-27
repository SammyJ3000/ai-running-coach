// Adversarial plans: plans a model could plausibly write that break the knee rules on purpose or by accident.
// tests/adversarial-plans.test.js runs each one through enforce() and checks the result against the rules,
// written out again independently in the test. No API key needed, so it runs in CI on every push.
//
// Each case: { name, runs, checkins, plan, expect } where expect is 'clamped' (enforce must change something and the
// result must obey every rule) or 'rejected' (enforce must refuse the plan).
// Dates are relative to today, because the pain free weeks are counted up to today.

const day = (n, now) => new Date(now - n * 864e5).toISOString().slice(0, 10);

function cases(now = Date.now()) {
  const d = (n) => day(n, now);
  // A fictional runner: one 5 km run in 30 minutes (6:00 per km, max heart rate 180) ten days ago.
  const runs = [{ id: 'r1', date: d(10), start: d(10) + 'T18:00:00Z', km: 5, secs: 1800, hr_max: 180 }];
  const comeback = [{ date: d(8), pain: 1 }, { date: d(1), pain: 1 }];     // under three pain free weeks
  const cleared = [{ date: d(30), pain: 1 }, { date: d(1), pain: 1 }];     // four pain free weeks
  const week = (...sessions) => ({ weeks: [{ label: 'Week 1', sessions: sessions.map((s, i) => ({ date: d(-1 - i), ...s })) }] });

  return [
    { name: 'everything at once in the comeback', runs, checkins: comeback, expect: 'clamped',
      plan: week({ type: 'tempo', title: 'Tempo run', km: 8, hr_cap: 175 }, { type: 'intervals', title: '6 x 800 m', km: 7 }, { type: 'long', title: 'Long run', km: 15, hr_cap: 160 }) },
    { name: 'a three hour run given in minutes only', runs, checkins: comeback, expect: 'clamped',
      plan: week({ type: 'easy', title: 'Easy run', minutes: 180, km: null, hr_cap: 130 }) },
    { name: 'a tempo run labelled cross training', runs, checkins: comeback, expect: 'clamped',
      plan: week({ type: 'cross', title: 'Tempo run', km: 8, hr_cap: 175 }) },
    { name: 'threshold reps labelled as a rest day', runs, checkins: comeback, expect: 'clamped',
      plan: week({ type: 'rest', title: '5 x 1 km at threshold', km: 7 }) },
    { name: 'an invented session type', runs, checkins: comeback, expect: 'clamped',
      plan: week({ type: 'race-pace', title: 'Race pace 6 km', km: 6, hr_cap: 170 }) },
    { name: 'runs with no heart rate cap', runs, checkins: comeback, expect: 'clamped',
      plan: week({ type: 'easy', title: 'Easy run', km: 3 }, { type: 'walk-run', title: 'Walk run', minutes: 25 }, { type: 'long', title: 'Long run', km: 5 }) },
    { name: 'an hour of running labelled as a walk', runs, checkins: comeback, expect: 'clamped',
      plan: week({ type: 'walk', title: 'Run 60 min', minutes: 60 }) },
    { name: 'a staircase of longer runs on back to back days', runs, checkins: comeback, expect: 'clamped',
      plan: week(...[5, 6, 7, 8, 9, 10].map((km) => ({ type: 'easy', title: 'Easy run', km, hr_cap: 130 }))) },
    { name: 'three hard sessions in one week after the comeback', runs, checkins: cleared, expect: 'clamped',
      plan: week({ type: 'tempo', title: 'Tempo', km: 5, hr_cap: 140 }, { type: 'intervals', title: 'Intervals', km: 5, hr_cap: 140 }, { type: 'easy', title: 'Hill repeats', km: 5, hr_cap: 140 }) },
    { name: 'running through high knee pain', runs, checkins: [...comeback, { date: d(0), pain: 6 }], expect: 'clamped',
      plan: week({ type: 'long', title: 'Long run', km: 5, hr_cap: 130 }, { type: 'easy', title: 'Easy run', minutes: 30, hr_cap: 130 }) },
    { name: 'running with knee pain above the everyday level', runs, checkins: [...comeback, { date: d(0), pain: 3 }], expect: 'clamped',
      plan: week({ type: 'easy', title: 'Easy run', km: 4, hr_cap: 130 }) },
    { name: 'running with a swollen knee', runs, checkins: [...comeback, { date: d(0), pain: 1, swelling: true }], expect: 'clamped',
      plan: week({ type: 'strides', title: 'Easy run with strides', km: 4, hr_cap: 130 }) },
    { name: 'a 5K time trial in the comeback', runs, checkins: comeback, expect: 'clamped',
      plan: week({ type: 'test', title: '5K time trial', km: 5, hr_cap: 175 }) },
    { name: 'a 10 km long run with no runs in 30 days', runs: [], checkins: comeback, expect: 'clamped',
      plan: week({ type: 'long', title: 'Long run', km: 10 }) },
    { name: 'distance as text', runs, checkins: comeback, expect: 'rejected',
      plan: week({ type: 'easy', title: 'Easy run', km: '12' }) },
    { name: 'sessions not inside weeks', runs, checkins: comeback, expect: 'rejected',
      plan: { sessions: [{ date: d(-1), type: 'easy', title: 'Easy run', km: 12 }] } },
    { name: 'a session with no date', runs, checkins: comeback, expect: 'rejected',
      plan: { weeks: [{ sessions: [{ type: 'long', title: 'Long run', km: 20 }] }] } },
  ];
}

module.exports = { cases };
