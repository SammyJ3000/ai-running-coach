// The plan level eval that needs no API key: every adversarial plan in evals/adversarial-plans.js goes through
// enforce(), and the result is checked against the knee rules written out again here, independently of lib/rules.js.
//   npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const R = path.join(__dirname, '..');
const { enforce, kneeStatus, weeksPainFree, SESSION_TYPES, DEFAULT_PACE_S_PER_KM } = require(path.join(R, 'lib', 'rules'));
const { cases } = require(path.join(R, 'evals', 'adversarial-plans'));

const DAY = 864e5;
const HARD = /interval|tempo|threshold|speed|hill|fartlek|race|time.?trial|\btest\b/i;
const RUN_TITLE = /\b(run|runs|running|jog|jogging|strides?)\b/i;
const copy = (x) => JSON.parse(JSON.stringify(x));
// Is this output session running? Rest and cross never are; a walk is unless its title says it is a run.
const running = (s) => !['rest', 'cross'].includes(s.type) && !(s.type === 'walk' && !RUN_TITLE.test(s.title.replace(/\bno\s+run\w*/gi, '')));
const median = (xs) => { const a = [...xs].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

// Every rule the output must obey. Returns a list of broken rules (empty = safe).
function broken(out, runs, checkins) {
  const bad = [];
  const knee = kneeStatus(checkins).level;
  const comeback = weeksPainFree(checkins) < 3;
  const maxHr = Math.max(0, ...runs.map((r) => r.hr_max || 0));
  const hrCap = maxHr ? Math.round(maxHr * (comeback ? 0.76 : 0.79)) : null;
  const paced = runs.filter((r) => r.km > 0 && r.secs > 0).slice(-10);
  const pace = paced.length ? median(paced.map((r) => r.secs / r.km)) : DEFAULT_PACE_S_PER_KM;
  const pool = runs.map((r) => ({ t: Date.parse(r.start), km: r.km }));
  for (const [w, week] of out.weeks.entries()) {
    let hard = 0;
    for (const s of week.sessions) {
      const at = `week ${w + 1} ${s.date} ${s.title}`;
      if (!SESSION_TYPES.includes(s.type)) bad.push(`${at}: unknown type ${s.type}`);
      if (['rest', 'cross'].includes(s.type) && (RUN_TITLE.test(s.title) || HARD.test(s.title))) bad.push(`${at}: a run hidden as ${s.type}`);
      if (!running(s)) continue;
      if (knee === 'stop' || knee === 'walk') bad.push(`${at}: running after a bad knee check in`);
      if (HARD.test(s.type + ' ' + s.title) && (comeback || ++hard > 1)) bad.push(`${at}: ${comeback ? 'quality in the comeback' : 'a second hard session in a week'}`);
      if (hrCap && (s.hr_cap == null || s.hr_cap > hrCap)) bad.push(`${at}: heart rate cap ${s.hr_cap} over ${hrCap}`);
      const t = Date.parse(s.date + 'T23:59:59Z');
      const longest = pool.filter((r) => r.t <= t && r.t >= t - 30 * DAY).reduce((m, r) => Math.max(m, r.km), 0);
      const cap = longest > 0 ? longest * 1.1 : 3;
      const km = s.km || (s.minutes ? (s.minutes * 60) / pace : 0);
      if (km > cap + 0.05) bad.push(`${at}: ${km.toFixed(2)} km over the ${cap.toFixed(2)} km cap`);
      pool.push({ t: Date.parse(s.date + 'T12:00:00Z'), km });
    }
  }
  return bad;
}

for (const c of cases()) {
  test(`adversarial plan: ${c.name}`, () => {
    if (c.expect === 'rejected') {
      assert.throws(() => enforce(copy(c.plan), c.runs, c.checkins), /invalid plan/);
      return;
    }
    // The bad plan really is bad, so the test would catch a rule that stopped working.
    assert.notDeepEqual(broken(copy(c.plan), c.runs, c.checkins), [], 'the case does not break any rule to begin with');
    const { plan, changes } = enforce(copy(c.plan), c.runs, c.checkins);
    assert.ok(changes.length > 0, 'enforce changed nothing');
    assert.deepEqual(broken(plan, c.runs, c.checkins), []);
  });
}
