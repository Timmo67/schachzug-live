import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { errorText, supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { GLYPH, VS15 } from '../game/chessRules';
import { BOARD_THEMES, PIECE_SETS, pieceUrl, type BoardTheme, type PieceSet } from './designs';
import { useDesign } from './useDesign';
import './design.css';

function Swatch({ theme }: { theme: BoardTheme }) {
  const style = theme.light ? ({ '--sq-l': theme.light, '--sq-d': theme.dark } as CSSProperties) : undefined;
  return (
    <span className="swatch4" style={style} aria-hidden="true">
      <i className="l" /><i className="d" /><i className="d" /><i className="l" />
    </span>
  );
}

function PiecePreview({ set }: { set: PieceSet }) {
  const types = ['k', 'q', 'n'] as const;
  return (
    <span className="piecerow" aria-hidden="true">
      {types.map((t) => set.id === 'symbols'
        ? <span key={t} className="pc w">{GLYPH[t] + VS15}</span>
        : <img key={t} src={pieceUrl(set.id, 'w', t)} alt="" />)}
      {set.id === 'symbols'
        ? <span className="pc b">{GLYPH.n + VS15}</span>
        : <img src={pieceUrl(set.id, 'b', 'n')} alt="" />}
    </span>
  );
}

/** Choose board colours and piece set. Plus designs are shown with a lock for free users. */
export function DesignPage() {
  const { session, profile, entitlement, refresh } = useAuth();
  const design = useDesign();
  const hasPlus = !!entitlement && entitlement.plan !== 'free';
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function choose(patch: { board_theme?: string; piece_set?: string }, plus: boolean) {
    setMsg(null);
    if (!session || !profile || !supabase) { setMsg({ ok: false, text: 'Bitte melde dich an, um ein Design zu speichern.' }); return; }
    if (plus && !hasPlus) { setMsg({ ok: false, text: 'Dieses Design gibt es mit Plus. Lade einen Freund ein – dann bekommst du 30 Tage Plus geschenkt.' }); return; }
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
    if (error) setMsg({ ok: false, text: errorText(error) });
    else { await refresh(); setMsg({ ok: true, text: 'Gespeichert.' }); }
  }

  return (
    <div className="grid2">
      <section className="panel">
        <h1>Design</h1>
        <span className="lbl">Brett</span>
        <div className="designs" role="radiogroup" aria-label="Brett">
          {BOARD_THEMES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={design.board.id === t.id}
              className={`design${design.board.id === t.id ? ' on' : ''}${t.plus && !hasPlus ? ' locked' : ''}`}
              onClick={() => void choose({ board_theme: t.id }, t.plus)}>
              <Swatch theme={t} />
              <span>{t.name}</span>
              {t.plus && <span className="pill accent">Plus</span>}
            </button>
          ))}
        </div>
        <span className="lbl">Figuren</span>
        <div className="designs" role="radiogroup" aria-label="Figuren">
          {PIECE_SETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={design.pieces.id === p.id}
              className={`design${design.pieces.id === p.id ? ' on' : ''}${p.plus && !hasPlus ? ' locked' : ''}`}
              onClick={() => void choose({ piece_set: p.id }, p.plus)}>
              <PiecePreview set={p} />
              <span>{p.name}</span>
              {p.plus && <span className="pill accent">Plus</span>}
            </button>
          ))}
        </div>
        {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}
        {!session && <p className="note"><Link to="/anmelden">Melde dich an</Link>, um dein Design zu speichern.</p>}
      </section>
      <section className="panel">
        <h2>Vorschau</h2>
        <p className="note">So sieht dein Brett in Partien aus. Probier es auch unter <Link to="/spielen">Spielen</Link> aus.</p>
        <div className="preview">
          <Swatch theme={design.board} />
          <PiecePreview set={design.pieces} />
        </div>
        <span className="lbl">Figuren-Lizenzen</span>
        <ul className="note credits">
          <li>Klassisch: Alexis Luengas, Apache 2.0</li>
          <li>Keltisch, Fantasy, Modern: Maurizio Monge, MIT</li>
          <li>Rhos: RhosGFX, CC0</li>
          <li>Scherenschnitt: Nikolay Anzarov, CC BY 4.0</li>
        </ul>
        <p className="note"><a href="/pieces/CREDITS.md" target="_blank" rel="noreferrer">Lizenztexte</a></p>
      </section>
    </div>
  );
}
