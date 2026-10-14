import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { useDesign } from '../appearance/useDesign';
import { pieceUrl } from '../appearance/designs';
import { FILES, GLYPH, VS15, captured, kingInCheckSquare, materialLead, needsPromotion } from './chessRules';
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
  /** Arrow for a suggested move (UCI), e.g. the engine's better move in the analysis. */
  arrow?: string | null;
};

const PROMO: PieceSymbol[] = ['q', 'r', 'b', 'n'];
const PROMO_NAME: Record<string, string> = { q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer' };
/** Pointer travel (px) after which a press counts as a drag instead of a tap. */
const DRAG_START_PX = 6;

type Drag = { from: Square; x0: number; y0: number; x: number; y: number; active: boolean; size: number };

/** One piece in the chosen set: an SVG image, or the Unicode glyph for the "Schlicht" set. */
function Piece({ set, color, type, extra = '', style }: { set: string; color: Color; type: PieceSymbol; extra?: string; style?: CSSProperties }) {
  if (set === 'symbols') return <span className={`pc ${color} ${extra}`} style={style}>{GLYPH[type] + VS15}</span>;
  return <img className={`pc img ${extra}`} src={pieceUrl(set, color, type)} alt="" draggable={false} style={style} />;
}

function squareAt(x: number, y: number): Square | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-square]');
  return (el?.dataset.square as Square | undefined) ?? null;
}

export function Board({ game, orientation, interactive, lastMove, onMove, onBlocked, arrow }: Props) {
  const [sel, setSel] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const design = useDesign();
  const set = design.pieces.id;
  const boardStyle = design.board.light
    ? ({ '--sq-l': design.board.light, '--sq-d': design.board.dark } as CSSProperties)
    : undefined;
  const fen = game.fen();

  const targets = useMemo(
    () => (sel ? game.moves({ square: sel, verbose: true }).map((m) => m.to) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fen identifies the position
    [sel, fen],
  );
  const checkSq = kingInCheckSquare(game);
  const flip = orientation === 'b';

  function legal(from: Square, to: Square) {
    return game.moves({ square: from, verbose: true }).some((m) => m.to === to);
  }

  function play(from: Square, to: Square) {
    if (needsPromotion(game, from, to)) { setPromo({ from, to }); return; }
    onMove(from, to);
    setSel(null);
  }

  function click(sq: Square) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!interactive) { onBlocked?.(); return; }
    if (sel && targets.includes(sq)) { play(sel, sq); return; }
    const p = game.get(sq);
    setSel(p && p.color === game.turn() && sel !== sq ? sq : null);
  }

  // Drag & drop: press on an own piece, move, release over the target square. Short presses stay taps.
  function pointerDown(e: ReactPointerEvent<HTMLButtonElement>, sq: Square) {
    if (!interactive || e.button !== 0) return;
    const p = game.get(sq);
    if (!p || p.color !== game.turn()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: sq, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, size: e.currentTarget.offsetWidth });
  }

  function pointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const active = drag.active || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > DRAG_START_PX;
    if (active && !drag.active) setSel(drag.from);
    setDrag({ ...drag, x: e.clientX, y: e.clientY, active });
  }

  function pointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.active) return; // a tap: the click handler takes over
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const to = squareAt(e.clientX, e.clientY);
    if (to && to !== d.from && legal(d.from, to)) play(d.from, to);
    else setSel(null);
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
          onPointerDown={(e) => pointerDown(e, sq)}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          {p && <Piece set={set} color={p.color} type={p.type} extra={drag?.active && drag.from === sq ? 'lifted' : ''} />}
          {isTarget && <span className={p ? 'ring' : 'dot'} />}
          {row === 7 && <span className="cf">{FILES[fi]}</span>}
          {col === 0 && <span className="cr">{ri + 1}</span>}
        </button>,
      );
    }
  }

  return (
    <div className="boardbox">
      <div className={`board${interactive ? ' live' : ''}`} role="grid" aria-label="Schachbrett" style={boardStyle}
        data-design={`${design.board.id}/${set}`}>{squares}</div>
      {arrow && <Arrow uci={arrow} flip={flip} />}
      {drag?.active && (() => {
        const p = game.get(drag.from);
        return p && (
          <Piece set={set} color={p.color} type={p.type} extra="ghost"
            style={{ left: drag.x, top: drag.y, fontSize: drag.size * 0.82, width: drag.size * 0.95, height: drag.size * 0.95 }} />
        );
      })()}
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
                <Piece set={set} color={game.turn()} type={t} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Arrow from one square to another over the board (board units: one square = 1). */
function Arrow({ uci, flip }: { uci: string; flip: boolean }) {
  const at = (sq: string) => {
    const f = FILES.indexOf(sq[0]), r = Number(sq[1]) - 1;
    return flip ? { x: 7 - f + 0.5, y: r + 0.5 } : { x: f + 0.5, y: 7 - r + 0.5 };
  };
  const a = at(uci.slice(0, 2)), b = at(uci.slice(2, 4));
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!len) return null;
  // Stop short of the target centre so the head sits on the square.
  const ex = b.x - ((b.x - a.x) / len) * 0.35, ey = b.y - ((b.y - a.y) / len) * 0.35;
  return (
    <svg className="arrow" viewBox="0 0 8 8" aria-hidden="true" data-testid="best-arrow">
      <defs><marker id="arrowhead" markerWidth="3" markerHeight="3" refX="1.2" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3 z" /></marker></defs>
      <line x1={a.x} y1={a.y} x2={ex} y2={ey} markerEnd="url(#arrowhead)" />
    </svg>
  );
}

/** Pieces a side has captured, plus its material lead in points (e.g. "+3") when it is ahead. */
export function Captures({ game, color }: { game: Chess; color: Color }) {
  const lead = materialLead(game)[color];
  return (
    <span className="caps">
      {captured(game)[color]}
      {lead > 0 && <span className="lead" data-testid={`lead-${color}`} title={`${lead} Punkte mehr Material`}>+{lead}</span>}
    </span>
  );
}
