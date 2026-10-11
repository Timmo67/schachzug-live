import { describe, expect, it } from 'vitest';
import { badgeCount, eventFor, type GameLite } from './notifyLogic';

const ME = 'me';
const YOU = 'you';
const g = (over: Partial<GameLite> = {}): GameLite => ({
  id: 'g1', status: 'waiting', white_id: ME, black_id: YOU, created_by: YOU, moves_uci: [], result: null, ...over,
});

describe('game notifications', () => {
  it('announces a new challenge from someone else, not my own', () => {
    expect(eventFor(undefined, g(), ME)).toEqual({ kind: 'challenge', gameId: 'g1', from: YOU });
    expect(eventFor(undefined, g({ created_by: ME }), ME)).toBeNull();
  });

  it('tells the challenger about acceptance and decline', () => {
    const mine = g({ created_by: ME });
    expect(eventFor(mine, { ...mine, status: 'active' }, ME)?.kind).toBe('accepted');
    expect(eventFor(mine, { ...mine, status: 'aborted' }, ME)?.kind).toBe('declined');
    expect(eventFor(g(), { ...g(), status: 'active' }, ME)).toBeNull(); // I accepted myself
  });

  it('announces my turn only after the opponent moved', () => {
    const active = g({ status: 'active', moves_uci: ['e2e4'] });
    expect(eventFor(active, { ...active, moves_uci: ['e2e4', 'e7e5'] }, ME)?.kind).toBe('your_turn');
    expect(eventFor(g({ status: 'active' }), { ...active }, ME)).toBeNull(); // my own move
  });

  it('counts challenges and games where I am to move', () => {
    expect(badgeCount([
      g(),
      g({ id: 'g2', status: 'active', moves_uci: [] }),
      g({ id: 'g3', status: 'active', moves_uci: ['e2e4'] }),
      g({ id: 'g4', created_by: ME }),
    ], ME)).toBe(2);
  });
});
