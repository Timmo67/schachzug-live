import { describe, expect, it } from 'vitest';
import { judge, whiteWinChance, type Eval, type MoveReview } from './analysisLogic';
import { explainMove, lineText, materialText } from './explainLogic';
import { positions } from './runAnalysis';

const names = { w: 'Weiß', b: 'Schwarz' };

function review(color: 'w' | 'b', before: Eval, after: Eval, move: string): MoveReview {
  const wb = whiteWinChance(before), wa = whiteWinChance(after);
  const winBefore = color === 'w' ? wb : 100 - wb, winAfter = color === 'w' ? wa : 100 - wa;
  const best = before.best && before.best !== move ? before.best : undefined;
  return { ply: 1, color, winBefore, winAfter, accuracy: 0, judgement: best ? judge(winBefore, winAfter) : null, best };
}

function explain(history: string[], move: string, before: Eval, after: Eval) {
  const fen = positions(history).at(-1)!;
  const color = history.length % 2 === 0 ? 'w' : 'b';
  return explainMove(fen, move, before, after, review(color, before, after, move), names);
}

describe('move explanations', () => {
  it('numbers lines from either side', () => {
    const fen = positions(['e2e4']).at(-1)!;
    expect(lineText(fen, ['e5', 'Nf3', 'Nc6'])).toBe('1… e5 2. Nf3 Nc6');
    expect(lineText(positions([]).at(-1)!, ['e4', 'e5'])).toBe('1. e4 e5');
    expect(materialText(3)).toBe('eine Figur');
  });

  it('explains an allowed mate', () => {
    const before: Eval = { cp: 50, best: 'g7g6', pv: ['g7g6', 'h5f3', 'g8f6'] };
    const after: Eval = { mate: 1, best: 'h5f7', pv: ['h5f7'] };
    const e = explain(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4'], 'g8f6', before, after);
    expect(e.cls).toBe('blunder');
    expect(e.lines.join(' ')).toMatch(/Damit kann Weiß mattsetzen: 4\. [QD]xf7#/);
    expect(e.lines.join(' ')).toContain('Besser war g6');
  });

  it('explains a hanging piece and the better move', () => {
    const before: Eval = { cp: 150, best: 'd4e5', pv: ['d4e5', 'b8c6', 'g1f3'] };
    const after: Eval = { cp: -300, best: 'd8g5', pv: ['d8g5', 'g1f3'] };
    const e = explain(['d2d4', 'e7e5'], 'c1g5', before, after);
    expect(e.cls).toBe('blunder');
    const text = e.lines.join(' ');
    expect(text).toMatch(/Der (Läufer) auf g5 ist nicht ausreichend geschützt: 2… [QD]xg5 3\. [NS]f3 – Weiß verliert eine Figur\./);
    expect(text).toMatch(/Besser war dxe5: 2\. dxe5 [NS]c6 3\. [NS]f3\./);
  });

  it('points out a missed mate', () => {
    const before: Eval = { mate: 1, best: 'h5f7', pv: ['h5f7'] };
    const after: Eval = { cp: 0 };
    const e = explain(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6'], 'd2d3', before, after);
    expect(e.cls).toBe('blunder');
    expect(e.lines.join(' ')).toMatch(/Hier gab es ein Matt in 1: 4\. [QD]xf7#\. Übersehen\./);
  });

  it('praises the best move and describes captures', () => {
    const before: Eval = { cp: 150, best: 'd4e5', pv: ['d4e5'] };
    const e = explain(['d2d4', 'e7e5'], 'd4e5', before, { cp: 140 });
    expect(e.cls).toBe('best');
    expect(e.lines).toEqual(['Schlägt einen Bauern auf e5.', 'Der stärkste Zug – genau das, was die Engine auch spielt.']);
  });

  it('grades moves close to the best one', () => {
    const before: Eval = { cp: 30, best: 'e2e4' };
    expect(explain([], 'd2d4', before, { cp: 28 }).cls).toBe('excellent');
    expect(explain([], 'g1f3', before, { cp: -40 }).cls).toBe('good');
  });

  it('recognises the only legal move and mate', () => {
    // 1. f3 e5 2. g4 Qh4#: mate on the board.
    expect(explain(['f2f3', 'e7e5', 'g2g4'], 'd8h4', { mate: -1, best: 'd8h4' }, { cp: -10_000 }).lines).toEqual(['Schachmatt!']);
    // After 1. e4 f5 2. Qh5+ Black has only g6.
    expect(explain(['e2e4', 'f7f5', 'd1h5'], 'g7g6', { cp: 300, best: 'g7g6' }, { cp: 300 }).cls).toBe('forced');
  });
});
