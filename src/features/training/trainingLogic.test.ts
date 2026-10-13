import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildProfile, classify, phaseOf, type AnalysedGame } from './trainingLogic';

const after = (moves: string[]) => {
  const g = new Chess();
  for (const m of moves) g.move({ from: m.slice(0, 2), to: m.slice(2, 4) });
  return g;
};

// Scholar's mate line where Black (the player) blunders with 3…Nf6?? and walks into Qxf7#.
const MOVES = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];
const EVALS = [
  { cp: 20, best: 'e2e4' }, { cp: 30, best: 'e7e5' }, { cp: 20, best: 'b1c3' }, { cp: 30, best: 'g7g6' },
  { cp: 40, best: 'g7g6' }, { cp: 35, best: 'g7g6' }, { mate: 1, best: 'h5f7' }, { cp: 10_000 },
];

describe('training logic', () => {
  it('tells opening, middlegame and endgame apart', () => {
    expect(phaseOf(new Chess(), 0)).toBe('opening');
    expect(phaseOf(new Chess(), 30)).toBe('middlegame');
    expect(phaseOf(new Chess('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 40'), 60)).toBe('endgame');
  });

  it('classifies mistakes: hanging piece, missed mate, missed tactic', () => {
    // 3…Nf6?? – the opponent's best reply captures on f7.
    expect(classify(after(MOVES.slice(0, 5)), after(MOVES.slice(0, 6)), EVALS[5], EVALS[6], 'b')).toBe('hanging');
    // White could mate with Qxf7# but plays Qh4.
    const before = after(MOVES.slice(0, 6));
    expect(classify(before, after([...MOVES.slice(0, 6), 'h5h4']), { mate: 1, best: 'h5f7' }, { cp: 200, best: 'f6e4' }, 'w')).toBe('missedMate');
    // 1.e4 d5 2.a3? – exd5 (a capture) was best.
    expect(classify(after(['e2e4', 'd7d5']), after(['e2e4', 'd7d5', 'a2a3']), { cp: 50, best: 'e4d5' }, { cp: -300, best: 'g8f6' }, 'w')).toBe('missedTactic');
  });

  it('turns repeated mistakes and weak puzzle motifs into lessons', () => {
    const games: AnalysedGame[] = Array.from({ length: 10 }, () => ({ moves: MOVES, color: 'b' as const, evals: EVALS }));
    const p = buildProfile(games, [{ theme: 'fork', attempts: 5, solved: 1 }, { theme: 'pin', attempts: 5, solved: 5 }]);
    expect(p.games).toBe(10);
    expect(p.moves).toBe(30);
    expect(p.mistakes.hanging).toBe(10);
    expect(p.lessons).toHaveLength(3);
    expect(p.lessons[0].id).toBe('hanging');
    expect(p.lessons[0].reason).toContain('10 Partien');
    expect(p.lessons.map((l) => l.id)).toContain('fork');
    expect(p.lessons.map((l) => l.id)).not.toContain('pin');
  });

  it('offers basic lessons when there is no clear weakness yet', () => {
    const p = buildProfile([], []);
    expect(p.lessons.map((l) => l.id)).toEqual(['tactics', 'mate', 'hanging']);
  });
});
