import { describe, expect, it } from 'vitest';
import { isCorrect, playerColor, positionAt, solutionLength, themeNames, type Puzzle } from './puzzleLogic';

// Real lichess puzzle 00sHx: Black plays Kd7, White mates with Qe6+ Kd8 Qf8#.
const P: Puzzle = {
  id: '00sHx', fen: 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17',
  moves: ['e8d7', 'a2e6', 'd7d8', 'f7f8'], rating: 1760, themes: ['mate', 'mateIn2', 'middlegame', 'short'],
};

describe('puzzle logic', () => {
  it('knows whose side the player is on and how long the solution is', () => {
    expect(playerColor(P)).toBe('w');
    expect(solutionLength(P)).toBe(2);
    expect(positionAt(P, 1).turn()).toBe('w');
  });

  it('accepts the solution and rejects other moves', () => {
    expect(isCorrect(P, 1, 'a2e6')).toBe(true);
    expect(isCorrect(P, 1, 'f7g8')).toBe(false);
    expect(isCorrect(P, 3, 'f7f8')).toBe(true);
  });

  it('accepts any checkmate on the last move', () => {
    // Back-rank mate: Rd8# is the stored solution, Ra8# mates as well.
    const backRank: Puzzle = { id: 'x', fen: '6k1/1p3ppp/8/8/8/8/5PPP/R2R2K1 b - - 0 1', moves: ['b7b6', 'd1d8'], rating: 600, themes: [] };
    expect(isCorrect(backRank, 1, 'd1d8')).toBe(true);
    expect(isCorrect(backRank, 1, 'a1a8')).toBe(true);
    expect(isCorrect(backRank, 1, 'd1d7')).toBe(false);
  });

  it('names the motifs in German', () => {
    expect(themeNames(P.themes)).toEqual(['Matt', 'Matt in 2', 'Mittelspiel']);
  });
});
