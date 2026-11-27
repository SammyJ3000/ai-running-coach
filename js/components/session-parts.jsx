// The pieces that draw one session: its shape, numbers and notes, and the sheet that shows all of it.
/* global Count, EFFORT, HARD, inDays, iso, kmFmt, kmLabel, noteIcon, readSession, RUNNING, sentences, Sheet, stepLine, stepName, useState */
/* exported BigKm, Profile, Ramp, RestBody, SessionBody, SessionSheet */

const Line = ({ n, cls }) => { const m = n.match(/^(Gym|Note):\s*(.*)$/); return <div className={`${cls || ''} ${/^no running/i.test(n) ? 'no' : ''}`}><i className={`ph ph-${noteIcon(n)}`} /><span>{m ? <><b>{m[1]}. </b>{m[2][0].toUpperCase() + m[2].slice(1)}</> : n}</span></div>; };

// Time runs left to right, height is effort: walk low, run high.
function Profile({ steps, mini, labels }) {
  const flat = steps.flatMap((g) => Array.from({ length: g.reps }, () => g.parts).flat()), total = flat.reduce((n, p) => n + p.min, 0) || 1;
  const W = 350, H = mini ? 26 : 50, gap = flat.length > 12 ? 1.5 : 2.5, per = (W - gap * (flat.length - 1)) / total; let x = 0;
  return <div className="prof">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Session shape: ${stepLine(steps)}`}>
      {(() => { const all = flat.map((p, i) => { const w = p.min * per, h = p.run ? H : H * 0.34, r = <rect key={i} className="rise" style={{ '--i': i }} x={x} y={H - h} width={w} height={h} rx={mini ? 2 : 3} fill={p.run ? 'var(--hi)' : '#3A3E33'} />; x += w + gap; return [p.run, r]; });
        return <><g>{all.filter((a) => !a[0]).map((a) => a[1])}</g><g>{all.filter((a) => a[0]).map((a) => a[1])}</g></>; })()}
    </svg>
    {labels && <div className="prof-l">{steps.length <= 4 ? steps.map((g, i) => <span key={i}>{g.reps > 1 || g.parts[0].run ? <b>{stepName(g, true)}</b> : stepName(g, true)}</span>) : <span>{stepLine(steps)}</span>}</div>}
  </div>;
}

// The body of a running session. `fold` keeps the small print behind a tap (Today); the sheet shows it all.
function SessionBody({ s, fold }) {
  const r = readSession(s), [open, setOpen] = useState(false), lit = EFFORT[s.type];
  const cueRest = r.cue.slice(fold ? 2 : 0).join(' ');
  const rest = [...(cueRest ? [['cue', cueRest]] : []), ...(s.pace && (!r.range || !fold || /,/.test(s.pace)) ? [['pace', s.pace[0].toUpperCase() + s.pace.slice(1) + (/[.!]$/.test(s.pace) ? '' : '.')]] : []), ...r.notes.map((n) => ['note', n])];
  const list = <div className="lines">{rest.map(([k, n]) => k === 'cue' ? <div key={n}><i className="ph ph-metronome" /><span>{n}</span></div> : k === 'pace' ? <div key={n}><i className="ph ph-gauge" /><span>{n}</span></div> : <Line key={n} n={n} />)}</div>;
  const why = s.why && <p className="whyp"><b>Why this run. </b>{s.why}{s.rule && ' Adjusted by the knee rules.'}</p>;
  return <>
    {r.steps.length ? <Profile steps={r.steps} labels /> : lit && <Ramp lit={lit} word={HARD.test(s.type) ? 'Hold it here' : 'Stay down here'} />}
    <div className="stats">
      {s.minutes != null && <div><b><Count v={s.minutes} /><small>min</small></b><span>about, all in</span></div>}
      {s.hr_cap != null && <div><b><Count v={s.hr_cap} /><small>bpm</small></b><span>stay under</span></div>}
      {r.range && <div><b>{r.range}</b><span>per km, easy</span></div>}
    </div>
    {(r.pre.length > 0 || (fold && r.cue[0])) && <div className="lines">
      {r.pre.map((n) => <div className="pre" key={n}><i className="ph ph-warning" /><span>{n}</span></div>)}
      {fold && r.cue[0] && <div className="cue-l"><i className="ph ph-metronome" /><span><b>{r.cue[0]}</b>{r.cue[1] ? ` ${r.cue[1]}` : ''}</span></div>}
    </div>}
    {fold ? <>
      <a role="button" aria-expanded={open} className={`more ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>Session notes<span>{open ? '' : 'Rules, pace and why'}</span><i className="ph-bold ph-caret-down" /></a>
      <div className={`fold ${open ? 'open' : ''}`} aria-hidden={!open}><div>{list}{why}</div></div>
    </> : <>{list}{why}</>}
  </>;
}
const BigKm = ({ s }) => (s.km != null ? <div className={`big ${String(kmLabel(s.km)).length > 1 ? 'long' : ''}`}><Count v={kmLabel(s.km)} fmt={kmFmt(s.km)} /><small>km</small></div> : s.minutes ? <div className="big long"><Count v={s.minutes} /><small>min</small></div> : null);

function RestBody({ s, fold }) {
  const all = sentences(s.structure), [open, setOpen] = useState(false), head = fold ? all.slice(0, 3) : all, tail = fold ? all.slice(3) : [];
  return <>
    <div className="lines">{head.map((n) => <Line key={n} n={n} />)}</div>
    {tail.length > 0 && <>
      <a role="button" aria-expanded={open} className={`more ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>{tail.length} more note{tail.length > 1 ? 's' : ''}<i className="ph-bold ph-caret-down" /></a>
      <div className={`fold ${open ? 'open' : ''}`} aria-hidden={!open}><div><div className="lines">{tail.map((n) => <Line key={n} n={n} />)}</div></div></div>
    </>}
  </>;
}

function SessionSheet({ s, close }) {
  const run = RUNNING(s);
  return <Sheet onClose={close}>{(close) => <>
    <div className="sh-top"><span>{new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}{s.date >= iso() ? `, ${inDays(s.date)}` : ''}</span><a className="close" onClick={close}>Close<i className="ph-bold ph-x" /></a></div>
    {run ? <section className="hero"><div className="h-row"><BigKm s={s} /><div className="h-t"><h2>{s.title}</h2></div></div><SessionBody s={s} /></section>
      : <section className="hero rest-h"><h2 style={{ marginTop: 0 }}>{s.title}</h2>{s.why && <p className="whyp">{s.why}</p>}<RestBody s={s} /></section>}
  </>}</Sheet>;
}

function Ramp({ lit, word }) {
  const [a, b] = lit, mid = ((a + b + 1) / 2) * 35.3 - 2.9;
  return <div className="ramp">
    <svg viewBox="0 0 350 56" role="img" aria-label={`Effort: ${word}`}><defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#161814" /><rect width="1.4" height="5" fill="#3A3E33" /></pattern></defs>
      {Array.from({ length: 10 }, (_, i) => { const h = 12 + i * 4.6; return <rect key={i} className="rise" style={{ '--i': i }} x={i * 35.3} y={54 - h} width="29.5" height={h} rx="3" fill={i >= a && i <= b ? 'var(--hi)' : i > b ? 'url(#hatch)' : '#3A3E33'} stroke={i > b ? '#3A3E33' : 'none'} />; })}</svg>
    <div className="ramp-l"><span>{a > 1 ? 'Easy' : ''}</span><span className="here" style={{ left: `${Math.max(14, Math.min(82, (mid / 350) * 100))}%` }}>{word}</span><span>{b < 8 ? 'Not today' : ''}</span></div>
  </div>;
}
