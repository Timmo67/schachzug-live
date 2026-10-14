import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { Board, Captures } from './Board';
import { fromUci, movePairs, result, statusText, tryMove } from './chessRules';

/** Pass-and-play on one device. Online play (M2) reuses Board and chessRules. */
export function LocalGamePage() {
  const [moves, setMoves] = useState<string[]>([]);
  const [resigned, setResigned] = useState<Color | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [confirm, setConfirm] = useState<null | 'resign' | 'new'>(null);

  const game = fromUci(moves)!;
  const res = result(game, resigned);
  const bottom: Color = flipped ? 'b' : 'w';
  const top: Color = bottom === 'w' ? 'b' : 'w';

  function onMove(from: Square, to: Square, promotion?: PieceSymbol) {
    const g = fromUci(moves)!;
    const uci = tryMove(g, from, to, promotion);
    if (uci) setMoves([...moves, uci]);
  }

  function doConfirm() {
    if (confirm === 'resign') setResigned(game.turn());
    if (confirm === 'new') { setMoves([]); setResigned(null); }
    setConfirm(null);
  }

  return (
    <div className="game">
      <div className="boardcol">
        <div className="pbar">
          <div className="pname"><i className={`swatch ${top}`} />{top === 'w' ? 'Weiß' : 'Schwarz'}</div>
          <Captures game={game} color={top} />
        </div>
        <Board game={game} orientation={bottom} interactive={!res} lastMove={moves.at(-1)} onMove={onMove} />
        <div className="pbar">
          <div className="pname"><i className={`swatch ${bottom}`} />{bottom === 'w' ? 'Weiß' : 'Schwarz'}</div>
          <Captures game={game} color={bottom} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className={`status${res ? ' end' : ''}`} aria-live="polite" data-testid="status">{statusText(game, resigned)}</div>
          <div className="row">
            <button type="button" onClick={() => setFlipped(!flipped)}>Drehen</button>
            <button type="button" disabled={!!res} onClick={() => setConfirm('resign')}>Aufgeben</button>
            <button type="button" onClick={() => setConfirm('new')}>Neue Partie</button>
          </div>
        </div>
        {confirm && (
          <div className="row">
            <span>{confirm === 'resign' ? `${game.turn() === 'w' ? 'Weiß' : 'Schwarz'} gibt auf?` : 'Neue Partie starten?'}</span>
            <button type="button" className="primary" onClick={doConfirm}>Ja</button>
            <button type="button" onClick={() => setConfirm(null)}>Abbrechen</button>
          </div>
        )}
      </div>
      <aside className="panel">
        <h2>Züge</h2>
        <div className="moves" data-testid="moves">
          {moves.length === 0 && <><span className="n">–</span><span className="muted">noch keine</span><span /></>}
          {movePairs(game).map(([n, a, b]) => (
            <span key={n} style={{ display: 'contents' }}><span className="n">{n}.</span><span>{a}</span><span>{b}</span></span>
          ))}
        </div>
        <p className="note">Auf einem Gerät abwechselnd ziehen. Online gegen Freunde mit Video: unter <Link to="/partien">Partien</Link>.</p>
      </aside>
    </div>
  );
}
