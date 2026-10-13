import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { PieceSymbol, Square } from 'chess.js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Board } from '../game/Board';
import { localSan, tryMove } from '../game/chessRules';
import { lessonById } from '../training/trainingLogic';
import { isCorrect, playerColor, positionAt, themeNames, type Puzzle } from './puzzleLogic';
import './puzzles.css';

type Stats = { rating: number; solved: number; failed: number; streak: number; plus: boolean; remaining_today: number | null };
type Phase = 'loading' | 'playing' | 'wrong' | 'solved' | 'revealed' | 'locked' | 'dailyDone' | 'empty' | 'error';

const OPPONENT_DELAY = 500;

/** Tactics puzzles near the player's rating (Plus). The server hands out puzzles and keeps the rating. */
export function PuzzlePage() {
  const { session, ready } = useAuth();
  const [params] = useSearchParams();
  const lesson = lessonById(params.get('lektion'));
  const lessonThemes = lesson?.themes.join(',') ?? null;
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [ply, setPly] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [stats, setStats] = useState<Stats | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const loadStats = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc('puzzle_status');
    if (data) setStats(data as Stats);
  }, []);

  const next = useCallback(async () => {
    if (!supabase) return;
    clearTimeout(timer.current);
    setPhase('loading'); setDelta(null); setFailedOnce(false); setPly(0);
    const { data, error } = lessonThemes
      ? await supabase.rpc('next_training_puzzle', { p_themes: lessonThemes.split(',') })
      : await supabase.rpc('next_puzzle');
    if (error) {
      setPuzzle(null);
      const m = error.message;
      setPhase(m.includes('training_requires_plus') ? 'locked' : m.includes('puzzle_requires_plus') ? 'dailyDone'
        : m.includes('no_puzzles_left') ? 'empty' : 'error');
      void loadStats();
      return;
    }
    const p = data as Puzzle;
    setPuzzle(p);
    setPhase('playing');
    // The opponent's move that sets up the puzzle, shown after a short pause.
    timer.current = setTimeout(() => setPly(1), OPPONENT_DELAY);
  }, [lessonThemes, loadStats]);

  useEffect(() => {
    if (!session) return;
    void loadStats();
    void next();
    return () => clearTimeout(timer.current);
  }, [session, loadStats, next]);

  const submit = useCallback(async (solved: boolean) => {
    if (!supabase || !puzzle) return;
    const { data } = await supabase.rpc('submit_puzzle', { p_puzzle: puzzle.id, p_solved: solved });
    if (data) setDelta((data as { delta: number }).delta);
    void loadStats();
  }, [puzzle, loadStats]);

  if (ready && !session) return <Navigate to="/anmelden" replace />;

  function onMove(from: Square, to: Square, promotion?: PieceSymbol) {
    if (!puzzle || phase !== 'playing' || ply % 2 !== 1) return;
    const uci = tryMove(positionAt(puzzle, ply), from, to, promotion);
    if (!uci) return;
    if (!isCorrect(puzzle, ply, uci)) {
      setPhase('wrong');
      if (!failedOnce) { setFailedOnce(true); void submit(false); }
      return;
    }
    const after = ply + 1;
    setPly(after);
    if (after >= puzzle.moves.length) {
      setPhase('solved');
      if (!failedOnce) void submit(true);
      return;
    }
    timer.current = setTimeout(() => setPly(after + 1), OPPONENT_DELAY);
  }

  function retry() { setPhase('playing'); }

  function reveal() {
    if (!puzzle) return;
    setPhase('revealed');
    // Plays the rest of the solution move by move.
    let p = ply;
    const step = () => {
      p += 1;
      setPly(p);
      if (p < puzzle.moves.length) timer.current = setTimeout(step, 700);
    };
    step();
  }

  const color = puzzle ? playerColor(puzzle) : 'w';
  const shown = puzzle ? positionAt(puzzle, ply) : null;
  const lastMove = puzzle && ply > 0 ? puzzle.moves[ply - 1] : null;
  const done = phase === 'solved' || phase === 'revealed';
  const statusText: Record<Phase, string> = {
    loading: 'Rätsel wird geladen …',
    playing: ply % 2 === 1 ? `Finde den besten Zug für ${color === 'w' ? 'Weiß' : 'Schwarz'}` : '…',
    wrong: 'Das war nicht der beste Zug.',
    solved: failedOnce ? 'Geschafft – im zweiten Anlauf.' : 'Richtig gelöst!',
    revealed: 'So geht die Lösung.',
    locked: 'Training gibt es mit Plus.',
    dailyDone: 'Dein Gratis-Rätsel für heute ist erledigt.',
    empty: 'Du hast alle Rätsel gelöst – Respekt!',
    error: 'Rätsel konnten nicht geladen werden.',
  };

  return (
    <div className="game">
      <div className="boardcol">
        {shown ? (
          <Board game={shown} orientation={color} interactive={phase === 'playing' && ply % 2 === 1}
            lastMove={lastMove} onMove={onMove} />
        ) : (
          <div className="panel"><p className="muted">{statusText[phase]}</p></div>
        )}
        <div className={`status${done ? ' end' : ''}${phase === 'wrong' ? ' bad' : ''}`} aria-live="polite" data-testid="puzzle-status">
          {statusText[phase]}
        </div>
        <div className="row">
          {phase === 'wrong' && <>
            <button type="button" className="primary" onClick={retry}>Nochmal versuchen</button>
            <button type="button" onClick={reveal}>Lösung zeigen</button>
          </>}
          {phase === 'playing' && ply % 2 === 1 && <button type="button" onClick={() => { if (!failedOnce) { setFailedOnce(true); void submit(false); } reveal(); }}>Lösung zeigen</button>}
          {(done || phase === 'error') && <button type="button" className="primary" onClick={() => void next()}>Nächstes Rätsel</button>}
        </div>
      </div>

      <aside className="panel">
        <h1>Rätsel</h1>
        {lesson && <p className="lessonhead" data-testid="lesson-title">Lektion: <b>{lesson.title}</b> · <Link to="/training">zurück zum Training</Link></p>}
        {phase === 'locked' || phase === 'dailyDone' ? (
          <>
            <p>{phase === 'dailyDone'
              ? 'Morgen wartet ein neues Gratis-Rätsel. Mit Plus löst du so viele Rätsel, wie du willst – passend zu deiner Spielstärke.'
              : 'Persönliche Lektionen und Rätsel nach Thema gibt es mit Plus.'}</p>
            <Link className="btn primary" to="/training">Zum Training</Link>
          </>
        ) : (
          <>
            <div className="puzzlestats">
              <div><span className="lbl">Deine Rätsel-Wertung</span><b data-testid="puzzle-rating">{stats?.rating ?? '–'}</b>
                {delta !== null && <span className={`delta ${delta >= 0 ? 'up' : 'down'}`} data-testid="puzzle-delta">{delta >= 0 ? `+${delta}` : delta}</span>}</div>
              <div><span className="lbl">Serie</span><b>{stats?.streak ?? 0}</b></div>
              <div><span className="lbl">Gelöst</span><b>{stats?.solved ?? 0}</b></div>
            </div>
            {puzzle && <p className="note">Rätsel-Schwierigkeit: {puzzle.rating}</p>}
            {stats && !stats.plus && <p className="note" data-testid="puzzle-free">Gratis: 1 Rätsel pro Tag. Mit Plus unbegrenzt.</p>}
            {puzzle && done && themeNames(puzzle.themes).length > 0 && (
              <p className="note" data-testid="puzzle-themes">Motiv: {themeNames(puzzle.themes).join(' · ')}</p>
            )}
            {puzzle && done && (
              <p className="note">Lösung: {puzzle.moves.slice(1).map((m, i) => {
                const san = positionAt(puzzle, i + 1).move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san;
                return localSan(san);
              }).join(' ')}</p>
            )}
          </>
        )}
        <p className="note">Rätsel aus der freien Sammlung von <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">lichess.org</a> (CC0).</p>
      </aside>
    </div>
  );
}
