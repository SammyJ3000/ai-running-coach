// The knee rules: one test per loophole that used to get past enforce(), plus the plan shape check.
// No API key and no network.
//   npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { enforce, validatePlan, DEFAULT_PACE_S_PER_KM } = require(path.join(__dirname, '..', 'lib', 'rules'));

const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
// One 5 km run in 30 minutes (6:00 per km, max heart rate 180) ten days ago, and a comeback check in history.
const runs = [{ id: 'a', date: day(10), start: day(10) + 'T18:00:00Z', km: 5, secs: 1800, hr_max: 180 }];
const checkins = [{ date: day(8), pain: 1 }, { date: day(1), pain: 1 }];
const one = (session) => ({ weeks: [{ sessions: [{ date: day(-1), ...session }] }] });

test('a run given in minutes only is capped like one given in km', () => {
  const { plan, changes } = enforce(one({ type: 'easy', title: 'Easy run', minutes: 90, km: null }), runs, checkins);
  const [s] = plan.weeks[0].sessions;
  // 5 km longest + 10% = 5.5 km, at the runner's usual 6:00 per km = 33 minutes.
  assert.equal(s.minutes, 33);
  assert.equal(s.rule, 'ten-percent');
  assert.match(changes.join('\n'), /90 min → 33 min/);
});

test('with no recent runs, a minutes only run is capped at 3 km at the default pace', () => {
  const { plan } = enforce(one({ type: 'walk-run', title: 'Walk run', minutes: 60 }), [], checkins);
  assert.equal(plan.weeks[0].sessions[0].minutes, Math.floor((3 * DEFAULT_PACE_S_PER_KM) / 60));
});

test('minutes only runs build the cap week by week too', () => {
  const plan = { weeks: [{ sessions: [
    { date: day(-1), type: 'easy', title: 'Easy run', minutes: 33 },
    { date: day(-3), type: 'easy', title: 'Easy run', minutes: 90 },
  ] }] };
  const { plan: out } = enforce(plan, runs, checkins);
  // The first session counts as 5.5 km, so the second may be 6.05 km, which is 36 minutes at 6:00 per km.
  assert.equal(out.weeks[0].sessions[1].minutes, 36);
});

test('a hard run labelled cross training is checked as a run', () => {
  const { plan, changes } = enforce(one({ type: 'cross', title: 'Tempo run', km: 8, hr_cap: 175 }), runs, checkins);
  const [s] = plan.weeks[0].sessions;
  assert.equal(s.type, 'easy');
  assert.ok(s.km <= 5.5, 'distance cap not applied');
  assert.equal(s.hr_cap, Math.round(180 * 0.76));
  assert.match(changes.join('\n'), /labelled cross but it reads as a run/);
});

test('a hard session labelled rest, with no run in its title, is still checked as a run', () => {
  const { plan } = enforce(one({ type: 'rest', title: '5 x 1 km at threshold', km: 7 }), runs, checkins);
  assert.equal(plan.weeks[0].sessions[0].type, 'easy');
  assert.ok(plan.weeks[0].sessions[0].km <= 5.5);
});

test('real cross training and rest days are left alone', () => {
  const plan = { weeks: [{ sessions: [
    { date: day(-1), type: 'cross', title: 'Easy bike', minutes: 45, km: 20 },
    { date: day(-2), type: 'rest', title: 'Rest day, no running', minutes: null, km: null },
  ] }] };
  const before = JSON.stringify(plan);
  const { plan: out, changes } = enforce(plan, runs, checkins);
  assert.equal(JSON.stringify(out), before);
  assert.deepEqual(changes, []);
});

test('an unknown session type is checked as a run, or as cross training if it plainly is not running', () => {
  const plan = { weeks: [{ sessions: [
    { date: day(-1), type: 'hill-sprints', title: 'Hill sprints', km: 6 },
    { date: day(-3), type: 'cycling', title: 'Bike, 40 min', minutes: 40 },
  ] }] };
  const { plan: out } = enforce(plan, runs, checkins);
  const [hills, bike] = out.weeks[0].sessions;
  assert.equal(hills.type, 'easy');
  assert.ok(hills.km <= 5.5);
  assert.equal(bike.type, 'cross');
});

test('a run labelled as a walk is capped like a run', () => {
  const { plan } = enforce(one({ type: 'walk', title: 'Run 60 min', minutes: 60 }), runs, checkins);
  assert.equal(plan.weeks[0].sessions[0].minutes, 33);
});

test('a time trial in the comeback becomes an easy run', () => {
  const { plan } = enforce(one({ type: 'test', title: '5K time trial', km: 5, hr_cap: 137 }), runs, checkins);
  assert.equal(plan.weeks[0].sessions[0].type, 'easy');
});

test('a run without a heart rate cap is given one; a walk is not', () => {
  const plan = { weeks: [{ sessions: [
    { date: day(-1), type: 'easy', title: 'Easy run', km: 4 },
    { date: day(-2), type: 'walk', title: 'Brisk walk', minutes: 30 },
  ] }] };
  const { plan: out, changes } = enforce(plan, runs, checkins);
  const [run, walk] = out.weeks[0].sessions;
  assert.equal(run.hr_cap, Math.round(180 * 0.76));
  assert.equal(walk.hr_cap, undefined);
  assert.match(changes.join('\n'), /heart-rate cap added/);
});

test('validatePlan accepts a well formed plan', () => {
  assert.deepEqual(validatePlan(one({ type: 'easy', title: 'Easy run', km: 3, minutes: 20, hr_cap: 137 })), []);
});

test('validatePlan rejects malformed plans', () => {
  const bad = [
    null,
    'a plan',
    [],
    {},
    { weeks: [] },
    { weeks: [{}] },
    { weeks: [{ sessions: [null] }] },
    one({ type: 'easy', title: 'Easy run', date: undefined }),
    one({ type: 'easy', title: 'Easy run', date: 'tomorrow' }),
    one({ title: 'Easy run' }),
    one({ type: 'easy' }),
    one({ type: 'easy', title: 'Easy run', km: '8' }),
    one({ type: 'easy', title: 'Easy run', km: -1 }),
    one({ type: 'easy', title: 'Easy run', minutes: Infinity }),
    one({ type: 'easy', title: 'Easy run', hr_cap: 'high' }),
  ];
  for (const plan of bad) assert.ok(validatePlan(plan).length > 0, `accepted ${JSON.stringify(plan)}`);
});

test('enforce refuses a malformed plan instead of passing it through', () => {
  assert.throws(() => enforce({ weeks: [{ sessions: [{ date: day(-1), type: 'easy', title: 'Run', km: '20' }] }] }, runs, checkins), /invalid plan/);
  assert.throws(() => enforce({ sessions: [] }, runs, checkins), /invalid plan/);
});
