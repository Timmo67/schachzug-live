import { useMemo, useState } from 'react';
import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { FILES, GLYPH, VS15, kingInCheckSquare, needsPromotion } from './chessRules';
import './board.css';

type Props = {
  game: Chess;
  orientation: Color;
  /** Whether the local user may move pieces of the side to move right now. */
  interactive: boolean;
  lastMove?: string | null;
  onMove: (from: Square, to: Square, promotion?: PieceSymbol) => void;
  /** Called when the user taps while not allowed to move (e.g. to show a hint). */
  onBlocked?: () => void;
};

const PROMO: PieceSymbol[] = ['q', 'r', 'b', 'n'];
const PROMO_NAME: Record<string, string> = { q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer' };

export function Board({ game, orientation, interactive, lastMove, onMove, onBlocked }: Props) {
  const [sel, setSel] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const fen = game.fen();

  const targets = useMemo(
    () => (sel ? game.moves({ square: sel, verbose: true }).map((m) => m.to) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fen identifies the position
    [sel, fen],
  );
  const checkSq = kingInCheckSquare(game);
  const flip = orientation === 'b';

  function click(sq: Square) {
    if (!interactive) { onBlocked?.(); return; }
    if (sel && targets.includes(sq)) {
      if (needsPromotion(game, sel, sq)) { setPromo({ from: sel, to: sq }); return; }
      onMove(sel, sq);
      setSel(null);
      return;
    }
    const p = game.get(sq);
    setSel(p && p.color === game.turn() && sel !== sq ? sq : null);
  }

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const fi = flip ? 7 - col : col;
      const ri = flip ? row : 7 - row;
      const sq = (FILES[fi] + (ri + 1)) as Square;
      const p = game.get(sq);
      const cls = ['sq', (fi + ri) % 2 ? 'l' : 'd'];
      if (lastMove && (lastMove.slice(0, 2) === sq || lastMove.slice(2, 4) === sq)) cls.push('last');
      if (sel === sq) cls.push('sel');
      if (checkSq === sq) cls.push('chk');
      const isTarget = targets.includes(sq);
      squares.push(
        <button
          key={sq}
          type="button"
          className={cls.join(' ')}
          data-square={sq}
          aria-label={sq + (p ? ` ${p.color === 'w' ? 'weiß' : 'schwarz'} ${p.type}` : '')}
          onClick={() => click(sq)}
        >
          {p && <span className={`pc ${p.color}`}>{GLYPH[p.type] + VS15}</span>}
          {isTarget && <span className={p ? 'ring' : 'dot'} />}
          {row === 7 && <span className="cf">{FILES[fi]}</span>}
          {col === 0 && <span className="cr">{ri + 1}</span>}
        </button>,
      );
    }
  }

  return (
    <div className="boardbox">
      <div className="board" role="grid" aria-label="Schachbrett">{squares}</div>
      {promo && (
        <div className="promo" onClick={(e) => { if (e.target === e.currentTarget) { setPromo(null); setSel(null); } }}>
          <div className="panel promo-box">
            {PROMO.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={PROMO_NAME[t]}
                onClick={() => { onMove(promo.from, promo.to, t); setPromo(null); setSel(null); }}
              >
                <span className={`pc ${game.turn()}`}>{GLYPH[t] + VS15}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
