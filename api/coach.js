// The coach. Claude writes the plan and reviews runs; lib/rules.js checks every plan against the knee rules first.
//   POST /api/coach { action: 'plan' }            -> writes the next two weeks from runs, form, knee check-ins and the goal
//   POST /api/coach { action: 'review', runId }   -> reviews one run against what was planned, and says what changes
//   POST /api/coach { action: 'ask', question }   -> a free-text answer from the coach (nothing stored; used by executions/coach_exam.mjs)
//   GET  /api/coach                               -> { plan, changes, knee, reviews }
// Prompts live in prompts/ (playbook.md = the coach's knowledge, loaded into plan, review and ask), the model and the
// runner's goal in config.json. Needs x-app-key and ANTHROPIC_API_KEY.

const fs = require('fs');
const path = require('path');
const { keyOk } = require('../lib/auth');
const { readJSON, writeJSON } = require('../lib/store');
const { enforce, kneeStatus, longest30 } = require('../lib/rules');
const { numbers } = require('../lib/paces');
const { mergeRuns, est5k } = require('../lib/runs');

const ROOT = path.join(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const prompt = (n) => fs.readFileSync(path.join(ROOT, 'prompts', n + '.md'), 'utf8');
// The form analysis: form/out/summary.json once you have run the pipeline on your own clips, else the fictional example.
const form = () => {
  for (const f of [['form', 'out', 'summary.json'], ['form', 'example-summary.json']]) {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, ...f), 'utf8')); } catch (e) {
      if (e.code !== 'ENOENT') console.error(`form summary ${f.join('/')} unreadable, trying the next one:`, e.message);
    }
  }
  return null;
};

// The coach's expert knowledge (prompts/playbook.md) goes first in every plan, review
// and ask call as its own system block with a cache breakpoint. It is byte-identical across actions, so one cached
// copy serves all of them. The action's instructions follow it; everything that changes per call (runs, numbers,
// the question) is in the user message, after the breakpoint.
const system = (action) => [
  { type: 'text', text: prompt('playbook'), cache_control: { type: 'ephemeral' } },
  { type: 'text', text: prompt(action) },
];

// One Messages API call -> { text, usage }. `user` is a string or an array of content blocks (the screenshot reader sends an image).
async function claude(sys, user, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CONFIG.coach_model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || `Claude said ${r.status}`);
  if (j.stop_reason === 'max_tokens') throw new Error('reply was cut short');
  return { text: (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim(), usage: j.usage || null };
}
const json = (t) => JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.APP_KEY) return res.status(503).json({ error: 'APP_KEY not set' });
  if (!keyOk(req)) return res.status(401).json({ error: 'wrong key' });
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ...(await readJSON('coach/plan.json', {})), reviews: await readJSON('coach/reviews.json', {}), goal: CONFIG.goal, form: form(), numbers: numbers(await readJSON('runs/all.json', []), CONFIG.goal, new Date().toISOString().slice(0, 10)) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ error: 'ANTHROPIC_API_KEY not set' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const runs = await readJSON('runs/all.json', []), checkins = await readJSON('runs/checkins.json', []);
    const today = new Date().toISOString().slice(0, 10);
    const slim = runs.slice(-20).map(({ hr_series, ...r }) => r);
    const context = { today, goal: CONFIG.goal, knee: kneeStatus(checkins), longest_run_last_30_days_km: longest30(runs, today), runs: slim, checkins: checkins.slice(-10), form: form(), numbers: numbers(runs, CONFIG.goal, today) };

    // A screenshot of a watch app's run summary -> a run (backup for when the run doesn't reach Apple Health).
    if (b.action === 'read') {
      const m = String(b.image || '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
      if (!m) return res.status(400).json({ error: 'send a screenshot' });
      const got = json((await claude(prompt('read'), [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: 'Read this run.' }], 2000)).text);
      if (!got.is_run || !(got.km > 0) || !(got.secs > 0)) return res.status(200).json({ error: "Couldn't read a run on that screenshot.", got });
      const date = got.date || today, start = new Date(`${date}T${got.time || '18:00'}:00Z`);
      const run = { id: start.toISOString(), date, start: start.toISOString(), end: new Date(+start + got.secs * 1000).toISOString(), km: got.km, secs: got.secs,
        pace_s_per_km: Math.round(got.secs / got.km), est_5k_secs: est5k(got.km, got.secs), hr_avg: got.hr_avg, hr_max: got.hr_max,
        cadence: got.cadence, splits: got.splits || [], notes: got.notes, source: 'screenshot' };
      await writeJSON('runs/all.json', mergeRuns(runs, [run]));
      return res.status(200).json({ ok: true, run });
    }

    if (b.action === 'plan') {
      const { text: raw } = await claude(system('plan'), 'Write my next two weeks starting tomorrow. Here is everything you know.\n\n' + JSON.stringify(context, null, 1), 16000);
      const { plan, changes, knee } = enforce(json(raw), runs, checkins);
      const out = { plan, changes, knee, at: new Date().toISOString() };
      await writeJSON('coach/plan.json', out);
      return res.status(200).json(out);
    }

    if (b.action === 'review') {
      const run = runs.find((r) => r.id === b.runId) || runs[runs.length - 1];
      if (!run) return res.status(400).json({ error: 'no runs yet' });
      const { plan } = await readJSON('coach/plan.json', {});
      const planned = plan ? (plan.weeks || []).flatMap((w) => w.sessions || []).find((s) => s.date === run.date) : null;
      const { text: raw } = await claude(system('review'), 'Review this run.\n\n' + JSON.stringify({ ...context, run, planned, checkin: checkins.find((c) => c.runId === run.id || c.date === run.date) || null }, null, 1), 6000);
      const reviews = await readJSON('coach/reviews.json', {});
      reviews[run.id] = { ...json(raw), at: new Date().toISOString() };
      await writeJSON('coach/reviews.json', reviews);
      return res.status(200).json({ runId: run.id, review: reviews[run.id] });
    }
    // A free-text question to the coach (same playbook and context as plan and review). Stores nothing.
    if (b.action === 'ask') {
      const q = String(b.question || '').trim().slice(0, 4000);
      if (!q) return res.status(400).json({ error: 'send a question' });
      const { text: answer, usage } = await claude(system('ask'), 'Here is everything you know about me right now.\n\n' + JSON.stringify(context, null, 1) + '\n\nMy question:\n' + q, 6000);
      return res.status(200).json({ answer, usage });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error('coach failed', err);
    return res.status(500).json({ error: 'coach failed: ' + err.message });
  }
};
