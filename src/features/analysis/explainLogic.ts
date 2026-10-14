import { Chess, type Color, type PieceSymbol } from 'chess.js';
import { localSan, material } from '../game/chessRules';
import type { Eval, MoveReview } from './analysisLogic';

// Pure rules (unit-tested): a grade for every move and a short explanation in plain German, derived from
// the engine evaluations, the engine's main line and the material it wins or loses.

export type MoveClass = 'forced' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const CLASS_TEXT: Record<MoveClass, string> = {
  forced: 'Einziger Zug', best: 'Bester Zug', excellent: 'Sehr gut', good: 'Gut',
  inaccuracy: 'Ungenauigkeit', mistake: 'Fehler', blunder: 'Patzer',
};
export const CLASS_SYMBOL: Record<MoveClass, string> = {
  forced: '□', best: '★', excellent: '!', good: '', inaccuracy: '?!', mistake: '?', blunder: '??',
};

const PIECE: Record<PieceSymbol, string> = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
const PIECE_ACC: Record<PieceSymbol, string> = { p: 'einen Bauern', n: 'einen Springer', b: 'einen Läufer', r: 'einen Turm', q: 'die Dame', k: 'den König' };

/** "einen Bauern", "eine Figur", "einen Turm", … for a material swing in points. */
export function materialText(points: number): string {
  if (points <= 1) return 'einen Bauern';
  if (points === 2) return 'zwei Bauern';
  if (points === 3 || points === 4) return 'eine Figur';
  if (points === 5 || points === 6) return 'einen Turm';
  if (points >= 9) return 'die Dame';
  return `${points} Punkte Material`;
}

function balance(g: Chess, c: Color): number {
  const m = material(g);
  return c === 'w' ? m.w - m.b : m.b - m.w;
}

/** Plays a line from a position; stops at the first illegal move. Returns SAN (user's notation) and the end position. */
export function playLine(fen: string, ucis: string[], max = 99): { sans: string[]; end: Chess; first?: ReturnType<Chess['move']> } {
  const g = new Chess(fen);
  const sans: string[] = [];
  let first: ReturnType<Chess['move']> | undefined;
  for (const u of ucis.slice(0, max)) {
    try {
      const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      first ??= m;
      sans.push(localSan(m.san));
    } catch { break; }
  }
  return { sans, end: g, first };
}

/** Writes a line with move numbers, e.g. "12. Sf5 Dxf5 13. exf5" or "12… Dxf5 13. exf5". */
export function lineText(fen: string, sans: string[]): string {
  const [, turn, , , , full] = fen.split(' ');
  let n = Number(full) || 1;
  let white = turn === 'w';
  const out: string[] = [];
  sans.forEach((s, i) => {
    if (white) out.push(`${n}. ${s}`);
    else out.push(i === 0 ? `${n}… ${s}` : s);
    if (!white) n++;
    white = !white;
  });
  return out.join(' ');
}

const mateFor = (e: Eval, c: Color): number | null =>
  e.mate !== undefined && e.mate !== 0 && (c === 'w' ? e.mate > 0 : e.mate < 0) ? Math.abs(e.mate) : null;

export type Explanation = { cls: MoveClass; lines: string[]; bestSan?: string };

/**
 * Grade and explanation of one move. `fenBefore` is the position before the move, `before`/`after` the
 * evaluations of the positions before and after it, `names` the players' names.
 */
export function explainMove(fenBefore: string, move: string, before: Eval, after: Eval, review: MoveReview, names: Record<Color, string>): Explanation {
  const c = review.color;
  const o: Color = c === 'w' ? 'b' : 'w';
  const pos = new Chess(fenBefore);
  const legal = pos.moves().length;
  const played = playLine(fenBefore, [move]);
  const m = played.first;
  const fenAfter = played.end.fen();
  const lines: string[] = [];

  const cls: MoveClass = legal === 1 ? 'forced'
    : review.judgement ?? (!review.best ? 'best' : review.winBefore - review.winAfter < 2 ? 'excellent' : 'good');
  const bestLine = review.best ? playLine(fenBefore, before.pv?.[0] === review.best ? before.pv : [review.best], 5) : null;
  const bestSan = bestLine?.sans[0];

  if (played.end.isCheckmate()) return { cls: 'best', lines: ['Schachmatt!'] };
  if (cls === 'forced') return { cls, lines: ['Der einzige mögliche Zug.'] };

  // What the move does.
  if (m) {
    if (m.isKingsideCastle() || m.isQueensideCastle()) lines.push('Rochade – der König steht sicherer und der Turm kommt ins Spiel.');
    else if (m.promotion) lines.push(`Der Bauer wird zur ${PIECE[m.promotion]}.`);
    else if (m.captured) lines.push(`Schlägt ${PIECE_ACC[m.captured]} auf ${m.to}.`);
    if (m.san.includes('+')) lines.push('Gibt Schach.');
  }

  // Mates: found, missed, or allowed.
  const mateBefore = mateFor(before, c);
  const mateAfterMine = mateFor(after, c);
  const mateAfterOpp = mateFor(after, o);
  if (mateBefore) {
    if (cls === 'best' || cls === 'excellent') lines.push(`Führt zum Matt (Matt in ${mateBefore}).`);
    else if (mateAfterMine) lines.push(`Gewinnt weiter – aber mit ${bestSan} ging es schneller (Matt in ${mateBefore}).`);
    else if (bestLine) lines.push(`Hier gab es ein Matt in ${mateBefore}: ${lineText(fenBefore, bestLine.sans)}. Übersehen.`);
  }
  if (mateAfterOpp && !mateFor(before, o) && after.pv) {
    const threat = playLine(fenAfter, after.pv, 5);
    lines.push(`Damit kann ${names[o]} mattsetzen: ${lineText(fenAfter, threat.sans)}.`);
  }

  if (cls === 'best') lines.push('Der stärkste Zug – genau das, was die Engine auch spielt.');
  else if (cls === 'excellent') lines.push(`Fast so stark wie der beste Zug${bestSan ? ` (${bestSan})` : ''}.`);
  else if (cls === 'good') lines.push(`Ein solider Zug. Etwas genauer war ${bestSan}.`);

  // Material the opponent wins after a weak move.
  if (review.judgement && !mateAfterOpp && after.pv) {
    const reply = playLine(fenAfter, after.pv, 4);
    const loss = balance(pos, c) - balance(reply.end, c);
    if (loss >= 2 && reply.sans.length) {
      const hit = reply.first?.captured;
      lines.push(hit
        ? `${hit === 'q' ? 'Die' : 'Der'} ${PIECE[hit]} auf ${reply.first!.to} ist nicht ausreichend geschützt: ${lineText(fenAfter, reply.sans)} – ${names[c]} verliert ${materialText(loss)}.`
        : `Danach gewinnt ${names[o]} Material: ${lineText(fenAfter, reply.sans)} – ${names[c]} verliert ${materialText(loss)}.`);
    }
  }

  // The better move and why.
  if (review.judgement && bestLine && bestSan && !(mateBefore && !mateAfterMine)) {
    const gain = balance(bestLine.end, c) - balance(pos, c);
    const cont = bestLine.sans.length > 1 ? `: ${lineText(fenBefore, bestLine.sans)}` : '';
    if (gain >= 2) lines.push(`Besser war ${bestSan}${cont} – das gewinnt ${materialText(gain)}.`);
    else if (bestSan.includes('+')) lines.push(`Besser war ${bestSan} mit Schach${cont}.`);
    else lines.push(`Besser war ${bestSan}${cont}.`);
  }

  // How the game changed.
  if (review.judgement && !mateAfterOpp && !mateBefore) {
    if (review.winBefore >= 70 && review.winAfter < 55) lines.push(`Damit gibt ${names[c]} den Vorteil aus der Hand.`);
    else if (review.winBefore >= 30 && review.winAfter < 15) lines.push(`Danach steht ${names[c]} klar schlechter.`);
  }

  return { cls, lines, bestSan };
}
