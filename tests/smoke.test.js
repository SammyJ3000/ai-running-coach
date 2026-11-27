// Offline smoke tests: the knee rules, the pace maths, run detection and GET /api/coach.
// No API key and no network. The store points at a temp folder, so nothing is written into the repo.
//   npm test
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const R = path.join(__dirname, '..');
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-store-'));
process.env.STORE_DIR = STORE;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
after(() => fs.rmSync(STORE, { recursive: true, force: true }));

const { enforce, kneeStatus, longest30 } = require(path.join(R, 'lib', 'rules'));
const { numbers } = require(path.join(R, 'lib', 'paces'));
const { detectRuns, mergeRuns } = require(path.join(R, 'lib', 'runs'));

const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const copy = (x) => JSON.parse(JSON.stringify(x));
// A minimal stand in for Vercel's response object.
const fakeRes = () => ({ setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
const runs = [{ id: 'a', date: day(10), start: day(10) + 'T18:00:00Z', km: 5, secs: 1860, est_5k_secs: 1860, hr_max: 180 }];
// A plan that breaks every rule.
const plan = { weeks: [{ sessions: [
  { date: day(-1), type: 'tempo', title: 'Tempo run', km: 8, hr_cap: 170 },
  { date: day(-3), type: 'intervals', title: 'Intervals', km: 5 },
] }] };

test('comeback: quality removed, 10% distance cap and 76% heart rate cap applied', () => {
  // First check in 8 days ago, so under 3 pain free weeks.
  const { plan: out } = enforce(copy(plan), runs, [{ date: day(8), pain: 1 }, { date: day(1), pain: 1 }]);
  const [first] = out.weeks[0].sessions;
  assert.ok(out.weeks[0].sessions.every((s) => s.type === 'easy'), 'quality not removed');
  assert.ok(first.km <= 5.5, '10% cap not applied');
  assert.equal(first.hr_cap, Math.round(180 * 0.76), 'hr cap not clamped');
});

test('after 4 pain free weeks: one quality session a week, heart rate cap 79%', () => {
  const { plan: out } = enforce(copy(plan), runs, [{ date: day(30), pain: 1 }, { date: day(1), pain: 1 }]);
  const [first, second] = out.weeks[0].sessions;
  assert.equal(first.type, 'tempo');
  assert.equal(second.type, 'easy');
  assert.equal(first.hr_cap, Math.round(180 * 0.79));
});

test('knee check in: high pain stops running, pain above baseline means walk only', () => {
  const bad = enforce(copy(plan), runs, [{ date: day(0), pain: 6 }]);
  assert.equal(bad.knee.level, 'stop');
  assert.ok(bad.plan.weeks[0].sessions.every((s) => s.type === 'walk'), 'knee stop not applied');
  assert.equal(kneeStatus([{ date: day(0), pain: 3 }]).level, 'walk');
});

test('longest30 counts an evening run on the plan date', () => {
  assert.equal(longest30([{ start: day(0) + 'T19:30:00Z', km: 4 }], day(0)), 4);
});

test('numbers: VDOT and heart rate zones from the runs', () => {
  const n = numbers(runs, { pb_secs: 1470 }, day(0));
  assert.ok(n && n.vdot > 0);
  assert.equal(n.hr.recovery_cap, 137);
});

test('detectRuns finds one run in raw distance samples, and mergeRuns dedupes it', () => {
  // 5 km over 30 minutes in one minute samples.
  const t0 = Date.parse(day(2) + 'T18:00:00Z');
  const dist = Array.from({ length: 30 }, (_, i) => ({ t: t0 + i * 60e3, end: t0 + (i + 1) * 60e3, v: 5 / 30 }));
  const found = detectRuns({ dist, hr: [{ t: t0 + 60e3, v: 150 }] });
  assert.equal(found.length, 1);
  assert.equal(found[0].km, 5);
  assert.equal(mergeRuns(found, found).length, 1);
});

test('GET /api/coach returns the example form summary and the fictional goal', async () => {
  process.env.APP_KEY = 'x';
  const coach = require(path.join(R, 'api', 'coach'));
  const res = fakeRes();
  await coach({ method: 'GET', headers: { 'x-app-key': 'x' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.form.metrics.length, 10);
  assert.match(res.body.goal.runner, /Alex/);
});

test('GET /api/coach rejects a wrong key', async () => {
  process.env.APP_KEY = 'x';
  const coach = require(path.join(R, 'api', 'coach'));
  const res = fakeRes();
  await coach({ method: 'GET', headers: { 'x-app-key': 'wrong' } }, res);
  assert.equal(res.code, 401);
});

test('POST /api/runs saves a typed run to the store, GET reads it back', async () => {
  process.env.APP_KEY = 'x';
  const api = require(path.join(R, 'api', 'runs'));
  const post = fakeRes();
  await api({ method: 'POST', headers: { 'x-app-key': 'x' }, body: { run: { date: day(1), km: 5, minutes: 30 } } }, post);
  assert.equal(post.code, 200);
  assert.equal(post.body.total, 1);
  const get = fakeRes();
  await api({ method: 'GET', headers: { 'x-app-key': 'x' } }, get);
  assert.equal(get.body.runs[0].est_5k_secs, 1800);
  assert.ok(fs.existsSync(path.join(STORE, 'runs', 'all.json')), 'run not written to the temp store');
});
