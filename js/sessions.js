// Reading the coach's plan for display. Plain functions, no React.
/* global iso */
/* exported EFFORT, HARD, noteIcon, readSession, RUNNING, sentences, stepLine, stepName, todayView */

const RUNNING = (s) => s && !['rest', 'cross'].includes(s.type);
const HARD = /tempo|interval|test/;
// Where a session type sits on the 10-step effort ramp (which bars light up).
const EFFORT = { walk: [0, 1], 'walk-run': [1, 2], easy: [2, 3], long: [2, 3], strides: [3, 4], test: [5, 6], tempo: [6, 7], intervals: [7, 8] };

// The coach writes a session as prose. These read it into steps, limits and notes for display; nothing is stored.
const sentences = (x) => String(x || '').replace(/([.!?])\s+(?=[A-Z])/g, '$1\n').split('\n').map((v) => v.trim()).filter(Boolean);
const STEP = /^(brisk walk|walk|easy run|run|jog)\s+(\d+(?:\.\d+)?)\s*min\b\s*(.*)$/i;
function readSession(s) {
  const steps = [], notes = []; let open = true;
  for (const raw of sentences(s.structure)) {
    if (open) {
      const body = raw.replace(/^then\s+/i, '').replace(/[.!]$/, '');
      const rep = body.match(/^(.*?),?\s*[x×]\s?(\d+)$/i), parts = rep ? rep[1].split(/,\s*/).map((p) => p.trim().match(STEP)) : [];
      if (rep && parts.length && parts.every(Boolean)) { steps.push({ reps: +rep[2], parts: parts.map((m) => ({ run: !/walk/i.test(m[1]), min: +m[2] })) }); continue; }
      const one = body.match(STEP);
      if (one) { steps.push({ reps: 1, parts: [{ run: !/walk/i.test(one[1]), min: +one[2] }] }); if (one[3] && !/^(to finish|easy)$/i.test(one[3])) notes.push(raw); continue; }
      if (steps.length) open = false;
    }
    notes.push(raw);
  }
  const range = String(s.pace || '').match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  return { steps, pre: notes.filter((n) => /^only\b/i.test(n)), notes: notes.filter((n) => !/^only\b/i.test(n)), cue: sentences(s.cue), range: range ? `${range[1]}–${range[2]}` : null };
}
const stepName = (g, cap) => { const w = (p) => `${p.run ? 'run' : 'walk'} ${p.min}`, x = g.reps > 1 ? `${g.reps} × ${g.parts.map(w).join(', ')}` : `${w(g.parts[0])}${cap ? ' min' : ''}`; return cap ? x[0].toUpperCase() + x.slice(1) : x; };
const stepLine = (steps) => { const x = steps.map((g) => stepName(g)).join(' · '); return x ? x[0].toUpperCase() + x.slice(1) : ''; };
const noteIcon = (n) => (/heart rate|bpm/i.test(n) ? 'heartbeat' : /^no running/i.test(n) ? 'prohibit' : /^gym/i.test(n) ? 'barbell' : /film|video/i.test(n) ? 'video-camera' : /pain|limp|knee|swelling|physio|sore/i.test(n) ? 'first-aid' : /walk/i.test(n) ? 'person-simple-walk' : /stop at|km on the watch/i.test(n) ? 'watch' : 'note');

// What Today shows, worked out once so the page and the pinned button agree.
function todayView(data) {
  const { coach, runs } = data, day = iso();
  const sessions = coach.plan ? (coach.plan.weeks || []).flatMap((w) => w.sessions || []) : [];
  const last = runs[runs.length - 1], ran = !!last && last.date === day, review = last && coach.reviews && coach.reviews[last.id];
  const now = sessions.find((s) => s.date === day) || null;
  const upcoming = sessions.find((s) => RUNNING(s) && (s.date > day || (s.date === day && !ran))) || null;
  const mode = !coach.plan ? (runs.length ? 'noplan' : 'first') : ran ? 'done' : now && !RUNNING(now) ? 'rest' : upcoming ? 'run' : 'noplan';
  const checked = !!last && (data.checkins || []).some((c) => c.runId === last.id);
  const cta = mode === 'first' ? 'first' : mode === 'noplan' ? 'plan' : mode === 'run' && upcoming.date === day ? 'add' : last && !checked ? 'knee' : mode === 'done' && !review ? 'review' : upcoming ? 'next' : 'runs';
  return { sessions, last, review, now, upcoming, mode, cta };
}
