// Shared building blocks: the haptic tick, numbers that count up, the bottom sheet and the pinned action button.
/* global buzz, clock, IOS, REDUCE, rubber, springTo */
/* exported Count, Cta, Fresh, Sheet, Tick, useContext, useEffect, useFresh, useLayoutEffect, useRef, useState */

// React's hooks, used by every component file.
const { useState, useEffect, useLayoutEffect, useRef, useContext, createContext } = React;

// The haptic switch for iOS (see IOS in motion.js).
const Tick = () => (IOS ? <label className="tick" aria-hidden="true"><input type="checkbox" switch="" tabIndex={-1} onClick={(e) => e.stopPropagation()} /></label> : null);

// Things animate in the first time you see them in a launch, not on every visit.
const SEEN = new Set(), Fresh = createContext(false);
function useFresh(key) { const r = useRef(null); if (r.current === null) r.current = !SEEN.has(key) && !REDUCE.matches; useEffect(() => { SEEN.add(key); }, [key]); return r.current; }
// A number that counts up to its value on first view. The text is set by hand so React never fights the animation.
function Count({ v, fmt = (x) => String(Math.round(x)), ms = 850, delay = 140 }) {
  const fresh = useContext(Fresh), el = useRef(), ran = useRef(false);
  useLayoutEffect(() => {
    const node = el.current, num = typeof v === 'number' && isFinite(v); node.textContent = num ? fmt(v) : v == null ? '–' : v;
    if (!fresh || ran.current || !num) return; ran.current = true;
    let raf, t0; node.textContent = fmt(0);
    const step = () => { const now = clock(); t0 = t0 || now; const k = Math.min(1, Math.max(0, (now - t0 - delay) / ms)); node.textContent = fmt(v * (1 - Math.pow(1 - k, 4))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => { cancelAnimationFrame(raf); node.textContent = fmt(v); };
  }, [v]);
  return <bdi ref={el} />;
}

// Bottom sheet. Rises on a spring (no bounce), follows the finger 1:1, and on release decides from where the flick is heading:
// past halfway or a quick flick down dismisses, anything else springs back. Dragging up past the top meets rubber-band resistance.
function Sheet({ onClose, children }) {
  const root = useRef(), panel = useRef(), scrim = useRef(), S = useRef({ y: 0, h: 1, stop: null, closing: false, drag: null }).current;
  const set = (y) => { S.y = y; if (!panel.current) return; const yy = y < 0 ? -rubber(-y, S.h) : y; panel.current.style.transform = `translate3d(0,${yy.toFixed(1)}px,0)`; scrim.current.style.opacity = Math.max(0, Math.min(1, 1 - yy / S.h)).toFixed(3); };
  const go = (to, v, zeta, k, done) => { if (S.stop) S.stop(); if (REDUCE.matches) { set(to); if (done) done(); return; } S.stop = springTo(() => S.y, set, to, v, zeta, k, done); };
  const close = (v) => { if (S.closing) return; S.closing = true; root.current.style.pointerEvents = 'none'; go(S.h, Math.max(typeof v === 'number' ? v : 0, 0), 1, 520, onClose); };
  useLayoutEffect(() => {
    S.h = panel.current.offsetHeight; set(S.h); go(0, 0, 1, 300);
    const doc = document.documentElement, was = doc.style.overflow; doc.style.overflow = 'hidden';
    const key = (e) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', key);
    const el = panel.current;
    const begin = (y, handle) => { if (S.closing) return; S.drag = { y0: y, base: S.y, handle, on: false, pts: [[clock(), y]] }; };
    const move = (y, e) => {
      const d = S.drag; if (!d) return;
      if (!d.on) { const dy = y - d.y0; if (Math.abs(dy) < 6) return; if (d.handle || (dy > 0 && el.scrollTop <= 0)) { d.on = true; d.y0 = y; d.base = S.y; if (S.stop) S.stop(); } else { S.drag = null; return; } }
      if (e && e.cancelable) e.preventDefault();
      d.pts.push([clock(), y]); if (d.pts.length > 6) d.pts.shift(); set(d.base + (y - d.y0));
    };
    const end = () => {
      const d = S.drag; S.drag = null; if (!d || !d.on) return;
      const a = d.pts[0], b = d.pts[d.pts.length - 1], v = b[0] > a[0] && clock() - b[0] < 90 ? ((b[1] - a[1]) / (b[0] - a[0])) * 1000 : 0;
      if (S.y + v * 0.2 > S.h * 0.5 || v > 800) { buzz(6); close(v); } else go(0, v, Math.abs(v) > 250 ? 0.82 : 1, 300, () => buzz(4));
    };
    const handle = (e) => !!e.target.closest('.grab, .sh-top');
    const ts = (e) => { if (e.touches.length === 1) begin(e.touches[0].clientY, handle(e)); }, tm = (e) => move(e.touches[0].clientY, e), te = () => end();
    el.addEventListener('touchstart', ts, { passive: true }); el.addEventListener('touchmove', tm, { passive: false }); el.addEventListener('touchend', te); el.addEventListener('touchcancel', te);
    const md = (e) => { if (e.pointerType !== 'mouse' || !handle(e)) return; begin(e.clientY, true); const mm = (ev) => move(ev.clientY, ev), mu = () => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); end(); }; window.addEventListener('pointermove', mm); window.addEventListener('pointerup', mu); };
    el.addEventListener('pointerdown', md);
    return () => { if (S.stop) S.stop(); doc.style.overflow = was; window.removeEventListener('keydown', key); };
  }, []);
  return ReactDOM.createPortal(<div className="sheet" ref={root}><div className="scrim" ref={scrim} onClick={() => close()} />
    <div className="panel fresh" ref={panel} role="dialog" aria-modal="true"><div className="grab" /><Fresh.Provider value={!REDUCE.matches}>{children(close)}</Fresh.Provider></div></div>, document.body);
}
// The one pinned action. It lives outside the page so it stays put while pages change.
const Cta = ({ children, ...p }) => ReactDOM.createPortal(<button className={`cta ${p.busy ? 'busy' : ''}`} disabled={p.disabled} onClick={(e) => { buzz(10); p.onClick && p.onClick(e); }}><Tick />{children}</button>, document.getElementById('dock'));
