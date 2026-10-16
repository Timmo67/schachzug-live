import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { TIME_CONTROLS } from '../game/onlineGame';
import './random.css';

const POLL_MS = 2000;
/** After this long without an opponent the search stops with a hint. */
const GIVE_UP_MS = 90_000;
const CHOICES = TIME_CONTROLS.filter((t) => t.id !== 'none');

type State = { kind: 'idle' } | { kind: 'searching'; since: number; window: number } | { kind: 'nobody' } | { kind: 'banned' } | { kind: 'error' };

/** Find an opponent of similar strength (free for everyone). No video and only fixed chat phrases. */
export function RandomPage() {
  const { session, ready, profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [tc, setTc] = useState('5+0');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const searching = useRef(false);

  const stop = useCallback(async (cancel: boolean) => {
    searching.current = false;
    clearTimeout(timer.current);
    if (cancel && supabase) await supabase.rpc('cancel_match');
  }, []);

  useEffect(() => { void refresh(); return () => { void stop(true); }; }, [refresh, stop]);
  useEffect(() => { if (profile?.random_banned) setState({ kind: 'banned' }); }, [profile?.random_banned]);

  async function poll(since: number) {
    if (!supabase || !searching.current) return;
    const { data, error } = await supabase.rpc('find_match', { p_time_control: tc });
    if (!searching.current) return;
    if (error) {
      await stop(false);
      setState(error.message.includes('random_banned') ? { kind: 'banned' } : { kind: 'error' });
      return;
    }
    const r = data as { game_id?: string; window?: number };
    if (r.game_id) { await stop(false); navigate(`/partie/${r.game_id}`); return; }
    if (Date.now() - since > GIVE_UP_MS) { await stop(true); setState({ kind: 'nobody' }); return; }
    setState({ kind: 'searching', since, window: r.window ?? 100 });
    timer.current = setTimeout(() => void poll(since), POLL_MS);
  }

  function start() {
    searching.current = true;
    const since = Date.now();
    setState({ kind: 'searching', since, window: 100 });
    void poll(since);
  }

  if (ready && !session) return <Navigate to="/anmelden" replace />;

  return (
    <div className="grid2">
      <section className="panel" data-testid="random">
        <h1>Zufallsgegner</h1>
        <p className="note">Spiel gegen jemanden mit ähnlicher Spielstärke. Deine Spielstärke: <b data-testid="random-rating">{profile?.random_rating ?? 1200}</b>.</p>

        {state.kind === 'banned' ? (
          <p className="error" role="alert" data-testid="random-state">Du bist wegen Meldungen anderer Spieler vorläufig von Zufallspartien ausgeschlossen. Partien mit Freunden gehen weiter.</p>
        ) : state.kind === 'searching' ? (
          <>
            <div className="searching" data-testid="random-state" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              Suche Gegner für {CHOICES.find((c) => c.id === tc)?.label} … {Math.round((Date.now() - state.since) / 1000)} s
            </div>
            <p className="note">Suchbereich: ±{state.window} Wertungspunkte – wird größer, je länger du wartest.</p>
            <button type="button" onClick={() => { void stop(true); setState({ kind: 'idle' }); }}>Suche abbrechen</button>
          </>
        ) : (
          <>
            <span className="lbl">Bedenkzeit</span>
            <div className="row" role="radiogroup" aria-label="Bedenkzeit">
              {CHOICES.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={tc === c.id} className={`chip${tc === c.id ? ' on' : ''}`} onClick={() => setTc(c.id)}>{c.label}</button>
              ))}
            </div>
            <button type="button" className="primary" onClick={start}>Gegner suchen</button>
            {state.kind === 'nobody' && <p className="note" role="status" data-testid="random-state">Gerade ist niemand da. Versuch es später noch einmal – oder <Link to="/freunde">fordere einen Freund heraus</Link>.</p>}
            {state.kind === 'error' && <p className="error" role="alert">Die Suche hat nicht geklappt. Bitte versuch es noch einmal.</p>}
          </>
        )}
      </section>
      <section className="panel">
        <h2>Fair und sicher</h2>
        <ul className="note steps">
          <li>Kein Video mit Fremden – das gibt es nur mit Freunden.</li>
          <li>Im Chat gehen nur feste Kurzsätze wie „Viel Glück!“ oder „Gutes Spiel!“.</li>
          <li>Wer nicht innerhalb von 30 Sekunden zieht, dessen Partie wird abgebrochen und zählt nicht.</li>
          <li>Nach der Partie kannst du den Gegner als Freund anfragen, melden oder blockieren.</li>
        </ul>
      </section>
    </div>
  );
}
