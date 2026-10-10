import { describe, expect, it } from 'vitest';
import { applyMove, clocksAt, type GameState, type GameUpdate } from './gameLogic';

const W = 'white-user';
const B = 'black-user';
const T0 = Date.parse('2026-10-10T12:00:00Z');

function state(over: Partial<GameState> = {}): GameState {
  return {
    status: 'active', white_id: W, black_id: B, moves_uci: [],
    base_ms: 180_000, increment_ms: 2_000, white_ms_left: 180_000, black_ms_left: 180_000, last_move_at: null,
    ...over,
  };
}

function ok(r: ReturnType<typeof applyMove>): GameUpdate {
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('applyMove', () => {
  it('accepts a legal move from the side to move', () => {
    const r = ok(applyMove(state(), W, 'e2e4', T0));
    expect(r.moves_uci).toEqual(['e2e4']);
    expect(r.status).toBe('active');
  });

  it('rejects moves out of turn, by outsiders and illegal ones', () => {
    expect(applyMove(state(), B, 'e7e5', T0)).toEqual({ error: 'not_your_turn' });
    expect(applyMove(state(), 'someone', 'e2e4', T0)).toEqual({ error: 'not_a_player' });
    expect(applyMove(state(), W, 'e2e5', T0)).toEqual({ error: 'illegal_move' });
    expect(applyMove(state(), W, 'garbage', T0)).toEqual({ error: 'illegal_move' });
    expect(applyMove(state({ status: 'finished' }), W, 'e2e4', T0)).toEqual({ error: 'game_not_active' });
  });

  it('detects checkmate', () => {
    const s = state({ moves_uci: ['f2f3', 'e7e5', 'g2g4'], last_move_at: new Date(T0).toISOString() });
    const r = ok(applyMove(s, B, 'd8h4', T0 + 1000));
    expect(r).toMatchObject({ status: 'finished', result: '0-1', termination: 'checkmate' });
  });

  it('does not run clocks before both sides moved, then deducts time and adds increment', () => {
    const r1 = ok(applyMove(state(), W, 'e2e4', T0 + 50_000));
    expect(r1.white_ms_left).toBe(182_000);
    const s = state({ moves_uci: ['e2e4', 'e7e5'], last_move_at: new Date(T0).toISOString() });
    const r2 = ok(applyMove(s, W, 'g1f3', T0 + 10_000));
    expect(r2.white_ms_left).toBe(180_000 - 10_000 + 2_000);
    expect(r2.black_ms_left).toBe(180_000);
  });

  it('ends the game on time when the move arrives after the flag fell', () => {
    const s = state({ moves_uci: ['e2e4', 'e7e5'], white_ms_left: 5_000, last_move_at: new Date(T0).toISOString() });
    const r = ok(applyMove(s, W, 'g1f3', T0 + 6_000));
    expect(r).toMatchObject({ status: 'finished', result: '0-1', termination: 'timeout', white_ms_left: 0 });
    expect(r.moves_uci).toEqual(['e2e4', 'e7e5']);
  });

  it('handles games without a clock', () => {
    const s = state({ base_ms: null, white_ms_left: null, black_ms_left: null, moves_uci: ['e2e4', 'e7e5'], last_move_at: new Date(T0).toISOString() });
    const r = ok(applyMove(s, W, 'g1f3', T0 + 10_000_000));
    expect(r.white_ms_left).toBeNull();
    expect(r.status).toBe('active');
  });

  it('keeps the promotion piece', () => {
    const s = state({ base_ms: null, moves_uci: ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'g8f6'] });
    expect(ok(applyMove(s, W, 'b7a8n', T0)).moves_uci.at(-1)).toBe('b7a8n');
  });
});

describe('clocksAt', () => {
  it('counts down only the side to move', () => {
    const s = state({ moves_uci: ['e2e4', 'e7e5', 'g1f3'], last_move_at: new Date(T0).toISOString() });
    expect(clocksAt(s, T0 + 3_000)).toEqual({ w: 180_000, b: 177_000 });
  });
});
