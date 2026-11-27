// The Plan tab: the two week block as a chart, the mix of easy and hard, and every session.
/* global api, Count, Cta, dayName, dayNum, HARD, iso, kmFmt, kmLabel, readSession, RUNNING, sentences, stepLine, useState */
/* exported Plan */

function Plan({ data, reload, openSession }) {
  const { coach } = data;
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [full, setFull] = useState(false);
  const go = async () => { setBusy(true); setErr(''); try { await api('/api/coach', { method: 'POST', body: JSON.stringify({ action: 'plan' }) }); await reload(); } catch (e) { setErr(e.message); } setBusy(false); };
  if (!coach.plan) return <div>
    <header className="top"><h1 data-lt>Plan</h1><span className="draft"><i className="ph ph-pencil-simple-line" />Not written yet</span></header>
    <section className="empty">
      <svg className="ghosted" viewBox="0 0 350 60" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <rect key={i} x={4 + i * 25 + (i > 6 ? 6 : 0)} y="42" width="18" height="3" rx="1.5" fill="#3A3E33" />)}<line x1="0" x2="350" y1="56" y2="56" stroke="#2B2E26" strokeDasharray="2 5" /></svg>
      <h2>No plan yet</h2><p>It's written from your runs, your form and your knee. Two weeks at a time, and the knee rules check every session.</p>
    </section>
    <Cta disabled={busy} busy={busy} onClick={go}><i className="ph-bold ph-pencil-simple-line" />{busy ? 'Writing…' : 'Write my plan'}</Cta>{err && <p className="err">{err}</p>}
  </div>;
  const weeks = coach.plan.weeks || [], all = weeks.flatMap((w) => w.sessions || []);
  const size = (s) => (RUNNING(s) ? (s.km != null ? s.km : (s.minutes || 0) / 7) : 0), max = Math.max(1, ...all.map(size));
  const mins = (list, f) => list.filter(RUNNING).filter(f).reduce((n, s) => n + (s.minutes || 0), 0);
  const hardAll = mins(all, (s) => HARD.test(s.type)), totAll = mins(all, () => true) || 1, easyPct = Math.round(100 - (hardAll / totAll) * 100);
  const step = Math.min(25, 346 / Math.max(1, all.length));
  const mark = (all.find((s) => RUNNING(s) && s.date >= iso()) || {}).date;
  const totKm = Math.round(all.filter(RUNNING).reduce((n, s) => n + (s.km || 0), 0) * 10) / 10, nRuns = all.filter(RUNNING).length;
  return <div>
    <header className="top"><div><h1 data-lt>Plan</h1><p className="sub">{all.length > 0 && `${dayName(all[0].date)} ${dayNum(all[0].date)} to ${new Date(all[all.length - 1].date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}`}</p></div></header>
    <section className="hero"><div className="h-row"><div className="big long"><Count v={kmLabel(totKm)} fmt={kmFmt(totKm)} /><small>km</small></div>
      <div className="h-t"><h2>{nRuns} runs in {weeks.length === 1 ? 'a week' : `${weeks.length} weeks`}</h2><p>{hardAll > 0 ? `${easyPct}% easy, ${100 - easyPct}% hard` : 'All easy. No hard running yet.'}</p></div></div></section>
    {coach.plan.summary && <div className="sumr" style={{ marginTop: 18 }} onClick={() => setFull(!full)}><p className={`sub ${full ? '' : 'clamp'}`} style={{ fontSize: 14, lineHeight: 1.4, marginTop: 0 }}>{coach.plan.summary}</p><em>{full ? 'Less' : 'Read more'}</em></div>}
    <svg viewBox="0 0 350 78" style={{ marginTop: 16 }} role="img" aria-label="Distance per day across the plan">
      {all.map((s, i) => { const v = size(s), x = 4 + i * step, w = Math.min(18, step - 5), h = v ? 8 + (v / max) * 34 : 3, now = s.date === mark, hot = HARD.test(s.type) || now;
        return <g key={s.date + s.title}>{now && <rect className="fadein" x={x - 3.5} y="0" width={w + 7} height="78" rx="6" fill="#1D2019" />}
          <rect className="rise" style={{ '--i': i }} x={x} y={58 - h} width={w} height={h} rx="3" fill={v ? (hot ? 'var(--hi)' : '#D9D8CC') : '#3A3E33'} />
          {v > 0 && <text className="fadein" x={x + w / 2} y={58 - h - 5} textAnchor="middle" fontSize="17" fontWeight="800" fill={hot ? '#E1FF45' : '#F2F1E8'} fontFamily="Big Shoulders Display">{s.km != null ? kmLabel(s.km) : `${s.minutes}'`}</text>}
          <text x={x + w / 2} y="73" textAnchor="middle" fontSize="11" fill={now ? '#F2F1E8' : '#74766A'} fontWeight={now ? 600 : 400}>{dayName(s.date)[0]}</text></g>; })}
    </svg>
    <div className={`mixbar growx ${hardAll ? '' : 'all'}`}><i style={{ width: `${easyPct}%` }} />{hardAll > 0 && <i className="h" />}</div>
    <div className="mix-l"><span><b>{easyPct}%</b> easy</span><span>{hardAll > 0 ? <><b>{100 - easyPct}%</b> hard</> : 'No hard running in this block'}</span></div>
    {coach.changes && coach.changes.length > 0 && <section className="chg"><h4><i className="ph-fill ph-shield-check" />Your knee rules changed {coach.changes.length} thing{coach.changes.length > 1 ? 's' : ''}</h4>{coach.changes.map((c) => <p key={c}>{String(c).replace(/^(\d{4}-\d{2}-\d{2}):/, (_, d) => `${dayName(d)} ${dayNum(d)}:`)}</p>)}</section>}
    {weeks.map((w, i) => {
      const km = (w.sessions || []).filter(RUNNING).reduce((n, s) => n + (s.km || 0), 0);
      return <div key={i}>
        <div className="wkh"><b>{w.label}</b>{km > 0 && <span className="t">{kmLabel(km)} km</span>}</div>
        {w.focus && <p className="focus">{w.focus}</p>}
        {(w.sessions || []).map((s, j) => <div role="button" style={{ '--i': i * 7 + j }} className={`row tap st ${s.date === mark ? 'now' : ''} ${HARD.test(s.type) ? 'hard' : ''} ${RUNNING(s) ? '' : 'rest'}`} key={s.date + s.title} onClick={() => openSession(s)}>
          <div className="when"><b>{dayName(s.date)}</b><span>{dayNum(s.date)}</span></div><div className="rail"><i /></div>
          <div className="what"><h3>{s.title}{s.rule && <i className="ph-fill ph-shield-check" aria-label="Adjusted by the knee rules" />}{s.date === mark && <em>{s.date === iso() ? 'Today' : 'Next'}</em>}</h3>
            {RUNNING(s) && <p>{stepLine(readSession(s).steps) || sentences(s.structure)[0] || s.pace}</p>}
            {RUNNING(s) && <p className="meta">{[s.minutes != null && `${s.minutes} min`, s.hr_cap != null && `under ${s.hr_cap} bpm`].filter(Boolean).join(', ')}</p>}</div>
          <div className="km">{RUNNING(s) && s.km != null ? <><span>{kmLabel(s.km)}</span><small>km</small></> : RUNNING(s) && s.minutes != null ? <><span>{s.minutes}</span><small>min</small></> : null}</div>
          <i className="ph-bold ph-caret-right go" />
        </div>)}
      </div>;
    })}
    <button className={`ghost ${busy ? 'busy' : ''}`} style={{ marginTop: 24 }} disabled={busy} onClick={go}><i className="ph ph-arrows-clockwise" />{busy ? 'Rewriting…' : 'Rewrite the plan'}</button>{err && <p className="err">{err}</p>}
  </div>;
}
