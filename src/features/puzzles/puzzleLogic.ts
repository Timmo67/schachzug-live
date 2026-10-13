import { Chess, type Color } from 'chess.js';

// Pure rules for puzzles (unit-tested). Format as in the lichess database: `fen` is the position before
// the opponent's move, `moves[0]` is that move, then the solution alternates player / opponent (UCI).

export type Puzzle = { id: string; fen: string; moves: string[]; rating: number; themes: string[] };

/** Position after `plies` moves of the puzzle line (0 = the given FEN). */
export function positionAt(p: Puzzle, plies: number): Chess {
  const g = new Chess(p.fen);
  for (const m of p.moves.slice(0, plies)) g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  return g;
}

/** The side the player solves for: the side to move after the opponent's first move. */
export function playerColor(p: Puzzle): Color {
  return new Chess(p.fen).turn() === 'w' ? 'b' : 'w';
}

/**
 * Is `uci` (played at ply `ply`, an odd index = player's turn) correct? The expected move is always right;
 * on the last move any move that gives checkmate counts too (puzzles can have several mating moves).
 */
export function isCorrect(p: Puzzle, ply: number, uci: string): boolean {
  const expected = p.moves[ply];
  if (!expected) return false;
  if (uci === expected || (uci.length === 4 && expected.length === 5 && expected.startsWith(uci) && expected[4] === 'q')) return true;
  if (ply !== p.moves.length - 1) return false;
  const g = positionAt(p, ply);
  try {
    g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    return g.isCheckmate();
  } catch { return false; }
}

/** Number of player moves in the solution. */
export function solutionLength(p: Puzzle): number {
  return Math.floor(p.moves.length / 2);
}

const THEMES: Record<string, string> = {
  mateIn1: 'Matt in 1', mateIn2: 'Matt in 2', mateIn3: 'Matt in 3', mateIn4: 'Matt in 4', mate: 'Matt',
  fork: 'Gabel', pin: 'Fesselung', skewer: 'Spieß', discoveredAttack: 'Abzugsangriff', doubleCheck: 'Doppelschach',
  hangingPiece: 'Ungedeckte Figur', trappedPiece: 'Gefangene Figur', sacrifice: 'Opfer', deflection: 'Ablenkung',
  attraction: 'Hinlenkung', decoy: 'Lockvogel', clearance: 'Räumung', interference: 'Verstellung',
  intermezzo: 'Zwischenzug', quietMove: 'Stiller Zug', zugzwang: 'Zugzwang', xRayAttack: 'Röntgenangriff',
  backRankMate: 'Grundreihenmatt', smotheredMate: 'Ersticktes Matt', promotion: 'Umwandlung',
  underPromotion: 'Unterverwandlung', enPassant: 'En passant', castling: 'Rochade',
  advancedPawn: 'Vorgerückter Bauer', capturingDefender: 'Verteidiger schlagen', exposedKing: 'Offener König',
  kingsideAttack: 'Königsangriff', queensideAttack: 'Damenflügelangriff', attackingF2F7: 'Angriff auf f2/f7',
  defensiveMove: 'Verteidigung', equality: 'Ausgleich', advantage: 'Vorteil', crushing: 'Klarer Gewinn',
  opening: 'Eröffnung', middlegame: 'Mittelspiel', endgame: 'Endspiel',
  rookEndgame: 'Turmendspiel', pawnEndgame: 'Bauernendspiel', queenEndgame: 'Damenendspiel',
  bishopEndgame: 'Läuferendspiel', knightEndgame: 'Springerendspiel', queenRookEndgame: 'Dame-Turm-Endspiel',
};

/** German names of the puzzle's motifs (unknown and length tags left out). */
export function themeNames(themes: string[]): string[] {
  return themes.map((t) => THEMES[t]).filter((t): t is string => !!t);
}
