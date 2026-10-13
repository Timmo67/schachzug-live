// Pure rules for game analysis (unit-tested). Engine scores are always stored from White's point of view.

/** Engine result for one position: centipawns or mate in n (positive = White wins), plus the best move. */
export type Eval = { cp?: number; mate?: number; best?: string };

export type Judgement = 'inaccuracy' | 'mistake' | 'blunder';

export type MoveReview = {
  ply: number;            // 1-based: ply 1 is White's first move
  color: 'w' | 'b';
  winBefore: number;      // winning chance (0–100) of the mover before the move
  winAfter: number;       // … and after it
  accuracy: number;       // 0–100
  judgement: Judgement | null;
  best?: string;          // engine's best move in the position before (UCI), if it differs from the move played
};

export type Summary = Record<'w' | 'b', { accuracy: number; inaccuracy: number; mistake: number; blunder: number }>;

/** Converts a raw UCI score (side to move's view) into White's view. */
export function toWhite(score: { cp?: number; mate?: number }, sideToMove: 'w' | 'b'): { cp?: number; mate?: number } {
  const s = sideToMove === 'w' ? 1 : -1;
  return score.mate !== undefined ? { mate: score.mate * s } : { cp: (score.cp ?? 0) * s };
}

/** Centipawns for charts and maths; mate counts as a large advantage. */
export function cpOf(e: Eval): number {
  if (e.mate !== undefined) return e.mate === 0 ? 0 : Math.sign(e.mate) * 10_000;
  return e.cp ?? 0;
}

/** White's winning chance in percent (same curve lichess uses). */
export function whiteWinChance(e: Eval): number {
  const cp = Math.max(-1000, Math.min(1000, cpOf(e)));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Per-move accuracy from the drop in winning chance (lichess formula, clamped to 0–100). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
}

export function judge(winBefore: number, winAfter: number): Judgement | null {
  const drop = winBefore - winAfter;
  if (drop >= 30) return 'blunder';
  if (drop >= 20) return 'mistake';
  if (drop >= 10) return 'inaccuracy';
  return null;
}

/**
 * Reviews every move. `evals[i]` is the evaluation of the position after `i` plies (evals[0] = start),
 * `moves[i]` the UCI move that leads from position i to i+1.
 */
export function reviewMoves(evals: Eval[], moves: string[]): MoveReview[] {
  const out: MoveReview[] = [];
  for (let i = 0; i < moves.length && i + 1 < evals.length; i++) {
    const color = i % 2 === 0 ? 'w' : 'b';
    const wBefore = whiteWinChance(evals[i]);
    const wAfter = whiteWinChance(evals[i + 1]);
    const winBefore = color === 'w' ? wBefore : 100 - wBefore;
    const winAfter = color === 'w' ? wAfter : 100 - wAfter;
    const best = evals[i].best && evals[i].best !== moves[i] ? evals[i].best : undefined;
    out.push({
      ply: i + 1, color, winBefore, winAfter,
      accuracy: moveAccuracy(winBefore, winAfter),
      judgement: best ? judge(winBefore, winAfter) : null,
      best,
    });
  }
  return out;
}

export function summarize(reviews: MoveReview[]): Summary {
  const empty = () => ({ accuracy: 0, inaccuracy: 0, mistake: 0, blunder: 0 });
  const s: Summary = { w: empty(), b: empty() };
  for (const c of ['w', 'b'] as const) {
    const mine = reviews.filter((r) => r.color === c);
    s[c].accuracy = mine.length ? Math.round(mine.reduce((a, r) => a + r.accuracy, 0) / mine.length) : 0;
    for (const r of mine) if (r.judgement) s[c][r.judgement]++;
  }
  return s;
}

/** Text for the evaluation bar/list, e.g. "+1.3", "−0.4", "#3", "#−2". */
export function evalText(e: Eval): string {
  if (e.mate !== undefined) return e.mate === 0 ? '#' : `#${e.mate < 0 ? '−' : ''}${Math.abs(e.mate)}`;
  if (Math.abs(e.cp ?? 0) >= 10_000) return '#'; // checkmate on the board
  const v = (e.cp ?? 0) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}

export const JUDGEMENT_SYMBOL: Record<Judgement, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' };
export const JUDGEMENT_TEXT: Record<Judgement, string> = { inaccuracy: 'Ungenauigkeit', mistake: 'Fehler', blunder: 'Patzer' };

/** Parses one UCI "info" line; returns depth and score (side to move's view), or null. */
export function parseInfo(line: string): { depth: number; cp?: number; mate?: number; pv?: string } | null {
  if (!line.startsWith('info ') || !line.includes(' score ')) return null;
  if (/\bmultipv (?!1\b)\d+/.test(line)) return null;
  const depth = Number(/\bdepth (\d+)/.exec(line)?.[1] ?? 0);
  const cp = /\bscore cp (-?\d+)/.exec(line);
  const mate = /\bscore mate (-?\d+)/.exec(line);
  const pv = /\bpv (\S+)/.exec(line)?.[1];
  if (cp) return { depth, cp: Number(cp[1]), pv };
  if (mate) return { depth, mate: Number(mate[1]), pv };
  return null;
}
