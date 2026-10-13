import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { supabase } from '../../lib/supabase';
import type { Eval } from './analysisLogic';
import { Engine } from './engine';

export type AnalysisState =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; evals: Eval[] }
  | { kind: 'error'; text: string };

/** FEN of every position of the game: index 0 = start, index i = after i plies. */
export function positions(moves: string[]): string[] {
  const g = new Chess();
  const out = [g.fen()];
  for (const m of moves) {
    g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    out.push(g.fen());
  }
  return out;
}

/** Evaluation of a final position the engine cannot search (mate or draw). */
function terminalEval(fen: string): Eval | null {
  const g = new Chess(fen);
  if (g.isCheckmate()) return { cp: g.turn() === 'w' ? -10_000 : 10_000 };
  if (g.isDraw() || g.isStalemate()) return { cp: 0 };
  return null;
}

const ERRORS: Record<string, string> = {
  analysis_limit: 'Deine Gratis-Analyse für heute ist verbraucht. Mit Plus kannst du jede Partie analysieren.',
  game_not_found: 'Nur beendete eigene Partien können analysiert werden.',
};

/**
 * Engine analysis of a finished online game. Loads a stored result if there is one; `start()` asks the
 * server for permission (daily free quota), runs Stockfish over every position and stores the result.
 */
export function useAnalysis(gameId: string, moves: string[], finished: boolean) {
  const [state, setState] = useState<AnalysisState>({ kind: 'idle' });
  const [remaining, setRemaining] = useState<number | null>(null);
  const engine = useRef<Engine | null>(null);
  const movesKey = moves.join(' ');

  useEffect(() => {
    if (!supabase || !finished) return;
    let alive = true;
    void supabase.from('game_analyses').select('evals').eq('game_id', gameId).maybeSingle().then(({ data }) => {
      const evals = (data as { evals: Eval[] | null } | null)?.evals;
      if (alive && evals) setState({ kind: 'done', evals });
    });
    void supabase.rpc('analysis_status').then(({ data }) => {
      const s = data as { unlimited: boolean; remaining: number | null } | null;
      if (alive && s) setRemaining(s.unlimited ? null : s.remaining);
    });
    return () => { alive = false; };
  }, [gameId, finished]);

  useEffect(() => () => engine.current?.stop(), []);

  const start = useCallback(async () => {
    if (!supabase) return;
    const list = movesKey ? movesKey.split(' ') : [];
    const { data, error } = await supabase.rpc('begin_analysis', { p_game: gameId });
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      setState({ kind: 'error', text: key ? ERRORS[key] : 'Die Analyse konnte nicht starten. Bitte später erneut versuchen.' });
      return;
    }
    if (data) { setState({ kind: 'done', evals: data as Eval[] }); return; }
    setRemaining((r) => (r === null ? null : Math.max(0, r - 1)));

    const fens = positions(list);
    setState({ kind: 'running', done: 0, total: fens.length });
    try {
      engine.current ??= new Engine();
      await engine.current.newGame();
      const evals: Eval[] = [];
      for (const fen of fens) {
        evals.push(terminalEval(fen) ?? await engine.current.evaluate(fen));
        setState({ kind: 'running', done: evals.length, total: fens.length });
      }
      setState({ kind: 'done', evals });
      await supabase.rpc('save_analysis', { p_game: gameId, p_evals: evals });
    } catch {
      setState({ kind: 'error', text: 'Die Schach-Engine konnte auf diesem Gerät nicht starten.' });
    }
  }, [gameId, movesKey]);

  return { state, remaining, start };
}
