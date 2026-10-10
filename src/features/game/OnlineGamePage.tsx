import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Board } from './Board';
import { captured, fromUci, movePairs, tryMove } from './chessRules';
import { clocksAt } from '../../../supabase/functions/_shared/gameLogic';
import {
  downloadPgn, fetchGame, formatClock, gameAction, gameErrorText, respondGame, resultText, sendMove,
  timeControlLabel, type GameRow,
} from './onlineGame';

type Message = { id: number; sender_id: string; body: string; created_at: string };

export function OnlineGamePage() {
  const { id = '' } = useParams();
  const { session, ready } = useAuth();
  const me = session?.user.id;
  const [game, setGame] = useState<GameRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [chat, setChat] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const claimed = useRef<number>(-1);

  // Only accept rows that are at least as new as what we have (Realtime and responses can race).
  const accept = useCallback((g: GameRow | null) => {
    if (!g) return;
    setGame((cur) => (cur && cur.id === g.id && cur.version > g.version ? cur : g));
  }, []);

  const reload = useCallback(async () => {
    const g = await fetchGame(id);
    if (!g) { setMissing(true); return; }
    accept(g);
  }, [id, accept]);

  const loadChat = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('game_messages').select('id, sender_id, body, created_at')
      .eq('game_id', id).order('id').limit(200);
    setChat((data ?? []) as Message[]);
  }, [id]);

  // Live updates; on every (re)subscribe fetch the full state, so a reload or lost connection catches up.
  useEffect(() => {
    if (!supabase || !me) return;
    const client = supabase;
    const ch = client.channel(`game:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` },
        (p) => accept(p.new as GameRow))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_messages', filter: `game_id=eq.${id}` },
        (p) => setChat((c) => (c.some((m) => m.id === (p.new as Message).id) ? c : [...c, p.new as Message])))
      .subscribe((status) => { if (status === 'SUBSCRIBED') { void reload(); void loadChat(); } });
    const wake = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      void client.removeChannel(ch);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [id, me, accept, reload, loadChat]);

  const whiteId = game?.white_id;
  const blackId = game?.black_id;
  useEffect(() => {
    if (!supabase || !whiteId || !blackId) return;
    void supabase.from('profiles').select('id, display_name').in('id', [whiteId, blackId]).then(({ data }) =>
      setNames(Object.fromEntries((data ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name]))));
  }, [whiteId, blackId]);

  const ticking = game?.status === 'active' && game.base_ms !== null;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [ticking]);

  const clocks = game ? clocksAt(game, now) : { w: null, b: null };
  const turn: Color = (game?.moves_uci.length ?? 0) % 2 === 0 ? 'w' : 'b';
  const flagFell = ticking && (turn === 'w' ? clocks.w : clocks.b) === 0;

  // When the side to move runs out of time, either player's client asks the server to end the game.
  useEffect(() => {
    if (!game || !flagFell || claimed.current === game.version) return;
    claimed.current = game.version;
    void gameAction(game.id, 'claim_timeout').then(() => reload());
  }, [flagFell, game, reload]);

  if (ready && !session) return <Navigate to="/anmelden" replace />;
  if (missing) return <div className="panel"><h2>Partie nicht gefunden</h2><Link to="/partien">Zu deinen Partien</Link></div>;
  if (!game || !me) return <div className="panel"><p className="muted">Partie wird geladen …</p></div>;

  const myColor: Color | null = me === game.white_id ? 'w' : me === game.black_id ? 'b' : null;
  const moves = pending ? [...game.moves_uci, pending] : game.moves_uci;
  const chess = fromUci(moves) ?? fromUci(game.moves_uci)!;
  const caps = captured(chess);
  const bottom: Color = (myColor ?? 'w') === 'w' ? (flipped ? 'b' : 'w') : (flipped ? 'w' : 'b');
  const top: Color = bottom === 'w' ? 'b' : 'w';
  const active = game.status === 'active';
  const myTurn = active && myColor === turn && !pending && !flagFell;
  const opponentId = myColor === 'w' ? game.black_id : game.white_id;
  const name = (c: Color) => names[(c === 'w' ? game.white_id : game.black_id) ?? ''] ?? (c === 'w' ? 'Weiß' : 'Schwarz');
  const drawOfferedByOpponent = active && !!game.draw_offer_by && game.draw_offer_by !== me;
  const drawOfferedByMe = active && game.draw_offer_by === me;

  async function onMove(from: Square, to: Square, promotion?: PieceSymbol) {
    if (!game) return;
    const uci = tryMove(fromUci(game.moves_uci)!, from, to, promotion);
    if (!uci) return;
    setPending(uci);
    setMsg(null);
    const r = await sendMove(game.id, uci);
    setPending(null);
    if (r.game) accept(r.game);
    else { setMsg(gameErrorText(r.error ?? '')); void reload(); }
  }

  async function act(fn: () => Promise<string | null>) {
    setMsg(null);
    const err = await fn();
    if (err) setMsg(gameErrorText(err));
    void reload();
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!supabase || !body || !me) return;
    setDraft('');
    const { error } = await supabase.from('game_messages').insert({ game_id: id, sender_id: me, body: body.slice(0, 300) });
    if (error) setMsg('Nachricht konnte nicht gesendet werden.');
  }

  const status = game.status === 'waiting'
    ? (game.created_by === me ? `Warte, bis ${names[opponentId ?? ''] ?? 'dein Freund'} annimmt …` : 'Du wurdest herausgefordert.')
    : game.status === 'active'
      ? `${myTurn || pending ? 'Du bist' : `${name(turn)} ist`} am Zug${chess.inCheck() ? ' – Schach!' : ''}`
      : resultText(game, me);

  const clockOf = (c: Color) => (
    <span className={`clock${active && turn === c && game.moves_uci.length >= 2 ? ' run' : ''}${(c === 'w' ? clocks.w : clocks.b) !== null && (c === 'w' ? clocks.w! : clocks.b!) < 20_000 ? ' low' : ''}`}
      data-testid={`clock-${c}`}>
      {formatClock(c === 'w' ? clocks.w : clocks.b)}
    </span>
  );

  return (
    <div className="game">
      <div className="boardcol">
        <div className="pbar">
          <div className="pname"><i className={`swatch ${top}`} />{name(top)}</div>
          <span className="caps">{caps[top]}</span>
          {clockOf(top)}
        </div>
        <Board game={chess} orientation={bottom} interactive={myTurn} lastMove={moves.at(-1)} onMove={onMove}
          onBlocked={() => active && setMsg(myColor ? 'Warte auf den Zug deines Gegners.' : null)} />
        <div className="pbar">
          <div className="pname"><i className={`swatch ${bottom}`} />{name(bottom)}</div>
          <span className="caps">{caps[bottom]}</span>
          {clockOf(bottom)}
        </div>
        <div className={`status${game.status === 'finished' || game.status === 'aborted' ? ' end' : ''}`} aria-live="polite" data-testid="status">{status}</div>
        {msg && <p className="error" role="status">{msg}</p>}

        {game.status === 'waiting' && (
          <div className="row">
            {game.created_by === me
              ? <button type="button" onClick={() => act(() => respondGame(game.id, 'cancel'))}>Herausforderung zurückziehen</button>
              : <>
                  <button type="button" className="primary" onClick={() => act(() => respondGame(game.id, 'accept'))}>Annehmen</button>
                  <button type="button" onClick={() => act(() => respondGame(game.id, 'decline'))}>Ablehnen</button>
                </>}
          </div>
        )}

        {drawOfferedByOpponent && (
          <div className="row">
            <span>{name(myColor === 'w' ? 'b' : 'w')} bietet Remis an.</span>
            <button type="button" className="primary" onClick={() => act(() => gameAction(game.id, 'accept_draw'))}>Remis annehmen</button>
            <button type="button" onClick={() => act(() => gameAction(game.id, 'decline_draw'))}>Ablehnen</button>
          </div>
        )}

        <div className="row">
          <button type="button" onClick={() => setFlipped(!flipped)}>Drehen</button>
          {active && myColor && (
            <>
              <button type="button" disabled={!!game.draw_offer_by} onClick={() => act(() => gameAction(game.id, 'offer_draw'))}>
                {drawOfferedByMe ? 'Remis angeboten' : 'Remis anbieten'}
              </button>
              <button type="button" onClick={() => setConfirmResign(true)}>Aufgeben</button>
            </>
          )}
          {(game.status === 'finished' || game.moves_uci.length > 0) && (
            <button type="button" onClick={() => downloadPgn(game, name('w'), name('b'))}>PGN herunterladen</button>
          )}
        </div>
        {confirmResign && active && (
          <div className="row">
            <span>Wirklich aufgeben?</span>
            <button type="button" className="primary" onClick={() => { setConfirmResign(false); void act(() => gameAction(game.id, 'resign')); }}>Ja, aufgeben</button>
            <button type="button" onClick={() => setConfirmResign(false)}>Abbrechen</button>
          </div>
        )}
      </div>

      <aside className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Züge</h2>
          <span className="pill">{timeControlLabel(game.time_control)}</span>
        </div>
        <div className="moves" data-testid="moves">
          {moves.length === 0 && <><span className="n">–</span><span className="muted">noch keine</span><span /></>}
          {movePairs(chess).map(([n, a, b]) => (
            <span key={n} style={{ display: 'contents' }}><span className="n">{n}.</span><span>{a}</span><span>{b}</span></span>
          ))}
        </div>

        <span className="lbl">Chat</span>
        <div className="chat" data-testid="chat">
          {chat.length === 0 && <p className="note">Noch keine Nachrichten.</p>}
          {chat.map((m) => (
            <p key={m.id} className={m.sender_id === me ? 'mine' : ''}>
              <b>{m.sender_id === me ? 'Du' : names[m.sender_id] ?? 'Gegner'}:</b> {m.body}
            </p>
          ))}
        </div>
        <form className="row" onSubmit={sendChat}>
          <input aria-label="Nachricht" value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} placeholder="Nachricht …" style={{ flex: 1 }} />
          <button type="submit" disabled={!draft.trim()}>Senden</button>
        </form>
        <Link to="/partien" className="note">← Alle Partien</Link>
      </aside>
    </div>
  );
}
