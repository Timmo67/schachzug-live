import { describe, expect, it } from 'vitest';
import { formatClock, resultText, toPgn, type GameRow } from './onlineGame';

const game: GameRow = {
  id: 'g1', status: 'finished', white_id: 'w', black_id: 'b', created_by: 'w', time_control: '3+2',
  fen: '', moves_uci: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], base_ms: 180_000, increment_ms: 2_000,
  white_ms_left: 1, black_ms_left: 1, last_move_at: null, result: '0-1', termination: 'checkmate',
  draw_offer_by: null, version: 5, created_at: '2026-10-10T12:00:00Z', finished_at: null, kind: 'friend',
};

describe('online game helpers', () => {
  it('formats clocks', () => {
    expect(formatClock(null)).toBe('∞');
    expect(formatClock(180_000)).toBe('3:00');
    expect(formatClock(61_001)).toBe('1:02');
    expect(formatClock(9_450)).toBe('0:09.4');
  });

  it('describes the result from the viewer’s side', () => {
    expect(resultText(game, 'b')).toBe('Du gewinnst – Schachmatt');
    expect(resultText(game, 'w')).toBe('Du verlierst – Schachmatt');
    expect(resultText({ ...game, result: '1/2-1/2', termination: 'draw_agreed' }, 'w')).toBe('Remis – Remis vereinbart');
  });

  it('exports PGN with headers and a single result token', () => {
    const pgn = toPgn(game, 'Anna', 'Ben');
    expect(pgn).toContain('[White "Anna"]');
    expect(pgn).toContain('[TimeControl "180+2"]');
    expect(pgn).toContain('1. f3 e5 2. g4 Qh4#');
    expect(pgn.trim().endsWith('0-1')).toBe(true);
    expect(pgn.match(/0-1/g)?.length).toBe(2); // header + movetext
    expect(toPgn({ ...game, status: 'active', result: null, termination: null }, 'A', 'B').trim().endsWith('Qh4# *')).toBe(true);
  });
});
