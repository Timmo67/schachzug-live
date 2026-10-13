import { describe, expect, it } from 'vitest';
import { evalText, judge, moveAccuracy, parseInfo, reviewMoves, summarize, toWhite, whiteWinChance } from './analysisLogic';

describe('analysis logic', () => {
  it('converts scores to White’s view', () => {
    expect(toWhite({ cp: 50 }, 'w')).toEqual({ cp: 50 });
    expect(toWhite({ cp: 50 }, 'b')).toEqual({ cp: -50 });
    expect(toWhite({ mate: 2 }, 'b')).toEqual({ mate: -2 });
  });

  it('maps evaluations to winning chances', () => {
    expect(whiteWinChance({ cp: 0 })).toBeCloseTo(50);
    expect(whiteWinChance({ cp: 300 })).toBeGreaterThan(70);
    expect(whiteWinChance({ mate: 3 })).toBeGreaterThan(97);
    expect(whiteWinChance({ mate: -1 })).toBeLessThan(3);
  });

  it('judges moves by the drop in winning chance', () => {
    expect(judge(50, 45)).toBeNull();
    expect(judge(50, 38)).toBe('inaccuracy');
    expect(judge(50, 28)).toBe('mistake');
    expect(judge(60, 10)).toBe('blunder');
    expect(moveAccuracy(50, 50)).toBeCloseTo(100, 0);
    expect(moveAccuracy(70, 10)).toBeLessThan(10);
  });

  it('reviews a game: a blunder that hangs mate is found, with the better move', () => {
    // 1. e4 (equal) … 2. Qh5 … Black blunders into mate in 1 instead of defending.
    const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'];
    const evals = [
      { cp: 20, best: 'e2e4' }, { cp: 30, best: 'e7e5' }, { cp: 25, best: 'b1c3' }, { cp: 30, best: 'g8f6' },
      { cp: 40, best: 'h5f7' }, { cp: 35, best: 'g7g6' }, { mate: 1, best: 'h5f7' },
    ];
    const r = reviewMoves(evals, moves);
    expect(r).toHaveLength(6);
    const last = r[5];
    expect(last.color).toBe('b');
    expect(last.judgement).toBe('blunder');
    expect(last.best).toBe('g7g6');
    expect(r[0].judgement).toBeNull(); // the best move is never judged
    const s = summarize(r);
    expect(s.b.blunder).toBe(1);
    expect(s.w.blunder).toBe(0);
    expect(s.w.accuracy).toBeGreaterThan(s.b.accuracy);
  });

  it('formats evaluations and parses UCI info lines', () => {
    expect(evalText({ cp: 130 })).toBe('+1.3');
    expect(evalText({ cp: -40 })).toBe('−0.4');
    expect(evalText({ mate: -2 })).toBe('#−2');
    expect(evalText({ cp: -10_000 })).toBe('#');
    expect(parseInfo('info depth 12 seldepth 18 multipv 1 score cp -35 nodes 1 pv e7e5 g1f3')).toEqual({ depth: 12, cp: -35, pv: 'e7e5' });
    expect(parseInfo('info depth 9 score mate 2 pv h5f7')).toEqual({ depth: 9, mate: 2, pv: 'h5f7' });
    expect(parseInfo('info string NNUE evaluation')).toBeNull();
  });
});
