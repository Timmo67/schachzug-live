import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import { localSan } from '../game/chessRules';
import { cpOf, evalText, reviewMoves, summarize, type Eval } from './analysisLogic';
import { CLASS_SYMBOL, CLASS_TEXT, explainMove, type MoveClass } from './explainLogic';
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

/** Buttons to step through the game (also with the arrow keys). */
function Nav({ ply, last, onSelect }: { ply: number; last: number; onSelect: (p: number) => void }) {
  return (
    <div className="row nav">
      <button type="button" aria-label="Zum Anfang" disabled={ply === 0} onClick={() => onSelect(0)}>⏮</button>
      <button type="button" aria-label="Zurück" disabled={ply === 0} onClick={() => onSelect(Math.max(0, ply - 1))}>◀</button>
      <span className="pos mono" data-testid="ply">{ply === 0 ? 'Start' : `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}`}</span>
      <button type="button" aria-label="Weiter" disabled={ply === last} onClick={() => onSelect(Math.min(last, ply + 1))}>▶</button>
      <button type="button" aria-label="Zum Ende" disabled={ply === last} onClick={() => onSelect(last)}>⏭</button>
    </div>
  );
}

/** Every move of the game, clickable; with grades once the analysis is done. */
function MoveTable({ sans, classes, ply, onSelect }: { sans: string[]; classes: MoveClass[] | null; ply: number; onSelect: (p: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [ply]);
  const cell = (i: number) => {
    if (i >= sans.length) return <span />;
    const cls = classes?.[i];
    return (
      <button type="button" className={`mv${ply === i + 1 ? ' on' : ''}${cls ? ` c-${cls}` : ''}`} onClick={() => onSelect(i + 1)}
        title={cls ? CLASS_TEXT[cls] : undefined}>
        {sans[i]}{cls && CLASS_SYMBOL[cls] && <b>{CLASS_SYMBOL[cls]}</b>}
      </button>
    );
  };
  const rows = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push(<span key={i} style={{ display: 'contents' }}><span className="n">{i / 2 + 1}.</span>{cell(i)}{cell(i + 1)}</span>);
  }
  return <div className="movetable" ref={box} data-testid="move-table">{rows}</div>;
}

export function AnalysisPanel({ moves, state, remaining, onStart, ply, onSelect, names }: Props) {
  const fens = useMemo(() => positions(moves), [moves]);
  const sans = useMemo(() => moves.map((m, i) => san(fens[i], m)), [moves, fens]);
  const evals = state.kind === 'done' && state.evals.length === moves.length + 1 ? state.evals : null;
  const reviews = useMemo(() => (evals ? reviewMoves(evals, moves) : []), [evals, moves]);
  const sum = useMemo(() => summarize(reviews), [reviews]);
  const nameW = names.w, nameB = names.b;
  const explained = useMemo(
    () => (evals ? reviews.map((r, i) => explainMove(fens[i], moves[i], evals[i], evals[i + 1], r, { w: nameW, b: nameB })) : null),
    [evals, reviews, fens, moves, nameW, nameB],
  );
  const classes = explained?.map((e) => e.cls) ?? null;

  // Arrow keys step through the moves (not while typing in the chat).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onSelect(Math.max(0, ply - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onSelect(Math.min(moves.length, ply + 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, moves.length, onSelect]);

  if (!evals || !explained) {
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
            <p className="note">Die Schach-Engine Stockfish bewertet jeden Zug und erklärt Fehler und bessere Züge – direkt auf deinem Gerät.</p>
            <button type="button" className="primary" onClick={onStart}>Partie analysieren</button>
            {remaining !== null && <p className="note">Gratis: noch {remaining} Analyse heute. Mit Plus unbegrenzt.</p>}
            {state.kind === 'error' && <p className="error" role="alert">{state.text}</p>}
          </>
        )}
        <span className="lbl">Partie nachspielen</span>
        <Nav ply={ply} last={moves.length} onSelect={onSelect} />
        <MoveTable sans={sans} classes={null} ply={ply} onSelect={onSelect} />
      </section>
    );
  }

  const current = ply > 0 ? reviews[ply - 1] : null;
  const info = ply > 0 ? explained[ply - 1] : null;
  const count = (c: 'w' | 'b', k: MoveClass) => explained.filter((e, i) => reviews[i].color === c && e.cls === k).length;
  const key = reviews.filter((r) => r.judgement);
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
            <span className="note counts">
              <span className="c-best">★ {count(c, 'best')}</span>
              <span className="c-inaccuracy">?! {sum[c].inaccuracy}</span>
              <span className="c-mistake">? {sum[c].mistake}</span>
              <span className="c-blunder">?? {sum[c].blunder}</span>
            </span>
          </div>
        ))}
      </div>
      <EvalGraph evals={evals} ply={ply} onSelect={onSelect} />
      <Nav ply={ply} last={moves.length} onSelect={onSelect} />

      <div className={`comment${info ? ` c-${info.cls}` : ''}`} data-testid="move-comment" aria-live="polite">
        {current && info ? (
          <>
            <div className="head">
              <b>{Math.ceil(current.ply / 2)}{current.color === 'w' ? '.' : '…'} {sans[current.ply - 1]}</b>
              <span className={`badge c-${info.cls}`}>{CLASS_SYMBOL[info.cls] && `${CLASS_SYMBOL[info.cls]} `}{CLASS_TEXT[info.cls]}</span>
            </div>
            <span className="note">{names[current.color]} · Bewertung {evalText(evals[current.ply - 1])} → {evalText(evals[current.ply])}</span>
            <ul>{info.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </>
        ) : (
          <span className="note">Ausgangsstellung. Mit ▶ oder den Pfeiltasten gehst du Zug für Zug durch die Partie; jeder Zug wird bewertet und erklärt.</span>
        )}
      </div>

      <span className="lbl">Alle Züge</span>
      <MoveTable sans={sans} classes={classes} ply={ply} onSelect={onSelect} />

      <span className="lbl">Wichtige Momente</span>
      <div className="list keymoves" data-testid="keymoves">
        {key.length === 0 && <p className="note">Keine groben Fehler – stark gespielt!</p>}
        {key.map((r) => (
          <button type="button" key={r.ply} className={`item${r.ply === ply ? ' on' : ''}`} onClick={() => onSelect(r.ply)}>
            <span>{Math.ceil(r.ply / 2)}{r.color === 'w' ? '.' : '…'} {sans[r.ply - 1]}<b className={`c-${r.judgement}`}>{CLASS_SYMBOL[r.judgement!]}</b></span>
            <span className="note">{names[r.color]}{r.best ? ` · besser ${san(fens[r.ply - 1], r.best)}` : ''}</span>
          </button>
        ))}
      </div>
      <p className="note">Analyse mit <Link to="/lizenzen">Stockfish</Link> (GPLv3). Grüner Pfeil = besserer Zug.</p>
    </section>
  );
}

