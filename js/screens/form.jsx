// The Form tab: the clip with the skeleton drawn on, the one cue to work on, and the numbers.
/* global buzz, Count, RATE, REDUCE, Tick, useEffect, useRef, useState */
/* exported Form */

function Form({ data }) {
  const f = data.coach.form;
  if (!f) return <div>
    <header className="top"><h1 data-lt>Form</h1></header>
    <section className="empty">
      <svg className="ghosted" viewBox="0 0 350 150" aria-hidden="true"><g fill="none" stroke="#4A4E40" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7"><path d="M176 20 L170 70 L150 104 L146 138 M170 70 L196 102 L214 132 M176 26 L196 50 L186 60 M176 26 L160 52" /></g><circle cx="178" cy="10" r="7" fill="none" stroke="#4A4E40" strokeWidth="2" /><line x1="0" x2="350" y1="146" y2="146" stroke="#2B2E26" /></svg>
      <h2>No form analysis yet</h2><p>Your form analysis appears here once the walking-pad videos are processed: the skeleton on you, the numbers, and one thing to work on.</p>
    </section>
  </div>;
  const cues = f.cues || [], first = cues[0], M = f.metrics || [];
  const knee = M.find((m) => /knee bend at landing/i.test(m.name)), kv = knee && splitVal(knee.value);
  const cad = M.find((m) => /cadence/i.test(m.name)), cv = cad && splitVal(cad.value), aim = cad && String(cad.ref || '').match(/(\d{2,3})\s*[–-]\s*(\d{2,3})/);
  return <div>
    <header className="top"><div><h1 data-lt>Form</h1><p className="sub">{f.date ? `From your walking-pad videos, ${f.date}` : 'From your walking-pad videos'}</p></div></header>
    {cv && <section className="hero"><div className="h-row"><div className="big long">{cv.pre}<Count v={cv.num} fmt={(x) => x.toFixed(cv.dec)} />{cv.sym}{cv.unit && <small>{cv.unit}</small>}</div>
      <div className="h-t"><h2>{cad.name}</h2>{cad.ref && <p>{cad.ref[0].toUpperCase() + cad.ref.slice(1)}{aim ? ' steps a minute' : ''}</p>}</div></div></section>}
    {(f.video || f.still) && <FormShot f={f} kv={kv} />}
    {first && <section className="cue1"><h2>{first.cue}</h2>{first.why && <p>{first.why}</p>}
      {cv && aim && <CadenceGauge now={cv.num} lo={+aim[1]} hi={+aim[2]} />}
      {first.feel && <p><b>What to feel: </b>{first.feel}</p>}</section>}
    {M.length > 0 && <section className="mgrid">{M.map((m, i) => { const v = splitVal(m.value), tone = metricTone(m.ref);
      return <div key={m.name} className={`st ${tone}`} style={{ '--i': i }}>
        {v ? <b>{v.pre}<Count v={v.num} fmt={(x) => x.toFixed(v.dec)} delay={200 + i * 40} />{v.sym}{v.unit && <small>{v.unit}</small>}</b> : <b className="word">{m.value}</b>}
        <span>{m.name}</span>{m.ref && <em>{tone === 'ok' ? <i className="ph-bold ph-check" /> : tone === 'work' ? <i className="ph-bold ph-target" /> : null}{m.ref}</em>}</div>; })}</section>}
    {cues.slice(1).length > 0 && <section className="cues card">{cues.slice(1).map((c, i) => <div className="cue" key={i}><h3>{c.cue}</h3>{c.why && <p>{c.why}</p>}{c.feel && <p className="feel"><i className="ph ph-hand-waving" /><span>{c.feel}</span></p>}</div>)}</section>}
    <p className="note">Measured from your video. Not a clinical gait analysis.</p>
  </div>;
}
// "161 spm" -> sign, number, symbol and unit, so the number can be set big and count up. Words ("even") are left alone.
const splitVal = (x) => { const m = String(x).match(/^([+\-−]?)(\d+(?:\.\d+)?)\s*(°|%)?\s*(.*)$/); return m ? { pre: m[1], num: +m[2], dec: (m[2].split('.')[1] || '').length, sym: m[3] || '', unit: m[4] } : null; };
// Colour comes from the coach's own note on each number: green when it reads as fine, yellow when there is a target to move towards.
const metricTone = (ref) => (/healthy|good|symmetrical|normal/i.test(ref || '') ? 'ok' : /\baim\b|lower is better|higher is better/i.test(ref || '') ? 'work' : '');

// The clip, edge to edge. Tap the button to pause; the strip of ticks shows where the loop is.
function FormShot({ f, kv }) {
  const vid = useRef(), head = useRef(), fill = useRef(), strip = useRef(), [paused, setPaused] = useState(REDUCE.matches);
  useEffect(() => {
    const v = vid.current; if (!v) return; let raf; v.playbackRate = Math.max(0.07, RATE);
    const loop = () => { const k = v.duration ? v.currentTime / v.duration : 0, w = strip.current ? strip.current.clientWidth : 0; if (head.current) { head.current.style.transform = `translate3d(${(k * w).toFixed(1)}px,0,0)`; fill.current.style.clipPath = `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, []);
  const toggle = () => { const v = vid.current; if (!v) return; buzz(6); if (v.paused) { v.play(); setPaused(false); } else { v.pause(); setPaused(true); } };
  return <div className="shot">
    {f.video ? <video ref={vid} src={f.video} poster={f.still || undefined} autoPlay={!REDUCE.matches} muted loop playsInline /> : <img src={f.still} alt="A frame of you running, with the skeleton drawn on" />}
    {kv && <div className="shot-m"><b>{kv.pre}<Count v={kv.num} fmt={(x) => x.toFixed(kv.dec)} delay={300} />{kv.sym}</b><span>knee bend at landing<small>your typical landing</small></span></div>}
    {f.video && <div className="shot-b"><button className="play" aria-label={paused ? 'Play the clip' : 'Pause the clip'} onClick={toggle}><Tick /><i className={`ph-fill ph-${paused ? 'play' : 'pause'}`} /></button></div>}
    {f.video && <div className="scrub" ref={strip} aria-hidden="true"><b ref={fill} /><i ref={head} /></div>}
  </div>;
}
// Where the cadence is now against the range to aim for, one tick per step a minute.
function CadenceGauge({ now, lo, hi }) {
  const a = Math.floor((Math.min(now, lo) - 9) / 5) * 5, b = Math.ceil((Math.max(now, hi) + 6) / 5) * 5, X = (v) => 4 + ((v - a) / (b - a)) * 342;
  return <svg className="gauge" viewBox="0 0 350 66" role="img" aria-label={`Cadence ${now} steps a minute now, aim for ${lo} to ${hi}`}>
    <rect className="fadein" x={X(lo)} y="22" width={X(hi) - X(lo)} height="26" rx="5" fill="rgba(225,255,69,.13)" stroke="rgba(225,255,69,.35)" />
    {Array.from({ length: b - a + 1 }, (_, i) => { const v = a + i, on = v >= lo && v <= hi, big = v % 5 === 0; return <line key={v} className="rise" style={{ '--i': i * 0.6 }} x1={X(v)} x2={X(v)} y1={big ? 26 : 31} y2="44" stroke={on ? '#E1FF45' : big ? '#A3A394' : '#4A4E40'} strokeWidth="1.6" strokeLinecap="round" />; })}
    <g className="st" style={{ '--i': 6 }}><line x1={X(now)} x2={X(now)} y1="18" y2="50" stroke="#F2F1E8" strokeWidth="2.6" strokeLinecap="round" /><circle cx={X(now)} cy="18" r="4.5" fill="#F2F1E8" />
      <text className="gn" x={X(now)} y="11" textAnchor="middle" fill="#F2F1E8">{now}</text><text x={X(now)} y="64" textAnchor="middle" fontSize="12" fill="#A3A394">now</text></g>
    <text className="gn" x={(X(lo) + X(hi)) / 2} y="11" textAnchor="middle" fill="#E1FF45">{lo}–{hi}</text><text x={(X(lo) + X(hi)) / 2} y="64" textAnchor="middle" fontSize="12" fill="#E1FF45">aim here</text>
  </svg>;
}
