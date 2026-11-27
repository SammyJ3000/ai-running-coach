// POST /api/coach with the Anthropic API replaced by a stub: model replies are parsed, shape checked and run through
// the knee rules before anything is stored. No API key and no network; the store is a temp folder.
//   npm test
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const R = path.join(__dirname, '..');
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-api-'));
process.env.STORE_DIR = STORE;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
process.env.APP_KEY = 'x';
const realFetch = global.fetch;
const realError = console.error;
after(() => { global.fetch = realFetch; console.error = realError; fs.rmSync(STORE, { recursive: true, force: true }); });

const { parseModelJson, ModelReplyError } = require(path.join(R, 'lib', 'modeljson'));
const coach = require(path.join(R, 'api', 'coach'));

const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const fakeRes = () => ({ setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
const post = async (body) => { const res = fakeRes(); await coach({ method: 'POST', headers: { 'x-app-key': 'x' }, body }, res); return res; };
// The model's reply, as the Messages API would send it.
const replyWith = (text) => { global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: {} }) }); };
const planFile = path.join(STORE, 'coach', 'plan.json');

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  fs.rmSync(path.join(STORE, 'coach'), { recursive: true, force: true });
  fs.mkdirSync(path.join(STORE, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(STORE, 'runs', 'all.json'), JSON.stringify([{ id: 'a', date: day(10), start: day(10) + 'T18:00:00Z', km: 5, secs: 1800, hr_max: 180 }]));
  fs.writeFileSync(path.join(STORE, 'runs', 'checkins.json'), JSON.stringify([{ date: day(8), pain: 1 }, { date: day(1), pain: 1 }]));
  console.error = () => {};   // the handler logs rejected replies; keep the test output clean
});

test('parseModelJson takes the object out of a code fence or a sentence', () => {
  assert.deepEqual(parseModelJson('Here it is:\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Sure. {"a": {"b": 2}} Hope that helps.'), { a: { b: 2 } });
});

test('parseModelJson rejects replies that are not one JSON object of the right shape', () => {
  for (const t of ['', 'no json here', '[1, 2]', '{"a": 1,}', '{ broken', null]) assert.throws(() => parseModelJson(t), ModelReplyError, String(t));
  assert.throws(() => parseModelJson('{"a": 1}', () => ['a is wrong']), /wrong shape: a is wrong/);
});

test('a plan reply is parsed, checked and clamped by the knee rules before it is stored', async () => {
  replyWith('```json\n' + JSON.stringify({ summary: 'x', weeks: [{ label: 'Week 1', sessions: [{ date: day(-1), type: 'easy', title: 'Easy run', km: 8, minutes: 50, hr_cap: 170 }] }] }) + '\n```');
  const res = await post({ action: 'plan' });
  assert.equal(res.code, 200);
  const [s] = res.body.plan.weeks[0].sessions;
  assert.ok(s.km <= 5.5, 'distance cap not applied');
  assert.equal(s.hr_cap, Math.round(180 * 0.76));
  assert.ok(fs.existsSync(planFile), 'plan not stored');
});

test('a malformed plan reply is rejected with a 502 and nothing is stored', async () => {
  for (const text of ['I cannot write a plan today.', JSON.stringify({ weeks: 'two' }), JSON.stringify({ weeks: [{ sessions: [{ date: day(-1), type: 'easy', title: 'Run', km: '12' }] }] })]) {
    replyWith(text);
    const res = await post({ action: 'plan' });
    assert.equal(res.code, 502, text);
    assert.doesNotMatch(res.body.error, /km|weeks|JSON/, 'the model reply leaked into the client error');
    assert.ok(!fs.existsSync(planFile), 'a bad plan was stored');
  }
});

test('a review reply of the wrong shape is rejected with a 502', async () => {
  replyWith(JSON.stringify({ went_well: 'all of it' }));
  const res = await post({ action: 'review', runId: 'a' });
  assert.equal(res.code, 502);
  assert.ok(!fs.existsSync(path.join(STORE, 'coach', 'reviews.json')), 'a bad review was stored');
});

test('a screenshot reply with an impossible date is rejected with a 502', async () => {
  replyWith(JSON.stringify({ is_run: true, date: 'last Tuesday', km: 5, secs: 1800 }));
  const res = await post({ action: 'read', image: 'data:image/png;base64,AAAA' });
  assert.equal(res.code, 502);
});
