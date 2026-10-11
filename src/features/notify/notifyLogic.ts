// Pure rules for game notifications (unit-tested).

export type GameLite = {
  id: string;
  status: 'waiting' | 'active' | 'finished' | 'aborted';
  white_id: string | null;
  black_id: string | null;
  created_by: string | null;
  moves_uci: string[];
  result: string | null;
};

export type GameEvent =
  | { kind: 'challenge'; gameId: string; from: string }
  | { kind: 'accepted'; gameId: string; by: string }
  | { kind: 'declined'; gameId: string; by: string }
  | { kind: 'your_turn'; gameId: string; by: string }
  | { kind: 'finished'; gameId: string; by: string };

export function opponentOf(g: GameLite, me: string): string | null {
  return g.white_id === me ? g.black_id : g.white_id;
}

export function isMyTurn(g: GameLite, me: string): boolean {
  if (g.status !== 'active') return false;
  return (g.moves_uci.length % 2 === 0 ? g.white_id : g.black_id) === me;
}

/** What changed for `me` between the previous and the new state of one game (prev undefined = new game). */
export function eventFor(prev: GameLite | undefined, next: GameLite, me: string): GameEvent | null {
  const other = opponentOf(next, me);
  if (!other) return null;
  if (!prev) {
    return next.status === 'waiting' && next.created_by !== me ? { kind: 'challenge', gameId: next.id, from: other } : null;
  }
  if (prev.status === 'waiting' && next.status === 'active' && next.created_by === me) return { kind: 'accepted', gameId: next.id, by: other };
  if (prev.status === 'waiting' && next.status === 'aborted' && next.created_by === me) return { kind: 'declined', gameId: next.id, by: other };
  if (prev.status === 'active' && next.status === 'finished') return { kind: 'finished', gameId: next.id, by: other };
  if (next.status === 'active' && next.moves_uci.length > prev.moves_uci.length && isMyTurn(next, me)) {
    return { kind: 'your_turn', gameId: next.id, by: other };
  }
  return null;
}

/** Number shown on the "Partien" menu item: open challenges to me plus games where I am to move. */
export function badgeCount(games: GameLite[], me: string): number {
  return games.filter((g) => (g.status === 'waiting' && g.created_by !== me) || isMyTurn(g, me)).length;
}

export function eventText(e: GameEvent, name: string): { title: string; action: string } {
  switch (e.kind) {
    case 'challenge': return { title: `${name} fordert dich heraus`, action: 'Ansehen' };
    case 'accepted': return { title: `${name} hat deine Herausforderung angenommen`, action: 'Zur Partie' };
    case 'declined': return { title: `${name} hat deine Herausforderung abgelehnt`, action: 'Ok' };
    case 'your_turn': return { title: `${name} hat gezogen – du bist am Zug`, action: 'Zur Partie' };
    case 'finished': return { title: `Partie gegen ${name} ist beendet`, action: 'Ansehen' };
  }
}
