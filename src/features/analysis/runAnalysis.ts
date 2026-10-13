import { Chess } from 'chess.js';
import type { Eval } from './analysisLogic';
import type { Engine } from './engine';

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

/** Evaluates every position of a game with the engine; `onProgress(done, total)` after each one. */
export async function analyzeMoves(engine: Engine, moves: string[], onProgress?: (done: number, total: number) => void): Promise<Eval[]> {
  const fens = positions(moves);
  await engine.newGame();
  const evals: Eval[] = [];
  for (const fen of fens) {
    evals.push(terminalEval(fen) ?? await engine.evaluate(fen));
    onProgress?.(evals.length, fens.length);
  }
  return evals;
}
