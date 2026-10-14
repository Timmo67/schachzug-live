import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Eval } from './analysisLogic';
import { Engine } from './engine';
import { analyzeMoves, positions } from './runAnalysis';

export { positions };

export type AnalysisState =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; evals: Eval[] }
  | { kind: 'error'; text: string };

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

    setState({ kind: 'running', done: 0, total: list.length + 1 });
    try {
      engine.current ??= new Engine();
      const evals = await analyzeMoves(engine.current, list, (done, total) => setState({ kind: 'running', done, total }));
      setState({ kind: 'done', evals });
      await supabase.rpc('save_analysis', { p_game: gameId, p_evals: evals });
    } catch {
      setState({ kind: 'error', text: 'Die Schach-Engine konnte auf diesem Gerät nicht starten.' });
    }
  }, [gameId, movesKey]);

  return { state, remaining, start };
}

/** The engine's better move for the move leading to `ply`, if the move played was not the best (for the board arrow). */
export function betterMove(state: AnalysisState, moves: string[], ply: number): string | null {
  if (state.kind !== 'done' || ply < 1 || state.evals.length !== moves.length + 1) return null;
  const best = state.evals[ply - 1]?.best;
  return best && best !== moves[ply - 1] ? best : null;
}
