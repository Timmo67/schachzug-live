import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Eval } from '../analysis/analysisLogic';
import { Engine } from '../analysis/engine';
import { analyzeMoves } from '../analysis/runAnalysis';
import { buildProfile, type AnalysedGame, type Profile, type ThemeStat } from './trainingLogic';
import './training.css';

type Status = { plus: boolean; games: number; needed: number };
type Step = { kind: 'loading' } | { kind: 'analysing'; done: number; total: number } | { kind: 'ready'; profile: Profile } | { kind: 'error' };

/** Games used for the profile: the most recent finished games with at least 10 moves each. */
const MAX_GAMES = 20;

const PHASE_NAME = { opening: 'Eröffnung', middlegame: 'Mittelspiel', endgame: 'Endspiel' } as const;

/** Personal training (Plus): after 10 games, lessons for the player's typical mistakes. */
export function TrainingPage() {
  const { session, ready } = useAuth();
  const me = session?.user.id;
  const [status, setStatus] = useState<Status | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const engine = useRef<Engine | null>(null);

  useEffect(() => {
    if (!supabase || !me) return;
    void supabase.rpc('training_status').then(({ data }) => setStatus(data as Status));
    void supabase.rpc('puzzle_status').then(({ data }) => setRating((data as { rating: number } | null)?.rating ?? null));
  }, [me]);

  const unlocked = !!status && status.plus && status.games >= status.needed;

  // Analyse the games that have no analysis yet (on this device), then build the profile.
  useEffect(() => {
    if (!supabase || !me || !unlocked) return;
    const client = supabase;
    let alive = true;
    void (async () => {
      try {
        const { data: rows } = await client.from('games').select('id, white_id, moves_uci')
          .eq('status', 'finished').order('finished_at', { ascending: false }).limit(60);
        const games = ((rows ?? []) as Array<{ id: string; white_id: string; moves_uci: string[] }>)
          .filter((g) => g.moves_uci.length >= 20).slice(0, MAX_GAMES);
        const { data: stored } = await client.from('game_analyses').select('game_id, evals').in('game_id', games.map((g) => g.id));
        const evals = new Map(((stored ?? []) as Array<{ game_id: string; evals: Eval[] | null }>).filter((r) => r.evals).map((r) => [r.game_id, r.evals!]));
        const missing = games.filter((g) => !evals.has(g.id));
        if (missing.length) {
          engine.current ??= new Engine();
          for (let i = 0; i < missing.length && alive; i++) {
            setStep({ kind: 'analysing', done: i, total: missing.length });
            const g = missing[i];
            const { data: prev, error } = await client.rpc('begin_analysis', { p_game: g.id });
            if (error) continue;
            const result = (prev as Eval[] | null) ?? await analyzeMoves(engine.current, g.moves_uci);
            if (!prev) await client.rpc('save_analysis', { p_game: g.id, p_evals: result });
            evals.set(g.id, result);
          }
        }
        if (!alive) return;
        const analysed: AnalysedGame[] = games.filter((g) => evals.has(g.id))
          .map((g) => ({ moves: g.moves_uci, color: g.white_id === me ? 'w' : 'b', evals: evals.get(g.id)! }));
        const { data: themes } = await client.rpc('puzzle_theme_stats');
        setStep({ kind: 'ready', profile: buildProfile(analysed, (themes ?? []) as ThemeStat[]) });
      } catch {
        if (alive) setStep({ kind: 'error' });
      }
    })();
    return () => { alive = false; engine.current?.stop(); engine.current = null; };
  }, [me, unlocked]);

  if (ready && !session) return <Navigate to="/anmelden" replace />;

  const puzzlesCard = (
    <section className="panel">
      <h2>Rätsel</h2>
      <p className="note">Taktikaufgaben passend zu deiner Stärke{rating ? ` – deine Rätsel-Wertung: ${rating}` : ''}.{status && !status.plus ? ' Gratis: 1 Rätsel pro Tag.' : ''}</p>
      <Link className="btn primary" to="/raetsel">Rätsel lösen</Link>
    </section>
  );

  let main;
  if (!status) {
    main = <section className="panel"><p className="muted">Wird geladen …</p></section>;
  } else if (!status.plus) {
    main = (
      <section className="panel" data-testid="training">
        <h1>Persönliches Training</h1>
        <p>Knightcall schaut sich deine Partien an, findet deine typischen Fehler und stellt dir passende Lektionen zusammen. Das gibt es mit <b>Plus</b>.</p>
      </section>
    );
  } else if (status.games < status.needed) {
    const left = status.needed - status.games;
    main = (
      <section className="panel" data-testid="training">
        <h1>Persönliches Training</h1>
        <p>Dein persönliches Training startet nach <b>{status.needed} beendeten Partien</b>. Dann kennt Knightcall deine typischen Fehler gut genug, um passende Lektionen vorzuschlagen.</p>
        <progress max={status.needed} value={status.games} aria-label="Partien bis zum Training" />
        <p className="note" data-testid="training-progress">{status.games} von {status.needed} Partien – noch {left === 1 ? 'eine Partie' : `${left} Partien`}. Es zählen Partien mit mindestens 10 Zügen.</p>
        <div className="row"><Link className="btn" to="/freunde">Freund herausfordern</Link></div>
      </section>
    );
  } else if (step.kind === 'ready') {
    const p = step.profile;
    main = (
      <section className="panel" data-testid="training">
        <h1>Persönliches Training</h1>
        <p className="note">Ausgewertet: deine letzten {p.games} Partien ({p.moves} Züge).</p>
        <div className="phasegrid">
          <div><span className="lbl">Genauigkeit</span><b>{p.accuracy} %</b></div>
          {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
            <div key={ph}><span className="lbl">{PHASE_NAME[ph]}</span><b>{p.phases[ph].moves ? `${p.phases[ph].accuracy} %` : '–'}</b></div>
          ))}
        </div>
        <span className="lbl">Deine Lektionen</span>
        <div className="lessons" data-testid="lessons">
          {p.lessons.map((l, i) => (
            <article key={l.id} className="lesson">
              <h3>{i + 1}. {l.title}</h3>
              <p className="reason">{l.reason}</p>
              <p className="note">{l.text}</p>
              <Link className="btn primary" to={`/raetsel?lektion=${l.id}`}>Üben</Link>
            </article>
          ))}
        </div>
        <p className="note">Die Lektionen passen sich an, je mehr du spielst.</p>
      </section>
    );
  } else if (step.kind === 'analysing') {
    main = (
      <section className="panel" data-testid="training">
        <h1>Persönliches Training</h1>
        <p>Ich schaue mir deine Partien an … {step.done} / {step.total}</p>
        <progress max={step.total} value={step.done} aria-label="Partien werden ausgewertet" />
        <p className="note">Das passiert einmalig auf deinem Gerät und dauert etwas – lass die Seite offen.</p>
      </section>
    );
  } else {
    main = (
      <section className="panel" data-testid="training">
        <h1>Persönliches Training</h1>
        <p className={step.kind === 'error' ? 'error' : 'muted'}>{step.kind === 'error' ? 'Die Auswertung hat nicht geklappt. Bitte lade die Seite neu.' : 'Wird vorbereitet …'}</p>
      </section>
    );
  }

  return <div className="grid2">{main}{puzzlesCard}</div>;
}
