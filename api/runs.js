// Runs.
//   POST /api/runs            body { samples } from the iPhone Shortcut -> finds the runs in it and saves them
//   POST /api/runs?dry=1      same, but only says what it found (for building the Shortcut)
//   POST /api/runs            body { run: { date, km, minutes, note } } adds one by hand
//   POST /api/runs            body { checkin: { runId|date, pain 0-10, swelling, lasted48, note } } saves a knee check-in
//   GET  /api/runs            -> { runs, checkins }
// Every call needs the x-app-key header.

const { keyOk } = require('../lib/auth');
const { readJSON, writeJSON } = require('../lib/store');
const { detectRuns, mergeRuns, est5k } = require('../lib/runs');

const RUNS = 'runs/all.json', CHECKINS = 'runs/checkins.json';

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body);
  return {};
}

// Shortcuts sends lists as text, one per line. Turn {values, dates, ends} into [{t, end, v}].
function fromShortcut(s) {
  const split = (x) => (Array.isArray(x) ? x : String(x || '').split(/\n|;/)).map((v) => String(v).trim()).filter(Boolean);
  const out = {};
  for (const [k, val] of Object.entries(s || {})) {
    if (k === 'workouts' && val && typeof val === 'object' && !Array.isArray(val)) {
      const ty = split(val.types), a = split(val.starts), b = split(val.ends), d = split(val.km);
      out.workouts = ty.map((t, i) => ({ type: t, start: a[i], end: b[i], km: d[i] != null ? parseFloat(d[i]) : undefined }));
    } else if (val && typeof val === 'object' && !Array.isArray(val) && 'values' in val) {
      const v = split(val.values), t = split(val.dates), e = split(val.ends);
      out[k] = v.map((x, i) => ({ v: parseFloat(String(x).replace(/[^\d.-]/g, '')), t: t[i], end: e[i] }));
    } else out[k] = val;
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.APP_KEY) return res.status(503).json({ error: 'APP_KEY not set' });
  if (!keyOk(req)) return res.status(401).json({ error: 'wrong key' });
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ runs: await readJSON(RUNS, []), checkins: await readJSON(CHECKINS, []) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    const b = body(req);

    if (b.checkin) {
      const c = b.checkin, list = await readJSON(CHECKINS, []);
      const entry = { date: String(c.date || new Date().toISOString()).slice(0, 10), runId: c.runId || null, pain: Math.max(0, Math.min(10, Number(c.pain) || 0)), swelling: !!c.swelling, lasted48: !!c.lasted48, note: String(c.note || '').slice(0, 300), at: new Date().toISOString() };
      await writeJSON(CHECKINS, [...list.filter((x) => !(x.date === entry.date && x.runId === entry.runId)), entry]);
      return res.status(200).json({ ok: true, checkin: entry });
    }

    let fresh = [];
    if (b.run) {
      const r = b.run, secs = Math.round(Number(r.minutes) * 60), km = Number(r.km);
      if (!(km > 0 && secs > 0)) return res.status(400).json({ error: 'need km and minutes' });
      const start = new Date(`${String(r.date).slice(0, 10)}T${r.time || '18:00'}:00Z`);
      fresh = [{ id: start.toISOString(), date: String(r.date).slice(0, 10), start: start.toISOString(), end: new Date(+start + secs * 1000).toISOString(), km, secs, pace_s_per_km: Math.round(secs / km), est_5k_secs: est5k(km, secs), source: 'manual', note: r.note || '' }];
    } else if (b.samples) {
      fresh = detectRuns(fromShortcut(b.samples));
    } else return res.status(400).json({ error: 'nothing to save' });

    if (req.query && req.query.dry) return res.status(200).json({ ok: true, dry: true, found: fresh.map(({ hr_series, ...r }) => r) });
    const all = mergeRuns(await readJSON(RUNS, []), fresh);
    await writeJSON(RUNS, all);
    return res.status(200).json({ ok: true, found: fresh.length, total: all.length });
  } catch (err) {
    console.error('runs failed', err);
    return res.status(500).json({ error: 'runs failed: ' + err.message });
  }
};
