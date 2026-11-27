// The app shell: loads the data, switches tabs, opens the sheets, and starts React.
/* global api, buzz, Form, Fresh, KEY, Plan, REDUCE, RunDetail, Runs, SessionSheet, Setup, Tick, Today, todayView, useEffect, useFresh, useRef, useState */

const TABS = [['today', 'sun-horizon', 'Today'], ['plan', 'calendar-dots', 'Plan'], ['runs', 'sneaker-move', 'Runs'], ['form', 'person-simple-run', 'Form']];
function View({ id, pinned, dir, children }) {
  const fresh = useFresh(id);
  return <main className={`page ${pinned ? 'has-cta' : ''} ${fresh ? 'fresh' : ''} ${dir ? 'enter' : ''}`}><Fresh.Provider value={fresh}>{children}</Fresh.Provider></main>;
}
const Skeleton = () => <main className="page" aria-busy="true" aria-label="Loading"><div className="sk" style={{ width: 120, height: 34 }} /><div className="sk" style={{ width: 230, height: 118, marginTop: 30 }} /><div className="sk" style={{ height: 50, marginTop: 24 }} /><div className="sk" style={{ height: 96, marginTop: 18, borderRadius: 22 }} /><div className="sk" style={{ height: 120, marginTop: 14, borderRadius: 22 }} /></main>;

function App() {
  const [hasKey, setHasKey] = useState(!!localStorage.getItem(KEY));
  const [tab, setTab] = useState('today'), [data, setData] = useState(null), [err, setErr] = useState(''), [run, setRun] = useState(null), [sess, setSess] = useState(null), [scrolled, setScrolled] = useState(false), moved = useRef(0);
  const load = async () => {
    try {
      const [r, c] = await Promise.all([api('/api/runs'), api('/api/coach')]);
      setData({ runs: r.runs, checkins: r.checkins, coach: c, goal: c.goal });
      if (run) setRun(r.runs.find((x) => x.id === run.id) || null);
      setErr('');
    } catch (e) { setErr(e.message); if (/wrong key/.test(e.message)) { localStorage.removeItem(KEY); setHasKey(false); } }
  };
  useEffect(() => { if (hasKey) load(); }, [hasKey]);
  // Changing tab: the page you leave slides out towards the side you came from, the new one arrives from the side you tapped.
  const go = (x) => {
    if (x === tab) { window.scrollTo({ top: 0, behavior: REDUCE.matches ? 'auto' : 'smooth' }); return; }
    const ix = (k) => TABS.findIndex((q) => q[0] === k), dir = ix(x) > ix(tab) ? 1 : -1; moved.current = dir;
    document.documentElement.style.setProperty('--dir', dir); buzz(6);
    const old = document.querySelector('main.page'), layer = document.getElementById('ghosts');
    if (old && layer && !REDUCE.matches) {
      const g = old.cloneNode(true); g.classList.remove('fresh', 'enter'); g.classList.add('leaving'); g.style.top = `${-window.scrollY}px`; g.setAttribute('aria-hidden', 'true'); layer.replaceChildren(g);
      g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-22 * dir}px)` }], { duration: 150, easing: 'ease-in', fill: 'forwards' }).onfinish = () => g.remove();
    }
    ReactDOM.flushSync(() => { setTab(x); setScrolled(false); }); window.scrollTo(0, 0);
  };
  // The compact title shows once the large one has gone under the status bar.
  useEffect(() => {
    const el = document.querySelector('main.page:not(.leaving) [data-lt]'); if (!el || !window.IntersectionObserver) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { rootMargin: '-52px 0px 0px 0px' }); io.observe(el); return () => io.disconnect();
  }, [tab, !!data]);
  if (!hasKey) return <Setup onDone={() => setHasKey(true)} />;
  if (!data) return <>{err ? <p className="mute" style={{ position: 'relative', paddingTop: '30vh', textAlign: 'center' }}>{err}</p> : <Skeleton />}</>;
  const v = todayView(data), pinned = (tab === 'today' && !!v.cta) || (tab === 'plan' && !data.coach.plan);
  const P = { data, reload: load, openRun: setRun, openSession: setSess, go };
  return <>
    <div id="ghosts" />
    <View key={tab} id={tab} pinned={pinned} dir={moved.current}>{tab === 'today' && <Today {...P} />}{tab === 'plan' && <Plan {...P} />}{tab === 'runs' && <Runs {...P} />}{tab === 'form' && <Form {...P} />}</View>
    <div className={`edge ${pinned ? 'tall' : ''}`} aria-hidden="true" />
    <div className={`bar ${scrolled ? 'on' : ''}`} aria-hidden="true"><b>{TABS.find((q) => q[0] === tab)[2]}</b></div>
    <nav className="tabs"><span className="pill" style={{ transform: `translateX(${TABS.findIndex((q) => q[0] === tab) * 100}%)` }} />{TABS.map(([x, icon, name]) => <a key={x} role="button" aria-current={tab === x ? 'page' : undefined} className={tab === x ? 'on' : ''} onClick={() => go(x)}><Tick /><i className={`${tab === x ? 'ph-fill' : 'ph'} ph-${icon}`} /><span>{name}</span></a>)}</nav>
    {run && <RunDetail run={run} {...P} close={() => setRun(null)} />}
    {sess && <SessionSheet s={sess} close={() => setSess(null)} />}
  </>;
}
// iOS only shows :active press states when the page has a touch listener.
document.addEventListener('touchstart', () => {}, { passive: true });
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
