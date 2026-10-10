import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export const GLYPH: Record<PieceSymbol, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
/** Forces text (not emoji) presentation of chess glyphs, e.g. the pawn on iOS. */
export const VS15 = '︎';
export const FILES = 'abcdefgh';

export type UciMove = string; // e.g. "e2e4" or "e7e8q"

export function colorName(c: Color): string {
  return c === 'w' ? 'Weiß' : 'Schwarz';
}

/** Rebuilds a game from UCI moves. Returns null if any move is illegal or malformed. */
export function fromUci(moves: readonly UciMove[]): Chess | null {
  const g = new Chess();
  for (const m of moves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) return null;
    try {
      g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] ?? 'q' });
    } catch {
      return null;
    }
  }
  return g;
}

/** Tries a move; returns its UCI string or null when illegal. Mutates `g` on success. */
export function tryMove(g: Chess, from: Square, to: Square, promotion?: PieceSymbol): UciMove | null {
  try {
    const r = g.move({ from, to, promotion: promotion ?? 'q' });
    return r.from + r.to + (r.promotion ?? '');
  } catch {
    return null;
  }
}

export function needsPromotion(g: Chess, from: Square, to: Square): boolean {
  return g.moves({ square: from, verbose: true }).some((m) => m.to === to && !!m.promotion);
}

export type Result = { text: string; winner: Color | null } | null;

export function result(g: Chess, resigned: Color | null = null): Result {
  if (resigned) {
    const w: Color = resigned === 'w' ? 'b' : 'w';
    return { text: `${colorName(resigned)} gibt auf – ${colorName(w)} gewinnt`, winner: w };
  }
  if (g.isCheckmate()) {
    const w: Color = g.turn() === 'w' ? 'b' : 'w';
    return { text: `Schachmatt – ${colorName(w)} gewinnt`, winner: w };
  }
  if (g.isStalemate()) return { text: 'Remis durch Patt', winner: null };
  if (g.isThreefoldRepetition()) return { text: 'Remis durch dreifache Wiederholung', winner: null };
  if (g.isInsufficientMaterial()) return { text: 'Remis – zu wenig Material', winner: null };
  if (g.isDraw()) return { text: 'Remis (50-Züge-Regel)', winner: null };
  return null;
}

export function statusText(g: Chess, resigned: Color | null = null): string {
  const r = result(g, resigned);
  if (r) return r.text;
  return `${colorName(g.turn())} am Zug${g.inCheck() ? ' – Schach!' : ''}`;
}

/** Pieces each side has captured, strongest first, as glyph strings. */
export function captured(g: Chess): Record<Color, string> {
  const start: Record<Exclude<PieceSymbol, 'k'>, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
  const have = { w: { q: 0, r: 0, b: 0, n: 0, p: 0 }, b: { q: 0, r: 0, b: 0, n: 0, p: 0 } };
  for (const row of g.board()) for (const p of row) if (p && p.type !== 'k') have[p.color][p.type]++;
  const out: Record<Color, string> = { w: '', b: '' };
  for (const c of ['w', 'b'] as const) {
    const opp = c === 'w' ? 'b' : 'w';
    for (const t of ['q', 'r', 'b', 'n', 'p'] as const) out[c] += (GLYPH[t] + VS15).repeat(Math.max(0, start[t] - have[opp][t]));
  }
  return out;
}

export function kingInCheckSquare(g: Chess): Square | null {
  if (!g.inCheck()) return null;
  for (const row of g.board()) for (const p of row) if (p && p.type === 'k' && p.color === g.turn()) return p.square;
  return null;
}

/** SAN history grouped as move pairs: [[1, "e4", "e5"], ...] */
export function movePairs(g: Chess): Array<[number, string, string]> {
  const h = g.history();
  const out: Array<[number, string, string]> = [];
  for (let i = 0; i < h.length; i += 2) out.push([i / 2 + 1, h[i], h[i + 1] ?? '']);
  return out;
}
