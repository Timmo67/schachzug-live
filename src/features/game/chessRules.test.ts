import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { captured, fromUci, kingInCheckSquare, localSan, movePairs, needsPromotion, result, statusText, tryMove } from './chessRules';

const SCHOLARS = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];

describe('chessRules', () => {
  it('rebuilds a game from UCI and detects checkmate', () => {
    const g = fromUci(SCHOLARS)!;
    expect(g).not.toBeNull();
    expect(result(g)).toEqual({ text: 'Schachmatt – Weiß gewinnt', winner: 'w' });
    expect(movePairs(g).at(-1)).toEqual([4, 'Qxf7#', '']);
  });

  it('rejects illegal or malformed moves', () => {
    expect(fromUci(['e2e5'])).toBeNull();
    expect(fromUci(['hello'])).toBeNull();
    const g = new Chess();
    expect(tryMove(g, 'e2', 'e5')).toBeNull();
    expect(tryMove(g, 'e2', 'e4')).toBe('e2e4');
  });

  it('reports resignation and check', () => {
    const g = fromUci(['e2e4', 'f7f6', 'd1h5'])!;
    expect(statusText(g)).toBe('Schwarz am Zug – Schach!');
    expect(kingInCheckSquare(g)).toBe('e8');
    expect(statusText(new Chess(), 'w')).toBe('Weiß gibt auf – Schwarz gewinnt');
  });

  it('detects promotion and stalemate', () => {
    const p = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1');
    expect(needsPromotion(p, 'a7', 'a8')).toBe(true);
    expect(tryMove(p, 'a7', 'a8', 'n')).toBe('a7a8n');
    const s = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(result(s)?.text).toBe('Remis durch Patt');
  });

  it('counts captured pieces', () => {
    const g = fromUci(SCHOLARS)!;
    expect(captured(g).w).toBe('♟︎');
    expect(captured(g).b).toBe('');
  });
});

describe('localSan', () => {
  it('uses the piece letters of the user’s language', () => {
    expect(localSan('Nf3', 'de-DE')).toBe('Sf3');
    expect(localSan('Qxf7#', 'de')).toBe('Dxf7#');
    expect(localSan('exd8=Q+', 'de-AT')).toBe('exd8=D+');
    expect(localSan('Bb5', 'de')).toBe('Lb5'); // the file b stays lower case
    expect(localSan('O-O', 'de')).toBe('O-O');
    expect(localSan('Rxe1', 'fr-FR')).toBe('Txe1');
    expect(localSan('Nf3', 'en-US')).toBe('Nf3');
  });
});
