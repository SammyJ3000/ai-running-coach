// Motion and haptics: how the app moves. No data logic lives here.
/* exported buzz, clock, IOS, RATE, REDUCE, rubber, springTo */

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');
// One clock for the hand-stepped animations. ?slow=0.1 runs them at a tenth speed, for checking motion frame by frame.
const RATE = +new URLSearchParams(location.search).get('slow') || 1, clock = () => performance.now() * RATE;
// iOS has no navigator.vibrate. The one haptic Safari gives a web page is the system tick of a switch toggled by a real finger
// (a scripted click stopped working in iOS 26.5), so <Tick /> lays an invisible label wired to a hidden switch over a control.
// Same idea as the ios-haptics library (MIT). It only fires on the tap itself: never after a wait, a timer or during a drag.
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /[?&]tick\b/.test(location.search);
// Android and anything else with the Vibration API. Does nothing on iPhone.
const buzz = (pattern = 8) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* blocked by a permissions policy: no haptic, nothing else to do */ } };

// A damped spring, stepped by hand so a drag can hand it the finger's speed and grab it back mid-flight.
function springTo(get, set, to, v0, zeta, k, done) {
  let x = get(), v = v0, last = clock(), raf; const c = 2 * zeta * Math.sqrt(k);
  const tick = () => {
    const now = clock(), dt = Math.min(0.034, (now - last) / 1000); last = now;
    for (let n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n, i = 0; i < n; i++) { v += (-k * (x - to) - c * v) * h; x += v * h; }
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 10) { set(to); done && done(); return; }
    set(x); raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
}
const rubber = (over, size) => (1 - 1 / ((over * 0.55) / size + 1)) * size;
