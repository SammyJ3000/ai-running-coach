// First launch: the passphrase screen.
/* global KEY, Tick, useState */
/* exported Setup */

function Setup({ onDone }) {
  const [k, setK] = useState('');
  return <main className="page"><div className="setup"><div className="n">COACH</div><p>Type the app's passphrase once. It stays on this phone.</p>
    <input type="password" value={k} onChange={(e) => setK(e.target.value)} placeholder="Passphrase" />
    <button onClick={() => { localStorage.setItem(KEY, k.trim()); onDone(); }}><Tick />Continue</button></div></main>;
}
