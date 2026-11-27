// The Runs tab and the run sheet: splits, heart rate, the knee check in and the coach's review.
/* global api, buzz, Count, dayName, dayNum, iso, mmss, pace, REDUCE, Sheet, splitSecs, splitText, t, Tick, useRef, useState */
/* exported RunDetail, Runs */

function HrTrace({ hr, splits }) {
  const W = 350, H = 104, W2 = W - 26, end = hr[hr.length - 1][0] || 1, v = hr.map((p) => p[1]);
  const lo = Math.floor((Math.min(...v) - 6) / 10) * 10, hi = Math.ceil((Math.max(...v) + 4) / 10) * 10, Y = (b) => H - ((b - lo) / (hi - lo || 1)) * H;
  const d = hr.map(([x, y], i) => `${i ? 'L' : 'M'}${((x / end) * W2).toFixed(1)} ${Y(y).toFixed(1)}`).join('');
  const ticks = [1, 2, 3].map((k) => Math.round((lo + ((hi - lo) * k) / 4) / 5) * 5);
  return <svg viewBox={`0 0 ${W} ${H + 4}`} style={{ marginTop: 14 }} role="img" aria-label="Heart rate through the run">
    <defs><linearGradient id="hra" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E1FF45" stopOpacity=".26" /><stop offset="1" stopColor="#E1FF45" stopOpacity="0" /></linearGradient></defs>
    {ticks.map((b) => <g key={b}><line x1="0" x2={W2} y1={Y(b)} y2={Y(b)} stroke="#23261F" /><text x={W} y={Y(b) + 4} textAnchor="end" fontSize="11" fill="#74766A">{b}</text></g>)}
    {splits > 1 && Array.from({ length: splits - 1 }, (_, k) => <line key={k} x1={((k + 1) * W2) / splits} x2={((k + 1) * W2) / splits} y1="0" y2={H} stroke="#23261F" />)}
    <path className="fadein" d={`${d}L${W2} ${H}L0 ${H}Z`} fill="url(#hra)" /><path className="draw" pathLength="1" d={d} fill="none" stroke="#E1FF45" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    <text x="4" y="12" fontSize="12" fill="#A3A394">Heart rate, bpm</text><line x1="0" x2={W2} y1={H} y2={H} stroke="#2B2E26" />
  </svg>;
}

function RunDetail({ run, data, reload, close }) {
  const review = data.coach.reviews && data.coach.reviews[run.id];
  const ci = data.checkins.find((c) => c.runId === run.id);
  const [pain, setPain] = useState(ci ? ci.pain : null), [sw, setSw] = useState(ci ? ci.swelling : false), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [saved, setSaved] = useState(false), rev = useRef();
  const hr = run.hr_series || [], splits = Array.isArray(run.splits) ? run.splits : [];
  const go = async () => {
    setBusy(true); setErr('');
    try {
      if (pain != null) await api('/api/runs', { method: 'POST', body: JSON.stringify({ checkin: { runId: run.id, date: run.date, pain, swelling: sw } }) });
      await api('/api/coach', { method: 'POST', body: JSON.stringify({ action: 'review', runId: run.id }) });
      await reload();
      setSaved(true); buzz([10, 50, 16]); setTimeout(() => setSaved(false), 2200);
      setTimeout(() => { if (rev.current) rev.current.scrollIntoView({ behavior: REDUCE.matches ? 'auto' : 'smooth', block: 'start' }); }, 80);
    } catch (e) { setErr(e.message); buzz([30, 60, 30]); }
    setBusy(false);
  };
  const off = run.est_5k_secs && data.goal ? run.est_5k_secs - data.goal.pb_secs : null;
  return <Sheet onClose={close}>{(close) => <>
    <div className="sh-top"><span>{new Date(run.start).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</span><a className="close" onClick={close}>Close<i className="ph-bold ph-x" /></a></div>
    <div className="r-hero"><div className="t"><Count v={run.secs} fmt={mmss} /></div>{off != null && off > 0 && <div className="vs"><span>{t(off)}</span><small>off your PB over 5K</small></div>}</div>
    <div className="stats"><div><b>{run.km}</b><span>km</span></div><div><b>{t(run.pace_s_per_km)}</b><span>avg per km</span></div><div><b>{t(run.est_5k_secs)}</b><span>5K estimate</span></div>
      <div><b>{run.hr_avg || '–'}</b><span>avg bpm</span></div><div><b>{run.hr_max || '–'}</b><span>max bpm</span></div><div><b>{run.cadence || '–'}</b><span>steps a minute</span></div></div>
    {hr.length > 4 ? <HrTrace hr={hr} splits={splits.length} /> : <p className="nodata"><i className="ph ph-heartbeat" />No heart-rate trace came with this run.</p>}
    {splits.length > 0 && <div className="splits">{splits.map((s, i) => <div key={i}><b>{splitText(s)}</b><span>km {i + 1}</span></div>)}</div>}
    <section className="rule">
      <div className="h4">How does the knee feel?<span className="sw">Swelling?<button className={sw ? '' : 'on'} onClick={() => setSw(false)}>No</button><button className={sw ? 'on' : ''} onClick={() => setSw(true)}>Yes</button></span></div>
      <div className="scale">{Array.from({ length: 11 }, (_, i) => <button key={i} aria-label={`Knee pain ${i} out of 10`} className={`${i < 3 ? 'a' : i < 5 ? 'b' : 'c'} ${pain === i ? 'on' : ''}`} onClick={() => { buzz(5); setPain(i); }}><Tick />{i}</button>)}</div>
      <p className="note" style={{ marginTop: 6 }}>0 is nothing, 10 is bad.</p>
    </section>
    <button className={busy ? 'busy' : ''} disabled={busy} onClick={() => { buzz(10); go(); }}><Tick />{busy ? 'Coach is reading your run…' : saved ? <><i className="ph-bold ph-check" />Saved. Your review is below</> : review ? 'Review again' : "Get the coach's review"}</button>
    {err && <p className="err">{err}</p>}
    {review && <section className="rev rule" ref={rev} style={{ scrollMarginTop: 30 }}>
      <div className="h4">Coach's review</div>
      <p className="head">{review.headline}</p>
      <dl>
        {(review.went_well || []).length > 0 && <div><dt>Went well</dt><dd>{review.went_well.map((x) => <p key={x}>{x}</p>)}</dd></div>}
        {(review.work_on || []).length > 0 && <div><dt>Work on</dt><dd>{review.work_on.map((x) => <p key={x}>{x}</p>)}</dd></div>}
        {review.knee && <div><dt>Knee</dt><dd>{review.knee}</dd></div>}
        {review.change && <div><dt>What changes</dt><dd style={{ color: 'var(--ink)' }}>{review.change}</dd></div>}
      </dl>
    </section>}
  </>}</Sheet>;
}

// The latest run, set the same way as Today's "run done": distance big, time and pace beside it, splits as bars.
function LatestRunHero({ run, openRun }) {
  const sp = splitSecs(run);
  const lo = Math.min(...sp), hi = Math.max(...sp), mid = [...sp].sort((a, b) => a - b)[Math.floor(sp.length / 2)];
  return <section className="hero tap" onClick={() => openRun(run)}><Tick />
    <div className="done-t" style={{ marginBottom: 14 }}><span style={{ color: 'var(--ink)', fontWeight: 600 }}>Last run</span><span>{new Date(run.start || run.date + 'T12:00:00').toLocaleString('en-GB', run.start ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
    <div className="h-row" style={{ justifyContent: 'space-between' }}><div className="big long"><Count v={+run.km} fmt={(x) => (Number.isInteger(+run.km) ? String(Math.round(x)) : x.toFixed(String(run.km).split('.')[1].length))} /><small>km</small></div>
      <div className="side"><div><b><Count v={run.secs} fmt={mmss} /></b><span>time</span></div><div><b><Count v={run.pace_s_per_km} fmt={mmss} /></b><span>per km</span></div></div></div>
    {sp.length > 1 && <div className="sp" role="img" aria-label="Kilometre splits, taller is faster, hatched is where you faded">{sp.map((x, i) => <div key={i} className={x > mid * 1.05 ? 'slow' : x === lo && hi !== lo ? 'fast' : ''}><u className="rise" style={{ '--i': i * 2, height: 14 + (hi === lo ? 14 : ((hi - x) / (hi - lo)) * 30) }} /><b>{t(x)}</b><span>km {i + 1}</span></div>)}</div>}
    <a role="button" className="golink" style={{ marginTop: 16, paddingTop: 13, borderTop: '1px solid var(--line)' }}>Open the run<span>{[run.hr_avg && `${run.hr_avg} bpm`, 'knee check-in and review'].filter(Boolean).join(', ')}</span><i className="ph-bold ph-caret-right" /></a>
  </section>;
}

function Runs({ data, openRun, reload }) {
  const [add, setAdd] = useState(false), [f, setF] = useState({ date: iso(), km: '', minutes: '' }), [err, setErr] = useState('');
  const save = async (close) => { setErr(''); try { await api('/api/runs', { method: 'POST', body: JSON.stringify({ run: f }) }); buzz([10, 50, 16]); close(); await reload(); } catch (e) { setErr(e.message); buzz([30, 60, 30]); } };
  const [reading, setReading] = useState(false);
  const readShot = (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const img = new Image(), fr = new FileReader();
    fr.onload = () => { img.src = fr.result; };
    img.onload = async () => {   // shrink to 1600 px tall so the upload stays small
      const k = Math.min(1, 1600 / img.height), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      setReading(true); setErr('');
      try { await api('/api/coach', { method: 'POST', body: JSON.stringify({ action: 'read', image: c.toDataURL('image/jpeg', 0.85) }) }); await reload(); } catch (er) { setErr(er.message); }
      setReading(false);
    };
    fr.readAsDataURL(file);
  };
  const none = data.runs.length === 0, list = [...data.runs].reverse(), latest = list[0], older = list.slice(1);
  return <div>
    <header className="top"><div><h1 data-lt>Runs</h1><p className="sub">They arrive from your watch when you close its phone app.</p></div></header>
    {none && <section className="empty">
      <svg className="ghosted" viewBox="0 0 350 60" aria-hidden="true"><path d="M0 50 C40 50 50 22 90 20 S150 16 200 14 S300 12 350 10" fill="none" stroke="#3A3E33" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" /><line x1="0" x2="350" y1="56" y2="56" stroke="#2B2E26" /></svg>
      <h2>No runs yet</h2><p>Start a workout on the watch (Outdoor Running), then close the watch's phone app. If it doesn't arrive, add it below.</p>
    </section>}
    {latest && <LatestRunHero run={latest} openRun={openRun} />}
    {older.length > 0 && <div className="h4" style={{ marginTop: 26 }}>Earlier runs<span>{older.length}</span></div>}
    {older.map((r, i) => <div className="runrow tap st" style={{ '--i': i }} key={r.id} onClick={() => openRun(r)}><Tick />
      <div className="d">{r.km}<small>km</small></div>
      <div><h3>{dayName(r.date)} {dayNum(r.date)}</h3><p>{[t(r.secs), pace(r.pace_s_per_km), r.hr_avg ? `${r.hr_avg} bpm` : null].filter(Boolean).join(', ')}</p></div>
      {(() => { const sp = splitSecs(r); if (sp.length < 2) return <i className="ph-bold ph-caret-right" />; const lo = Math.min(...sp), hi = Math.max(...sp);
        return <div className="mini" aria-hidden="true">{sp.map((x, k) => <u key={k} className="rise" style={{ '--i': k * 2 + 6, height: 8 + (hi === lo ? 10 : ((hi - x) / (hi - lo)) * 20) }} />)}</div>; })()}
    </div>)}
    <div style={{ marginTop: 20 }}>
      <label className={`btn ${none ? '' : 'ghost'} ${reading ? 'busy' : ''}`}><i className="ph ph-image" />{reading ? 'Coach is reading it…' : 'Upload a screenshot of the run'}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={readShot} /></label>
      <button className="ghost" onClick={() => setAdd(true)}><i className="ph ph-pencil-simple-line" />Add a run by hand</button>
    </div>
    {err && !add && <p className="err">{err}</p>}
    {add && <Sheet onClose={() => setAdd(false)}>{(close) => <>
      <div className="sh-top"><h2 style={{ color: 'var(--ink)' }}>Add a run</h2><a className="close" onClick={close}>Close<i className="ph-bold ph-x" /></a></div>
      <label>Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      <label>Distance (km)<input inputMode="decimal" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} /></label>
      <label>Time (minutes, e.g. 27.5)<input inputMode="decimal" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></label>
      <button onClick={() => save(close)}><Tick />Save run</button>{err && <p className="err">{err}</p>}
    </>}</Sheet>}
  </div>;
}
