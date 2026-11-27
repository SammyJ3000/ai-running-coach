// The Today tab: this week, today's session or result, the knee and the 5K goal.
/* global api, BigKm, clock, Count, Cta, dayName, dayNum, EFFORT, Fresh, inDays, iso, kmLabel, mmss, Profile, Ramp, readSession, RestBody, RUNNING, SessionBody, splitSecs, t, Tick, todayView, useContext, useLayoutEffect, useRef, useState */
/* exported Today */

function WeekStrip({ marks }) {
  const now = new Date(), mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return iso(d); });
  return <div className="wk" aria-label="This week">{days.map((d) => <div key={d} className={d === iso() ? 'now' : d < iso() ? 'past' : ''}><b>{dayName(d)[0]}</b><span>{dayNum(d)}</span>{marks.has(d) && <em />}</div>)}</div>;
}

function Goal({ goal, runs, coach }) {
  const best = runs.map((r) => r.est_5k_secs).filter(Boolean);
  const now = best.length ? Math.min(...best.slice(-6)) : (coach && coach.plan && coach.plan.target_now_secs) || goal.start_secs;
  const span = goal.start_secs - goal.pb_secs, done = Math.max(0, Math.min(1, (goal.start_secs - now) / span));
  // The path from the starting point to the PB: quick gains first, slower near the PB. A shape, not a forecast.
  const P = (u) => [8 + 310 * u, 10 + 48 * (1 - Math.pow(1 - u, 2.1))];
  const path = Array.from({ length: 25 }, (_, i) => P(i / 24)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [mx, my] = P(done), upto = (u) => Array.from({ length: 13 }, (_, i) => P((u * i) / 12)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  // On first view the marker travels from the starting point to where you are now, leaving a lit line behind it.
  const fresh = useContext(Fresh), mark = useRef(), trail = useRef();
  useLayoutEffect(() => {
    if (!fresh || done <= 0.02) return; let raf, t0;
    const put = (u) => { const [x, y] = P(u); mark.current.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); trail.current.setAttribute('d', upto(u)); };
    const step = () => { const now = clock(); t0 = t0 || now; const k = Math.min(1, Math.max(0, (now - t0 - 420) / 1300)); put(done * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(step); };
    put(0); raf = requestAnimationFrame(step); return () => { cancelAnimationFrame(raf); put(done); };
  }, []);
  return <section className="goal card">
    <div className="g-h"><div className="n g-n"><Count v={now} fmt={mmss} /></div><div className="g-gap"><span className="n"><Count v={Math.max(0, now - goal.pb_secs)} fmt={mmss} /></span> to find</div><div className="n g-n">{t(goal.pb_secs)}</div></div>
    <svg viewBox="0 -14 350 82" role="img" aria-label={`5K goal: ${t(now)} now, ${t(goal.pb_secs)} personal best`}>
      {[10, 26, 42, 58].map((y) => <line key={y} x1="0" x2="350" y1={y} y2={y} stroke="#23261F" />)}
      <path d={path} fill="none" stroke="#F2F1E8" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
      {done > 0.02 && <path ref={trail} d={upto(done)} fill="none" stroke="#E1FF45" strokeWidth="2.6" strokeLinecap="round" />}
      {done > 0.02 && <circle cx="8" cy="10" r="4" fill="#0D0E0C" stroke="#74766A" strokeWidth="2" />}
      <circle cx="318" cy="58" r="6" fill="#0D0E0C" stroke="#F2F1E8" strokeWidth="2" />
      <g ref={mark} transform={`translate(${mx.toFixed(1)} ${my.toFixed(1)})`}><circle className="pulse" r="11" fill="#E1FF45" /><circle r="13" fill="none" stroke="#E1FF45" strokeOpacity=".3" /><circle r="7" fill="#E1FF45" />
        <text x={mx > 200 ? -20 : 4} y="-19" textAnchor={mx > 200 ? 'end' : 'start'} fontSize="12" fill="#A3A394">{best.length ? 'best estimate' : 'starting point'}{done > 0.02 ? `, ${Math.round(done * 100)}% of the way back` : ''}</text></g>
      <text x="306" y="50" textAnchor="end" fontSize="12" fill="#A3A394">your PB</text>
    </svg>
  </section>;
}

function Knee({ knee, checkins }) {
  const last = [...(checkins || [])].sort((a, b) => a.date.localeCompare(b.date)).pop();
  return <section className="knee card">
    <div className="k-t"><b>Knee</b>{knee && knee.level !== 'unknown' ? <span className={`lv-${knee.level}`}>{knee.note}</span> : <span className="mute">{last ? `Last check-in ${last.pain} out of 10` : 'No check-in yet'}</span>}</div>
    <div className={`k-s ${last ? (last.pain < 3 ? 'at-a' : last.pain < 5 ? 'at-b' : 'at-c') : ''}`}><i className="a" /><i className="b" /><i className="c" />{last && <u style={{ left: `${((last.pain + 0.5) / 11) * 100}%` }} />}</div>
    <div className="k-l"><span>0 to 2<br />carry on</span><span>3 to 4<br />easy only</span><span>5 or more, or any swelling<br />stop</span></div>
  </section>;
}

// Today has three real states: a run day, a rest day, and a run already done. Each gets its own hero.
function RunHero({ s }) {
  const today = s.date === iso(), when = today ? (s.type === 'walk-run' ? 'Easy, with walk breaks' : s.type === 'easy' || s.type === 'long' ? 'Easy all the way' : '') : `${new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}, ${inDays(s.date)}`;
  return <section className="hero">
    <div className="h-row"><BigKm s={s} /><div className="h-t"><h2>{s.title}</h2>{when && <p>{when}</p>}</div></div>
    <SessionBody s={s} fold />
  </section>;
}
function RestHero({ s }) {
  return <section className="hero rest-h">
    <div className="big long">REST<small>day</small></div>
    <h2>{s.title}</h2>{s.why && <p className="whyp">{s.why}</p>}
    <RestBody s={s} fold />
  </section>;
}
function Review({ review, onOpen }) {
  const n = (review.went_well || []).length, m = (review.work_on || []).length;
  return <><div className="said"><p>{review.headline}</p><span>Your coach</span></div>
    <a role="button" className="golink" onClick={onOpen}>Read the full review<span>{[n && `${n} went well`, m && `${m} to work on`].filter(Boolean).join(', ')}</span><i className="ph-bold ph-caret-right" /></a></>;
}
function DoneHero({ run, review, openRun }) {
  const sp = splitSecs(run);
  const lo = Math.min(...sp), hi = Math.max(...sp), mid = [...sp].sort((a, b) => a - b)[Math.floor(sp.length / 2)];
  return <section className="hero tap" onClick={() => openRun(run)}>
    <div className="done-t"><b><i className="ph-fill ph-check-circle" />Run done</b><span>{new Date(run.start || run.date + 'T12:00:00').toLocaleString('en-GB', run.start ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: 'numeric' })}</span></div>
    <div className="h-row" style={{ justifyContent: 'space-between' }}><div className="big long"><Count v={+run.km} fmt={(x) => (Number.isInteger(+run.km) ? String(Math.round(x)) : x.toFixed(String(run.km).split('.')[1].length))} /><small>km</small></div>
      <div className="side"><div><b><Count v={run.secs} fmt={mmss} /></b><span>time</span></div><div><b><Count v={run.pace_s_per_km} fmt={mmss} /></b><span>per km</span></div></div></div>
    {sp.length > 1 && <div className="sp" role="img" aria-label="Kilometre splits, taller is faster, hatched is where you faded">{sp.map((x, i) => <div key={i} className={x > mid * 1.05 ? 'slow' : x === lo && hi !== lo ? 'fast' : ''}><u className="rise" style={{ '--i': i * 2, height: 14 + (hi === lo ? 14 : ((hi - x) / (hi - lo)) * 30) }} /><b>{t(x)}</b><span>km {i + 1}</span></div>)}</div>}
    {review ? <Review review={review} onOpen={() => {}} /> : <p className="whyp" style={{ marginTop: 16 }}>Check in on the knee and the coach will read this run.</p>}
  </section>;
}
function NextCard({ s, open }) {
  const r = readSession(s);
  return <section className="nx card tap" onClick={() => open(s)}><Tick />
    <div className="h4">Next run<span>{dayName(s.date)} {dayNum(s.date)}, {inDays(s.date)}</span></div>
    <div className="nx-r"><div className="d">{s.km != null ? kmLabel(s.km) : s.minutes}<small>{s.km != null ? 'km' : 'min'}</small></div>
      <div><h3>{s.title}</h3><p>{[s.minutes != null && `About ${s.minutes} min`, s.hr_cap != null && `under ${s.hr_cap} bpm`].filter(Boolean).join(', ')}</p></div><i className="ph-bold ph-caret-right" /></div>
    {r.steps.length > 0 && <Profile steps={r.steps} mini labels />}
  </section>;
}

function Today({ data, reload, openRun, openSession, go }) {
  const { coach, runs, checkins } = data, v = todayView(data), { last, review, mode } = v;
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const plan = async () => { setBusy(true); setErr(''); try { await api('/api/coach', { method: 'POST', body: JSON.stringify({ action: 'plan' }) }); await reload(); } catch (e) { setErr(e.message); } setBusy(false); };
  const marks = new Set([...v.sessions.filter(RUNNING).map((s) => s.date), ...runs.map((r) => r.date)]);
  return <div>
    <header className="top"><div><h1 data-lt>Today</h1><p className="sub">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}</p></div><WeekStrip marks={marks} /></header>
    {mode === 'done' && <DoneHero run={last} review={review} openRun={openRun} />}
    {mode === 'rest' && <RestHero s={v.now} />}
    {mode === 'run' && <RunHero s={v.upcoming} />}
    {mode === 'noplan' && <section className="hero"><h2>No plan yet</h2><p className="sub" style={{ fontSize: 14.5 }}>Your coach has your runs. Ask it for your first two weeks.</p></section>}
    {mode === 'first' && <section className="hero">
      <div className="h-row"><div className="big">5<small>km</small></div><div className="h-t"><h2>Benchmark run</h2><p>Do this first: a steady 5 km, comfortably hard, not a race. Walk if the knee hurts.</p></div></div>
      <Ramp lit={EFFORT.test} word="Hold it here" />
    </section>}
    {err && <p className="err">{err}</p>}
    <Knee knee={coach.knee} checkins={checkins} />
    {(mode === 'done' || mode === 'rest') && v.upcoming && <NextCard s={v.upcoming} open={openSession} />}
    {last && mode !== 'done' && <section className="last card tap" onClick={() => openRun(last)}><Tick />
      <h4>Last run<span>{dayName(last.date)} {dayNum(last.date)}</span></h4>
      <div className="stats"><div><b>{last.km}<small>km</small></b></div><div><b>{t(last.secs)}</b></div><div><b>{t(last.pace_s_per_km)}<small>/km</small></b></div></div>
      {review ? <Review review={review} onOpen={() => {}} /> : <p>Tap for the coach's review and your knee check-in.</p>}
    </section>}
    <Goal goal={data.goal} runs={runs} coach={coach} />
    {v.cta === 'plan' && <Cta disabled={busy} busy={busy} onClick={plan}><i className="ph-bold ph-pencil-simple-line" />{busy ? 'Writing your plan…' : 'Write my plan'}</Cta>}
    {v.cta === 'first' && <Cta onClick={() => go('runs')}><i className="ph-bold ph-plus" />Add your benchmark run</Cta>}
    {v.cta === 'add' && <Cta onClick={() => go('runs')}><i className="ph-bold ph-plus" />Add today's run</Cta>}
    {v.cta === 'knee' && <Cta onClick={() => openRun(last)}><i className="ph-bold ph-first-aid" />Check in on the knee</Cta>}
    {v.cta === 'review' && <Cta onClick={() => openRun(last)}><i className="ph-bold ph-chat-circle-text" />Get the coach's review</Cta>}
    {v.cta === 'next' && <Cta onClick={() => openSession(v.upcoming)}><i className="ph-bold ph-sneaker-move" />See {new Date(v.upcoming.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}'s run</Cta>}
    {v.cta === 'runs' && <Cta onClick={() => go('runs')}><i className="ph-bold ph-plus" />Add a run</Cta>}
  </div>;
}
