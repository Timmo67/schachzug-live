import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import { localSan } from '../game/chessRules';
import {
  JUDGEMENT_SYMBOL, JUDGEMENT_TEXT, cpOf, evalText, reviewMoves, summarize, type Eval,
} from './analysisLogic';
import { positions, type AnalysisState } from './useAnalysis';
import './analysis.css';

type Props = {
  moves: string[];
  state: AnalysisState;
  remaining: number | null;
  onStart: () => void;
  ply: number;
  onSelect: (ply: number) => void;
  names: { w: string; b: string };
};

/** SAN of a UCI move in the given position, in the user's notation. */
function san(fen: string, uci: string): string {
  try { return localSan(new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san); } catch { return uci; }
}

const H = 80;
/** Evaluation over the game; White's advantage up, Black's down. Clicking jumps to that move. */
function EvalGraph({ evals, ply, onSelect }: { evals: Eval[]; ply: number; onSelect: (p: number) => void }) {
  const n = Math.max(1, evals.length - 1);
  const y = (e: Eval) => H / 2 - (Math.max(-600, Math.min(600, cpOf(e))) / 600) * (H / 2 - 2);
  const pts = evals.map((e, i) => `${(i / n) * 100},${y(e).toFixed(1)}`).join(' ');
  return (
    <svg className="evalgraph" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label="Bewertungsverlauf"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSelect(Math.round(((e.clientX - r.left) / r.width) * n));
      }}>
      <polygon className="adv" points={`0,${H} ${pts} 100,${H}`} />
      <line x1="0" x2="100" y1={H / 2} y2={H / 2} className="mid" />
      <line x1={(ply / n) * 100} x2={(ply / n) * 100} y1="0" y2={H} className="cursor" />
    </svg>
  );
}

export function AnalysisPanel({ moves, state, remaining, onStart, ply, onSelect, names }: Props) {
  const fens = useMemo(() => positions(moves), [moves]);
  const evals = state.kind === 'done' ? state.evals : null;
  const reviews = useMemo(() => (evals ? reviewMoves(evals, moves) : []), [evals, moves]);
  const sum = useMemo(() => summarize(reviews), [reviews]);

  if (!evals) {
    return (
      <section className="analysis" data-testid="analysis">
        <h2>Analyse</h2>
        {state.kind === 'running' ? (
          <>
            <p className="note">Die Schach-Engine prüft jeden Zug … {state.done} / {state.total}</p>
            <progress max={state.total} value={state.done} aria-label="Fortschritt der Analyse" />
          </>
        ) : (
          <>
            <p className="note">Die Schach-Engine Stockfish zeigt dir Fehler, Patzer und bessere Züge – direkt auf deinem Gerät.</p>
            <button type="button" className="primary" onClick={onStart}>Partie analysieren</button>
            {remaining !== null && <p className="note">Gratis: noch {remaining} Analyse heute. Mit Plus unbegrenzt.</p>}
            {state.kind === 'error' && <p className="error" role="alert">{state.text}</p>}
          </>
        )}
      </section>
    );
  }

  const current = ply > 0 ? reviews[ply - 1] : null;
  return (
    <section className="analysis" data-testid="analysis">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Analyse</h2>
        <span className="pill mono" data-testid="eval">{evalText(evals[ply] ?? {})}</span>
      </div>
      <div className="accuracy">
        {(['w', 'b'] as const).map((c) => (
          <div key={c} data-testid={`accuracy-${c}`}>
            <span className="lbl">{names[c]}</span>
            <b>{sum[c].accuracy} %</b>
            <span className="note">Genauigkeit</span>
            <span className="note">{sum[c].inaccuracy} ?! · {sum[c].mistake} ? · {sum[c].blunder} ??</span>
          </div>
        ))}
      </div>
      <EvalGraph evals={evals} ply={ply} onSelect={onSelect} />
      <div className="row nav">
        <button type="button" aria-label="Zum Anfang" onClick={() => onSelect(0)}>⏮</button>
        <button type="button" aria-label="Zurück" onClick={() => onSelect(Math.max(0, ply - 1))}>◀</button>
        <button type="button" aria-label="Weiter" onClick={() => onSelect(Math.min(moves.length, ply + 1))}>▶</button>
        <button type="button" aria-label="Zum Ende" onClick={() => onSelect(moves.length)}>⏭</button>
      </div>
      {current && (
        <p className="note" data-testid="move-comment">
          {Math.ceil(current.ply / 2)}{current.color === 'w' ? '.' : '…'} {san(fens[current.ply - 1], moves[current.ply - 1])}
          {current.judgement && <> – <b className={`j-${current.judgement}`}>{JUDGEMENT_TEXT[current.judgement]}</b></>}
          {current.best && current.judgement && <>. Besser war <b>{san(fens[current.ply - 1], current.best)}</b>.</>}
        </p>
      )}
      <span className="lbl">Wichtige Momente</span>
      <div className="list keymoves" data-testid="keymoves">
        {reviews.filter((r) => r.judgement).length === 0 && <p className="note">Keine groben Fehler – stark gespielt!</p>}
        {reviews.filter((r) => r.judgement).map((r) => (
          <button type="button" key={r.ply} className={`item${r.ply === ply ? ' on' : ''}`} onClick={() => onSelect(r.ply)}>
            <span>{Math.ceil(r.ply / 2)}{r.color === 'w' ? '.' : '…'} {san(fens[r.ply - 1], moves[r.ply - 1])}<b className={`j-${r.judgement}`}>{JUDGEMENT_SYMBOL[r.judgement!]}</b></span>
            <span className="note">{names[r.color]}{r.best ? ` · besser ${san(fens[r.ply - 1], r.best)}` : ''}</span>
          </button>
        ))}
      </div>
      <p className="note">Analyse mit <Link to="/lizenzen">Stockfish</Link> (GPLv3).</p>
    </section>
  );
}
